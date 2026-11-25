import "server-only";
import { planearDatosFiscales, type DatosFiscales } from "@/lib/documentos-fiscales";
import { esViolacionUnica } from "@/lib/formularios";
import { siguienteNumero } from "@/lib/numeracion";
import type { Db } from "@/lib/tenant";
import { registrarCambio } from "@/lib/auditoria";
import { aplicarMovimiento, MovimientoRechazado, type Actor } from "@/lib/inventario/movimientos";
import { ContaError } from "@/lib/contabilidad/servicio";
import { contabilizarNotaCompra, contabilizarNotaVenta, revertirNotaCompra, revertirNotaVenta } from "@/lib/contabilidad/automatico";
import { numeroFactura } from "@/lib/facturacion/estados";
import { numeroFacturaCompra } from "@/lib/cxp/estados";
import { hoyCaracas } from "@/lib/tasas";
import { calcularLinea, numeroNotaCompra, numeroNotaVenta } from "./estados";

// Notas de crédito y débito. La factura original no se toca: acumula un `ajuste` y su `saldo` se mueve con un UPDATE atómico condicionado (un crédito nunca deja el
// saldo en negativo; un débito solo se deshace si no se ha cobrado). Todo en una transacción junto con el inventario (devoluciones) y el asiento contable.

export type ResultadoNota<T = object> = ({ ok: true } & T) | { ok: false; error: string };
class NotaError extends Error {}

async function ejecutar<T>(trabajo: () => Promise<ResultadoNota<T>>): Promise<ResultadoNota<T>> {
  try {
    return await trabajo();
  } catch (e) {
    if (e instanceof NotaError || e instanceof ContaError) return { ok: false, error: e.message };
    if (e instanceof MovimientoRechazado) return { ok: false, error: Object.values(e.errores)[0] ?? "No se pudo mover el inventario." };
    throw e;
  }
}

const redondear4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;
const decimales = (n: number) => (String(n).split(".")[1] ?? "").length;
const fmt = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

function validarBase(base: number) {
  if (!Number.isFinite(base) || base <= 0 || base > 1e12) throw new NotaError("El monto debe ser mayor que 0.");
  if (decimales(base) > 4) throw new NotaError("El monto admite máximo 4 decimales.");
}

// ===================== NOTAS DE VENTA =====================
export type DatosNotaVenta = {
  tipo: string;
  modo: string;
  facturaId: string;
  motivo: string;
  almacenId?: string | null;
  lineas?: { facturaLineaId: string; cantidad: number }[];
  base?: number;
  ivaPorcentaje?: number;
};

export async function crearNotaVenta(db: Db, actor: Actor, d: DatosNotaVenta): Promise<ResultadoNota<{ id: string; numero: number; texto: string }>> {
  return ejecutar(async () => {
    if (d.motivo.trim().length < 3) throw new NotaError("Escribe el motivo de la nota.");
    const combinacion = `${d.tipo}/${d.modo}`;
    if (!["CREDITO/DEVOLUCION", "CREDITO/AJUSTE", "DEBITO/CARGO"].includes(combinacion)) throw new NotaError("Tipo de nota inválido.");

    const r = await db.$transaction(async (tx) => {
      const f = await tx.factura.findUnique({ where: { id: d.facturaId }, include: { lineas: true } });
      if (!f) throw new NotaError("La factura no existe.");
      if (f.estado !== "EMITIDA") throw new NotaError("La factura está anulada: no admite notas.");
      const tasa = Number(f.tasaUsd);

      const lineasNota: { linea: number; facturaLineaId: string; productoCodigo: string; descripcion: string; cantidad: number; precioUnitario: number; descuento: number; ivaPorcentaje: number; total: number; costoUnitario: number }[] = [];
      let subtotal = 0, iva = 0, ivaPorcentaje: number | null = null;

      if (d.modo === "DEVOLUCION") {
        if (!d.almacenId) throw new NotaError("Elige el almacén al que regresa la mercancía.");
        const alm = await tx.almacen.findUnique({ where: { id: d.almacenId }, select: { activo: true } });
        if (!alm?.activo) throw new NotaError("El almacén no existe o está inactivo.");
        const pedidas = (d.lineas ?? []).filter((l) => l.cantidad > 0);
        if (pedidas.length === 0) throw new NotaError("Indica la cantidad a devolver de al menos una línea.");
        if (new Set(pedidas.map((l) => l.facturaLineaId)).size !== pedidas.length) throw new NotaError("Hay una línea repetida.");
        for (const p of pedidas) {
          const fl = f.lineas.find((x) => x.id === p.facturaLineaId);
          if (!fl) throw new NotaError("Una línea no pertenece a esta factura.");
          if (!Number.isFinite(p.cantidad) || decimales(p.cantidad) > 4) throw new NotaError(`${fl.productoCodigo}: la cantidad admite máximo 4 decimales.`);
          const previa = await tx.notaVentaLinea.aggregate({ where: { facturaLineaId: fl.id, nota: { estado: "ACTIVA" } }, _sum: { cantidad: true } });
          const devolvible = redondear4(Number(fl.cantidad) - Number(previa._sum.cantidad ?? 0));
          if (p.cantidad > devolvible) throw new NotaError(`${fl.productoCodigo}: solo se pueden devolver ${fmt(devolvible)} (se vendieron ${fmt(Number(fl.cantidad))}).`);
          const c = calcularLinea({ cantidad: p.cantidad, costoUnitario: Number(fl.precioUnitario), descuento: Number(fl.descuento), ivaPorcentaje: Number(fl.ivaPorcentaje) });
          subtotal += c.neto;
          iva += c.iva;
          lineasNota.push({ linea: lineasNota.length + 1, facturaLineaId: fl.id, productoCodigo: fl.productoCodigo, descripcion: fl.descripcion, cantidad: p.cantidad, precioUnitario: Number(fl.precioUnitario), descuento: Number(fl.descuento), ivaPorcentaje: Number(fl.ivaPorcentaje), total: c.total, costoUnitario: Number(fl.costoUnitario) });
        }
      } else {
        validarBase(d.base ?? NaN);
        const pct = d.ivaPorcentaje ?? NaN;
        if (!Number.isFinite(pct) || pct < 0 || pct > 100) throw new NotaError("Elige la alícuota de IVA.");
        const valida = pct === 0 || (await tx.alicuotaIva.findFirst({ where: { activo: true, porcentajeVenta: pct }, select: { id: true } }));
        if (!valida) throw new NotaError("La alícuota de IVA no está configurada.");
        subtotal = d.base as number;
        iva = (subtotal * pct) / 100;
        ivaPorcentaje = pct;
      }
      subtotal = redondear4(subtotal);
      iva = redondear4(iva);
      const total = redondear4(subtotal + iva);

      // Efecto sobre la factura, atómico: un crédito solo procede si el saldo alcanza.
      if (d.tipo === "CREDITO") {
        const u = await tx.factura.updateMany({ where: { id: f.id, estado: "EMITIDA", saldo: { gte: total } }, data: { ajuste: { decrement: total }, saldo: { decrement: total } } });
        if (u.count === 0) {
          const x = await tx.factura.findUniqueOrThrow({ where: { id: f.id }, select: { saldo: true } });
          throw new NotaError(`El crédito (${fmt(total)} USD) supera lo que aún se debe de ${numeroFactura(f.numero)} (${fmt(Number(x.saldo))} USD). Si ya se cobró, anula primero ese cobro.`);
        }
      } else {
        const u = await tx.factura.updateMany({ where: { id: f.id, estado: "EMITIDA" }, data: { ajuste: { increment: total }, saldo: { increment: total } } });
        if (u.count === 0) throw new NotaError("La factura cambió de estado. Recarga la página.");
      }

      const nota = await tx.notaVenta.create({
        data: {
          numero: await siguienteNumero(tx, d.tipo === "CREDITO" ? "NOTA_CREDITO" : "NOTA_DEBITO"), tipo: d.tipo, modo: d.modo, facturaId: f.id, clienteId: f.clienteId, almacenId: d.modo === "DEVOLUCION" ? d.almacenId : null, fecha: hoyCaracas(), motivo: d.motivo.trim(),
          subtotal, iva, total, ivaPorcentaje, tasaUsd: tasa, creadoPorId: actor.id, creadoPorNombre: actor.nombre, lineas: { create: lineasNota },
        },
        select: { id: true, numero: true },
      });
      const texto = numeroNotaVenta(d.tipo, nota.numero);
      if (d.modo === "DEVOLUCION") {
        // La mercancía vuelve al almacén como ajuste sobrante (no altera el costo promedio).
        for (const l of lineasNota) await aplicarMovimiento(tx, actor, { tipo: "AJUSTE_POSITIVO", almacenId: d.almacenId as string, productoCodigo: l.productoCodigo, cantidad: l.cantidad, documento: texto, motivo: `Devolución sobre ${numeroFactura(f.numero)}: ${d.motivo.trim().slice(0, 120)}` });
      }
      await contabilizarNotaVenta(tx, actor, nota.id);
      return { ...nota, texto, factura: numeroFactura(f.numero) };
    });
    await registrarCambio(db, actor, { modulo: "facturacion", entidad: "nota_venta", entidadId: r.id, descripcion: r.texto, accion: "crear", despues: { tipo: d.tipo, modo: d.modo, factura: r.factura, motivo: d.motivo.trim() } });
    return { ok: true, id: r.id, numero: r.numero, texto: r.texto };
  });
}

export async function anularNotaVenta(db: Db, actor: Actor, id: string, motivo: string): Promise<ResultadoNota> {
  return ejecutar(async () => {
    const m = motivo.trim();
    if (m.length < 3) throw new NotaError("Indica el motivo de la anulación.");
    const texto = await db.$transaction(async (tx) => {
      const u = await tx.notaVenta.updateMany({ where: { id, estado: "ACTIVA" }, data: { estado: "ANULADA", anuladaEn: new Date(), anuladaPorNombre: actor.nombre, motivoAnulacion: m.slice(0, 500) } });
      if (u.count === 0) throw new NotaError("La nota ya está anulada o no existe. Recarga la página.");
      const n = await tx.notaVenta.findUniqueOrThrow({ where: { id }, include: { lineas: true } });
      const total = Number(n.total);
      if (n.tipo === "CREDITO") {
        await tx.factura.update({ where: { id: n.facturaId }, data: { ajuste: { increment: total }, saldo: { increment: total } } });
      } else {
        // Un débito solo se deshace si aún no se cobró.
        const r = await tx.factura.updateMany({ where: { id: n.facturaId, saldo: { gte: total } }, data: { ajuste: { decrement: total }, saldo: { decrement: total } } });
        if (r.count === 0) throw new NotaError("Ese cargo ya fue cobrado total o parcialmente: anula primero los cobros de la factura.");
      }
      if (n.modo === "DEVOLUCION" && n.almacenId) {
        for (const l of n.lineas) await aplicarMovimiento(tx, actor, { tipo: "SALIDA", almacenId: n.almacenId, productoCodigo: l.productoCodigo, cantidad: Number(l.cantidad), documento: numeroNotaVenta(n.tipo, n.numero), motivo: `Anulación de la devolución: ${m.slice(0, 120)}` });
      }
      await revertirNotaVenta(tx, actor, n.tipo, n.numero);
      return numeroNotaVenta(n.tipo, n.numero);
    });
    await registrarCambio(db, actor, { modulo: "facturacion", entidad: "nota_venta", entidadId: id, descripcion: texto, accion: "otro", despues: { estado: "ANULADA", motivo: m } });
    return { ok: true };
  });
}

/** Datos fiscales de una nota de venta (los da la máquina fiscal o la imprenta). Cada uno se registra una sola vez. */
export async function registrarDatosFiscalesNota(db: Db, actor: Actor, id: string, d: DatosFiscales): Promise<ResultadoNota> {
  return ejecutar(async () => {
    try {
      const r = await db.$transaction(async (tx) => {
        const n = await tx.notaVenta.findUnique({ where: { id }, select: { numero: true, tipo: true, estado: true, numeroFiscal: true, numeroControl: true, impresoraSerial: true, impresoraModelo: true } });
        if (!n) throw new NotaError("La nota ya no existe.");
        if (n.estado !== "ACTIVA") throw new NotaError("La nota está anulada.");
        const plan = planearDatosFiscales(n, d);
        if ("error" in plan) throw new NotaError(plan.error);
        const fiscal = plan.datos.numeroFiscal ?? n.numeroFiscal;
        const serial = plan.datos.impresoraSerial ?? n.impresoraSerial;
        if (fiscal && (await tx.notaVenta.findFirst({ where: { tipo: n.tipo, numeroFiscal: fiscal, impresoraSerial: serial, id: { not: id } }, select: { id: true } }))) throw new NotaError(`El número ${fiscal} ya está en otra nota de ese tipo y esa impresora.`);
        if (plan.datos.numeroControl && (await tx.notaVenta.findFirst({ where: { numeroControl: plan.datos.numeroControl, id: { not: id } }, select: { id: true } }))) throw new NotaError(`El número de control ${plan.datos.numeroControl} ya está en otra nota.`);
        const u = await tx.notaVenta.updateMany({ where: { id, estado: "ACTIVA", ...plan.vacios }, data: plan.datos });
        if (u.count === 0) throw new NotaError("La nota cambió mientras la veías. Recarga la página.");
        return { texto: numeroNotaVenta(n.tipo, n.numero), datos: plan.datos };
      });
      await registrarCambio(db, actor, { modulo: "facturacion", entidad: "nota_venta", entidadId: id, descripcion: r.texto, accion: "editar", despues: r.datos });
      return { ok: true };
    } catch (e) {
      if (esViolacionUnica(e)) return { ok: false, error: "Ese número fiscal o de control ya está en otra nota." };
      throw e;
    }
  });
}

// ===================== NOTAS DE COMPRA =====================
export type DatosNotaCompra = { tipo: string; facturaId: string; documento: string; numeroControl: string | null; fecha: Date; motivo: string; subtotal: number; iva: number };

export async function crearNotaCompra(db: Db, actor: Actor, d: DatosNotaCompra): Promise<ResultadoNota<{ id: string; numero: number; texto: string }>> {
  return ejecutar(async () => {
    if (d.tipo !== "CREDITO" && d.tipo !== "DEBITO") throw new NotaError("Tipo de nota inválido.");
    if (d.motivo.trim().length < 3) throw new NotaError("Escribe el motivo de la nota.");
    if (!d.documento.trim()) throw new NotaError("Indica el número de la nota del proveedor.");
    validarBase(d.subtotal);
    if (!Number.isFinite(d.iva) || d.iva < 0 || decimales(d.iva) > 4 || d.iva > 1e12) throw new NotaError("El IVA debe ser un monto válido (hasta 4 decimales).");
    if (d.fecha.getTime() > hoyCaracas().getTime()) throw new NotaError("La fecha de la nota no puede ser futura.");
    const total = redondear4(d.subtotal + d.iva);

    const r = await db.$transaction(async (tx) => {
      const f = await tx.facturaCompra.findUnique({ where: { id: d.facturaId }, select: { id: true, numero: true, proveedorId: true, estado: true, tasaUsd: true } });
      if (!f) throw new NotaError("La factura no existe.");
      if (f.estado !== "REGISTRADA") throw new NotaError("La factura está anulada: no admite notas.");
      const repetida = await tx.notaCompra.findUnique({ where: { proveedorId_documento: { proveedorId: f.proveedorId, documento: d.documento.trim() } }, select: { numero: true } });
      if (repetida) throw new NotaError(`Este proveedor ya tiene registrada la nota ${d.documento.trim()}.`);
      if (d.tipo === "CREDITO") {
        const u = await tx.facturaCompra.updateMany({ where: { id: f.id, estado: "REGISTRADA", saldo: { gte: total } }, data: { ajuste: { decrement: total }, saldo: { decrement: total } } });
        if (u.count === 0) {
          const x = await tx.facturaCompra.findUniqueOrThrow({ where: { id: f.id }, select: { saldo: true } });
          throw new NotaError(`El crédito (${fmt(total)} USD) supera lo que aún se debe de ${numeroFacturaCompra(f.numero)} (${fmt(Number(x.saldo))} USD). Si ya se pagó, anula primero ese pago.`);
        }
      } else {
        const u = await tx.facturaCompra.updateMany({ where: { id: f.id, estado: "REGISTRADA" }, data: { ajuste: { increment: total }, saldo: { increment: total } } });
        if (u.count === 0) throw new NotaError("La factura cambió de estado. Recarga la página.");
      }
      const nota = await tx.notaCompra.create({
        data: { tipo: d.tipo, facturaId: f.id, proveedorId: f.proveedorId, documento: d.documento.trim(), numeroControl: d.numeroControl, fecha: d.fecha, motivo: d.motivo.trim(), subtotal: d.subtotal, iva: d.iva, total, tasaUsd: Number(f.tasaUsd), creadoPorId: actor.id, creadoPorNombre: actor.nombre },
        select: { id: true, numero: true },
      });
      await contabilizarNotaCompra(tx, actor, nota.id);
      return { ...nota, texto: numeroNotaCompra(d.tipo, nota.numero), factura: numeroFacturaCompra(f.numero) };
    });
    await registrarCambio(db, actor, { modulo: "cxp", entidad: "nota_compra", entidadId: r.id, descripcion: r.texto, accion: "crear", despues: { tipo: d.tipo, factura: r.factura, documento: d.documento.trim(), motivo: d.motivo.trim() } });
    return { ok: true, id: r.id, numero: r.numero, texto: r.texto };
  });
}

export async function anularNotaCompra(db: Db, actor: Actor, id: string, motivo: string): Promise<ResultadoNota> {
  return ejecutar(async () => {
    const m = motivo.trim();
    if (m.length < 3) throw new NotaError("Indica el motivo de la anulación.");
    const texto = await db.$transaction(async (tx) => {
      const u = await tx.notaCompra.updateMany({ where: { id, estado: "ACTIVA" }, data: { estado: "ANULADA", anuladaEn: new Date(), anuladaPorNombre: actor.nombre, motivoAnulacion: m.slice(0, 500) } });
      if (u.count === 0) throw new NotaError("La nota ya está anulada o no existe. Recarga la página.");
      const n = await tx.notaCompra.findUniqueOrThrow({ where: { id } });
      const total = Number(n.total);
      if (n.tipo === "CREDITO") {
        await tx.facturaCompra.update({ where: { id: n.facturaId }, data: { ajuste: { increment: total }, saldo: { increment: total } } });
      } else {
        const r = await tx.facturaCompra.updateMany({ where: { id: n.facturaId, saldo: { gte: total } }, data: { ajuste: { decrement: total }, saldo: { decrement: total } } });
        if (r.count === 0) throw new NotaError("Ese cargo ya fue pagado total o parcialmente: anula primero los pagos de la factura.");
      }
      await revertirNotaCompra(tx, actor, n.tipo, n.numero);
      return numeroNotaCompra(n.tipo, n.numero);
    });
    await registrarCambio(db, actor, { modulo: "cxp", entidad: "nota_compra", entidadId: id, descripcion: texto, accion: "otro", despues: { estado: "ANULADA", motivo: m } });
    return { ok: true };
  });
}
