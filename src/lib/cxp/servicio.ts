import "server-only";
import type { Db } from "@/lib/tenant";
import { registrarCambio } from "@/lib/auditoria";
import type { Actor } from "@/lib/inventario/movimientos";
import { hoyCaracas, tasaVigente } from "@/lib/tasas";
import { aplicarMovimientoCuenta, TesoreriaRechazada } from "@/lib/tesoreria/movimientos";
import { contabilizarFacturaCompra, contabilizarPago, revertirFacturaCompra, revertirPago } from "@/lib/contabilidad/automatico";
import { ContaError } from "@/lib/contabilidad/servicio";
import { FORMAS_PAGO, numeroFacturaCompra, numeroPago } from "./estados";

// Servicio de cuentas por pagar. Espejo de Cuentas por cobrar: un pago baja el saldo de sus facturas con un UPDATE atómico condicionado, y anular un
// pago restituye exactamente lo que aplicó. Una factura de proveedor con pagos vigentes no se anula hasta anular esos pagos.

export type ResultadoCxp<T = object> = ({ ok: true } & T) | { ok: false; error: string };
class CxpError extends Error {}

const redondear2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const decimales = (n: number) => (String(n).split(".")[1] ?? "").length;

async function ejecutar<T>(trabajo: () => Promise<ResultadoCxp<T>>): Promise<ResultadoCxp<T>> {
  try {
    return await trabajo();
  } catch (e) {
    if (e instanceof CxpError || e instanceof TesoreriaRechazada || e instanceof ContaError) return { ok: false, error: e.message };
    throw e;
  }
}

export type DatosFacturaCompra = {
  proveedorId: string;
  ordenId: string | null;
  documento: string;
  numeroControl: string | null;
  fecha: Date;
  diasCredito: number;
  subtotal: number;
  iva: number;
  observaciones: string | null;
};

export async function registrarFacturaCompra(db: Db, actor: Actor, d: DatosFacturaCompra): Promise<ResultadoCxp<{ id: string; numero: number }>> {
  return ejecutar(async () => {
    for (const [campo, v] of [["La base", d.subtotal], ["El IVA", d.iva]] as const) {
      if (!Number.isFinite(v) || v < 0 || v > 1e12 || decimales(v) > 4) throw new CxpError(`${campo} debe ser un monto válido (hasta 4 decimales).`);
    }
    if (!(d.subtotal > 0)) throw new CxpError("La base de la factura debe ser mayor que 0.");
    if (!Number.isInteger(d.diasCredito) || d.diasCredito < 0 || d.diasCredito > 365) throw new CxpError("Los días de crédito deben ser un entero entre 0 y 365.");
    if (d.fecha.getTime() > hoyCaracas().getTime()) throw new CxpError("La fecha de la factura no puede ser futura.");
    const total = Math.round((d.subtotal + d.iva) * 10000) / 10000;
    const vence = new Date(d.fecha.getTime() + d.diasCredito * 86_400_000);

    const r = await db.$transaction(async (tx) => {
      const p = await tx.proveedor.findUnique({ where: { id: d.proveedorId }, select: { activo: true } });
      if (!p || !p.activo) throw new CxpError("El proveedor no existe o está inactivo.");
      if (d.ordenId) {
        const o = await tx.ordenCompra.findUnique({ where: { id: d.ordenId }, select: { proveedorId: true, estado: true } });
        if (!o || o.proveedorId !== d.proveedorId) throw new CxpError("La orden de compra no es de este proveedor.");
        if (o.estado === "ANULADA" || o.estado === "BORRADOR") throw new CxpError("La orden de compra no está emitida.");
      }
      const repetida = await tx.facturaCompra.findUnique({ where: { proveedorId_documento: { proveedorId: d.proveedorId, documento: d.documento } }, select: { numero: true } });
      if (repetida) throw new CxpError(`Este proveedor ya tiene la factura ${d.documento} registrada (${numeroFacturaCompra(repetida.numero)}).`);
      const tasa = await tasaVigente(tx as unknown as Db, "USD", d.fecha);
      if (!tasa) throw new CxpError("No hay tasa del dólar cargada a la fecha de la factura: regístrala en Tasa de cambio.");
      const creada = await tx.facturaCompra.create({
        data: {
          tasaUsd: tasa.valor, proveedorId: d.proveedorId, ordenId: d.ordenId, documento: d.documento, numeroControl: d.numeroControl, fecha: d.fecha, diasCredito: d.diasCredito,
          fechaVencimiento: vence, subtotal: d.subtotal, iva: d.iva, total, saldo: total, observaciones: d.observaciones, creadoPorId: actor.id, creadoPorNombre: actor.nombre,
        },
        select: { id: true, numero: true },
      });
      await contabilizarFacturaCompra(tx, actor, creada.id);
      return creada;
    });
    await registrarCambio(db, actor, { modulo: "cxp", entidad: "factura_compra", entidadId: r.id, descripcion: numeroFacturaCompra(r.numero), accion: "crear", despues: { documento: d.documento, totalUsd: total, diasCredito: d.diasCredito } });
    return { ok: true, id: r.id, numero: r.numero };
  });
}

export async function anularFacturaCompra(db: Db, actor: Actor, id: string, motivo: string): Promise<ResultadoCxp> {
  return ejecutar(async () => {
    const m = motivo.trim();
    if (m.length < 3) throw new CxpError("Indica el motivo de la anulación.");
    const numero = await db.$transaction(async (tx) => {
      const u = await tx.facturaCompra.updateMany({ where: { id, estado: "REGISTRADA" }, data: { estado: "ANULADA", saldo: 0, anuladaEn: new Date(), anuladaPorNombre: actor.nombre, motivoAnulacion: m.slice(0, 500) } });
      if (u.count === 0) throw new CxpError("La factura ya está anulada o no existe. Recarga la página.");
      // Con pagos vigentes no se anula: primero se anula el pago (así el saldo y la caja siempre cuadran).
      if ((await tx.pagoAplicacion.count({ where: { facturaId: id, pago: { estado: "REGISTRADO" } } })) > 0) throw new CxpError("La factura tiene pagos registrados: anula primero esos pagos.");
      if ((await tx.notaCompra.count({ where: { facturaId: id, estado: "ACTIVA" } })) > 0) throw new CxpError("La factura tiene notas del proveedor vigentes: anúlalas primero.");
      const n = (await tx.facturaCompra.findUniqueOrThrow({ where: { id }, select: { numero: true } })).numero;
      await revertirFacturaCompra(tx, actor, n);
      return n;
    });
    await registrarCambio(db, actor, { modulo: "cxp", entidad: "factura_compra", entidadId: id, descripcion: numeroFacturaCompra(numero), accion: "otro", despues: { estado: "ANULADA", motivo: m } });
    return { ok: true };
  });
}

export type DatosPago = {
  proveedorId: string;
  formaPago: string;
  moneda: string;
  /// Cuenta de tesorería de la que sale el dinero; debe ser de la misma moneda en que se paga.
  cuentaId: string;
  referencia: string | null;
  observaciones: string | null;
  aplicaciones: { facturaId: string; montoUsd: number }[];
};

export async function registrarPago(db: Db, actor: Actor, d: DatosPago): Promise<ResultadoCxp<{ id: string; numero: number }>> {
  return ejecutar(async () => {
    if (!(d.formaPago in FORMAS_PAGO)) throw new CxpError("Forma de pago inválida.");
    if (d.moneda !== "USD" && d.moneda !== "VES") throw new CxpError("Moneda inválida.");
    const aplic = d.aplicaciones.filter((a) => a.montoUsd > 0);
    if (aplic.length === 0) throw new CxpError("Indica cuánto se paga al menos a una factura.");
    if (aplic.length > 200) throw new CxpError("Máximo 200 facturas por pago.");
    if (new Set(aplic.map((a) => a.facturaId)).size !== aplic.length) throw new CxpError("Hay una factura repetida.");
    for (const a of aplic) if (!Number.isFinite(a.montoUsd) || decimales(a.montoUsd) > 4 || a.montoUsd > 1e12) throw new CxpError("Los montos admiten hasta 4 decimales.");

    const r = await db.$transaction(async (tx) => {
      const prov = await tx.proveedor.findUnique({ where: { id: d.proveedorId }, select: { id: true } });
      if (!prov) throw new CxpError("El proveedor no existe.");
      const montoUsd = Math.round(aplic.reduce((s, a) => s + a.montoUsd, 0) * 10000) / 10000;
      let tasa: number | null = null;
      if (d.moneda === "VES") {
        const t = await tasaVigente(tx as unknown as Db, "USD");
        if (!t) throw new CxpError("No hay tasa del dólar cargada para convertir el pago en bolívares.");
        tasa = t.valor;
      }
      const montoMoneda = d.moneda === "VES" ? redondear2(montoUsd * (tasa as number)) : redondear2(montoUsd);
      if (!(montoMoneda > 0)) throw new CxpError("El monto es demasiado pequeño.");
      for (const a of aplic) {
        const u = await tx.facturaCompra.updateMany({ where: { id: a.facturaId, proveedorId: d.proveedorId, estado: "REGISTRADA", saldo: { gte: a.montoUsd } }, data: { saldo: { decrement: a.montoUsd } } });
        if (u.count === 0) {
          const f = await tx.facturaCompra.findUnique({ where: { id: a.facturaId }, select: { numero: true, estado: true, saldo: true, proveedorId: true } });
          if (!f || f.proveedorId !== d.proveedorId) throw new CxpError("Una factura no pertenece a este proveedor.");
          if (f.estado !== "REGISTRADA") throw new CxpError(`${numeroFacturaCompra(f.numero)} está anulada.`);
          throw new CxpError(`${numeroFacturaCompra(f.numero)}: solo se debe ${Number(f.saldo)} USD.`);
        }
      }
      const cuenta = await tx.cuentaTesoreria.findUnique({ where: { id: d.cuentaId }, select: { moneda: true, activo: true, codigo: true } });
      if (!cuenta || !cuenta.activo) throw new CxpError("Elige una cuenta de tesorería activa.");
      if (cuenta.moneda !== d.moneda) throw new CxpError(`La cuenta ${cuenta.codigo} es en ${cuenta.moneda}: no sirve para un pago en ${d.moneda}.`);
      const p = await tx.pagoProveedor.create({
        data: {
          cuentaId: d.cuentaId, proveedorId: d.proveedorId, fecha: hoyCaracas(), formaPago: d.formaPago, moneda: d.moneda, montoMoneda, tasaUsd: tasa, montoUsd,
          referencia: d.referencia, observaciones: d.observaciones, creadoPorId: actor.id, creadoPorNombre: actor.nombre,
          aplicaciones: { create: aplic.map((a) => ({ facturaId: a.facturaId, montoUsd: a.montoUsd })) },
        },
        select: { id: true, numero: true },
      });
      await aplicarMovimientoCuenta(tx, actor, { cuentaId: d.cuentaId, tipo: "PAGO", monto: montoMoneda, documento: numeroPago(p.numero), descripcion: `Pago a proveedor${d.referencia ? ` · ref. ${d.referencia}` : ""}` });
      await contabilizarPago(tx, actor, p.id);
      return { ...p, montoUsd, montoMoneda };
    });
    await registrarCambio(db, actor, { modulo: "cxp", entidad: "pago_proveedor", entidadId: r.id, descripcion: numeroPago(r.numero), accion: "crear", despues: { formaPago: d.formaPago, moneda: d.moneda, montoMoneda: r.montoMoneda, montoUsd: r.montoUsd, facturas: aplic.length } });
    return { ok: true, id: r.id, numero: r.numero };
  });
}

export async function anularPago(db: Db, actor: Actor, id: string, motivo: string): Promise<ResultadoCxp> {
  return ejecutar(async () => {
    const m = motivo.trim();
    if (m.length < 3) throw new CxpError("Indica el motivo de la anulación.");
    const numero = await db.$transaction(async (tx) => {
      const u = await tx.pagoProveedor.updateMany({ where: { id, estado: "REGISTRADO" }, data: { estado: "ANULADO", anuladoEn: new Date(), anuladoPorNombre: actor.nombre, motivoAnulacion: m.slice(0, 500) } });
      if (u.count === 0) throw new CxpError("El pago ya está anulado o no existe. Recarga la página.");
      const p = await tx.pagoProveedor.findUniqueOrThrow({ where: { id }, include: { aplicaciones: true } });
      for (const a of p.aplicaciones) await tx.facturaCompra.update({ where: { id: a.facturaId }, data: { saldo: { increment: a.montoUsd } } });
      if (p.cuentaId) await aplicarMovimientoCuenta(tx, actor, { cuentaId: p.cuentaId, tipo: "ANULACION_PAGO", monto: Number(p.montoMoneda), documento: numeroPago(p.numero), descripcion: `Anulación: ${m.slice(0, 120)}` });
      await revertirPago(tx, actor, p.numero);
      return p.numero;
    });
    await registrarCambio(db, actor, { modulo: "cxp", entidad: "pago_proveedor", entidadId: id, descripcion: numeroPago(numero), accion: "otro", despues: { estado: "ANULADO", motivo: m } });
    return { ok: true };
  });
}
