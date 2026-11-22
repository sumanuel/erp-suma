import "server-only";
import type { Db } from "@/lib/tenant";
import { registrarCambio } from "@/lib/auditoria";
import { aplicarMovimiento, MovimientoRechazado, type Actor } from "@/lib/inventario/movimientos";
import { descuentoEfectivo, descuentoGlobal } from "@/lib/pedidos/calculos";
import { tasaVigente } from "@/lib/tasas";
import { calcularLinea, calcularTotales, numeroOrden, numeroRecepcion, redondear4 } from "./calculos";

// Servicio de compras. Cada operación es una transacción: o queda completa o no queda nada. La recepción es la ÚNICA vía por la que una
// compra mueve inventario, y lo hace con aplicarMovimiento() para que el saldo y el kardex sigan siendo coherentes.

/// `descuento` es el descuento 1 de la línea; el 2 y el 3 son opcionales. El costo va en la moneda de la orden.
export type LineaOrden = { productoCodigo: string; cantidad: number; costoUnitario: number; descuento: number; descuento2?: number; descuento3?: number; arancelId?: string | null };
/** Condiciones de la orden: el proveedor las propone, se pueden cambiar. Con moneda VES los costos van en bolívares. */
export type EncabezadoCompra = { condicionPagoId: string | null; transporteId: string | null; centroCostoId: string | null; referencia: string | null; moneda: "USD" | "VES"; valorCambio?: number | null; descuentos: [number, number, number] };
export const ENCABEZADO_COMPRA_VACIO: EncabezadoCompra = { condicionPagoId: null, transporteId: null, centroCostoId: null, referencia: null, moneda: "USD", valorCambio: null, descuentos: [0, 0, 0] };
const decimales = (n: number) => (String(n).split(".")[1] ?? "").length;
export type DatosOrden = { proveedorId: string; fecha: Date; fechaEsperada: Date | null; observaciones: string | null; lineas: LineaOrden[]; encabezado?: EncabezadoCompra };
export type ResultadoCompra<T = object> = ({ ok: true } & T) | { ok: false; error: string };

class ComprasError extends Error {}

type Tx = Parameters<Parameters<Db["$transaction"]>[0]>[0];

/** Valida proveedor, condiciones y productos y devuelve las líneas listas para guardar (con descripción, IVA, descuento efectivo y total calculados). */
async function prepararLineas(tx: Tx, d: DatosOrden) {
  const proveedor = await tx.proveedor.findUnique({ where: { id: d.proveedorId }, select: { activo: true } });
  if (!proveedor || !proveedor.activo) throw new ComprasError("El proveedor no existe o está inactivo.");
  if (d.lineas.length === 0) throw new ComprasError("Agrega al menos un producto.");
  if (d.lineas.length > 500) throw new ComprasError("Máximo 500 líneas por orden.");
  const codigos = d.lineas.map((l) => l.productoCodigo);
  if (new Set(codigos).size !== codigos.length) throw new ComprasError("Hay un producto repetido: suma sus cantidades en una sola línea.");

  // Encabezado: condiciones, moneda y descuentos del documento.
  const e = d.encabezado ?? ENCABEZADO_COMPRA_VACIO;
  for (const [i, x] of e.descuentos.entries()) if (!Number.isFinite(x) || x < 0 || x > 100) throw new ComprasError(`El descuento del documento ${i + 1} debe estar entre 0 y 100.`);
  if (e.condicionPagoId && !(await tx.condicionPago.findUnique({ where: { id: e.condicionPagoId }, select: { activo: true } }))?.activo) throw new ComprasError("La condición de pago no existe o está inactiva.");
  if (e.transporteId && !(await tx.transporte.findUnique({ where: { id: e.transporteId }, select: { activo: true } }))?.activo) throw new ComprasError("El transporte no existe o está inactivo.");
  if (e.centroCostoId && !(await tx.centroCosto.findUnique({ where: { id: e.centroCostoId }, select: { activo: true } }))?.activo) throw new ComprasError("El centro de costo no existe o está inactivo.");
  if (e.moneda !== "USD" && e.moneda !== "VES") throw new ComprasError("Moneda inválida.");
  let valorCambio: number | null = null;
  if (e.moneda === "VES") {
    valorCambio = e.valorCambio ?? (await tasaVigente(tx as unknown as Db, "USD"))?.valor ?? null;
    if (!valorCambio || !(valorCambio > 0) || decimales(valorCambio) > 8) throw new ComprasError("Indica el valor de cambio (bolívares por dólar): no hay tasa cargada.");
  }
  const global = descuentoGlobal(e.descuentos);

  const productos = await tx.producto.findMany({ where: { codigo: { in: codigos } }, include: { alicuotaIva: { select: { porcentajeCompra: true } } } });
  const porCodigo = new Map(productos.map((p) => [p.codigo, p]));
  const aranceles = new Map((await tx.arancel.findMany({ where: { id: { in: d.lineas.map((l) => l.arancelId).filter((x): x is string => !!x) } }, select: { id: true, porcentaje: true } })).map((a) => [a.id, Number(a.porcentaje)]));
  const lineas = d.lineas.map((l, i) => {
    const p = porCodigo.get(l.productoCodigo);
    if (!p) throw new ComprasError(`El producto ${l.productoCodigo} no existe.`);
    if (!p.activo) throw new ComprasError(`El producto ${l.productoCodigo} está inactivo.`);
    if (!(l.cantidad > 0) || l.cantidad > 1e9) throw new ComprasError(`Línea ${i + 1}: la cantidad debe ser mayor que 0.`);
    if (l.costoUnitario < 0 || l.costoUnitario > 1e9) throw new ComprasError(`Línea ${i + 1}: costo inválido.`);
    const des = [l.descuento, l.descuento2 ?? 0, l.descuento3 ?? 0];
    for (const x of des) if (!Number.isFinite(x) || x < 0 || x > 100) throw new ComprasError(`Línea ${i + 1}: los descuentos deben estar entre 0 y 100.`);
    if (l.arancelId && !aranceles.has(l.arancelId)) throw new ComprasError(`Línea ${i + 1}: el arancel no existe.`);
    // El costo se escribe en la moneda de la orden; se guarda en USD (con el valor de cambio) y, si es en bolívares, también el original.
    const costoUsd = valorCambio ? redondear4(l.costoUnitario / valorCambio) : l.costoUnitario;
    const efectivo = descuentoEfectivo(descuentoGlobal(des), global);
    const ivaPorcentaje = Number(p.alicuotaIva.porcentajeCompra);
    const calc = calcularLinea({ cantidad: l.cantidad, costoUnitario: costoUsd, descuento: efectivo, ivaPorcentaje });
    return {
      linea: i + 1, productoCodigo: l.productoCodigo, descripcion: p.descripcion, cantidad: l.cantidad, costoUnitario: costoUsd, costoMoneda: valorCambio ? l.costoUnitario : null,
      descuento: efectivo, descuento1: des[0], descuento2: des[1], descuento3: des[2], arancelId: l.arancelId ?? null, arancelPct: l.arancelId ? aranceles.get(l.arancelId)! : 0,
      ivaPorcentaje, total: calc.total, _e: { cantidad: l.cantidad, costoUnitario: costoUsd, descuento: efectivo, ivaPorcentaje },
    };
  });
  return { lineas, columnas: { condicionPagoId: e.condicionPagoId, transporteId: e.transporteId, centroCostoId: e.centroCostoId, referencia: e.referencia?.trim().slice(0, 60) || null, moneda: e.moneda, valorCambio, descuentoGlobal1: e.descuentos[0], descuentoGlobal2: e.descuentos[1], descuentoGlobal3: e.descuentos[2] } };
}

async function ejecutar<T>(db: Db, trabajo: () => Promise<ResultadoCompra<T>>): Promise<ResultadoCompra<T>> {
  try {
    return await trabajo();
  } catch (e) {
    if (e instanceof ComprasError) return { ok: false, error: e.message };
    if (e instanceof MovimientoRechazado) return { ok: false, error: Object.values(e.errores)[0] ?? "No se pudo mover el inventario." };
    throw e;
  }
}

export async function guardarOrden(db: Db, actor: Actor, id: string | null, d: DatosOrden): Promise<ResultadoCompra<{ id: string; numero: number }>> {
  return ejecutar(db, async () => {
    const r = await db.$transaction(async (tx) => {
      const { lineas: preparadas, columnas } = await prepararLineas(tx, d);
      const lineas = preparadas;
      const t = calcularTotales(lineas.map((l) => l._e));
      const filas = lineas.map((l) => ({ linea: l.linea, productoCodigo: l.productoCodigo, descripcion: l.descripcion, cantidad: l.cantidad, costoUnitario: l.costoUnitario, costoMoneda: l.costoMoneda, descuento: l.descuento, descuento1: l.descuento1, descuento2: l.descuento2, descuento3: l.descuento3, arancelId: l.arancelId, arancelPct: l.arancelPct, ivaPorcentaje: l.ivaPorcentaje, total: l.total }));
      if (id) {
        const actual = await tx.ordenCompra.findUnique({ where: { id }, select: { estado: true } });
        if (!actual) throw new ComprasError("La orden ya no existe.");
        if (actual.estado !== "BORRADOR") throw new ComprasError("Solo se puede editar una orden en borrador.");
        await tx.ordenCompraLinea.deleteMany({ where: { ordenId: id } });
        const o = await tx.ordenCompra.update({
          where: { id },
          data: { proveedorId: d.proveedorId, fecha: d.fecha, fechaEsperada: d.fechaEsperada, observaciones: d.observaciones, ...columnas, ...t, lineas: { create: filas } },
          select: { id: true, numero: true },
        });
        return { ...o, nueva: false };
      }
      const o = await tx.ordenCompra.create({
        data: { proveedorId: d.proveedorId, fecha: d.fecha, fechaEsperada: d.fechaEsperada, observaciones: d.observaciones, ...columnas, ...t, creadoPorId: actor.id, creadoPorNombre: actor.nombre, lineas: { create: filas } },
        select: { id: true, numero: true },
      });
      return { ...o, nueva: true };
    });
    await registrarCambio(db, actor, {
      modulo: "compras", entidad: "orden_compra", entidadId: r.id, descripcion: numeroOrden(r.numero), accion: r.nueva ? "crear" : "editar",
      despues: { lineas: d.lineas.length, total: calcularTotales(d.lineas.map((l) => ({ ...l, ivaPorcentaje: 0 }))).subtotal },
    });
    return { ok: true, id: r.id, numero: r.numero };
  });
}

async function cambiarEstado(db: Db, actor: Actor, id: string, desde: string[], hacia: string, accion: string): Promise<ResultadoCompra> {
  return ejecutar(db, async () => {
    const numero = await db.$transaction(async (tx) => {
      const o = await tx.ordenCompra.findUnique({ where: { id }, select: { numero: true, _count: { select: { lineas: true, recepciones: true } } } });
      if (!o) throw new ComprasError("La orden ya no existe.");
      if (hacia === "ANULADA" && o._count.recepciones > 0) throw new ComprasError("La orden ya tiene recepciones: no se puede anular.");
      if (hacia === "EMITIDA" && o._count.lineas === 0) throw new ComprasError("La orden no tiene líneas.");
      // El estado se cambia solo si sigue siendo el esperado: dos personas no pueden pisarse.
      const r = await tx.ordenCompra.updateMany({ where: { id, estado: { in: desde } }, data: { estado: hacia } });
      if (r.count === 0) throw new ComprasError("La orden cambió de estado mientras la veías. Recarga la página.");
      return o.numero;
    });
    await registrarCambio(db, actor, { modulo: "compras", entidad: "orden_compra", entidadId: id, descripcion: numeroOrden(numero), accion: "otro", despues: { estado: hacia, operacion: accion } });
    return { ok: true };
  });
}

export const emitirOrden = (db: Db, a: Actor, id: string) => cambiarEstado(db, a, id, ["BORRADOR"], "EMITIDA", "Emitida");
export const anularOrden = (db: Db, a: Actor, id: string) => cambiarEstado(db, a, id, ["BORRADOR", "EMITIDA"], "ANULADA", "Anulada");

export type DatosRecepcion = { almacenId: string; documento: string | null; observaciones: string | null; lineas: { ordenLineaId: string; cantidad: number }[] };

/** Registra una recepción: suma lo recibido a la orden y mete la mercancía al inventario con el costo neto de la orden. Todo o nada. */
export async function recibirOrden(db: Db, actor: Actor, ordenId: string, d: DatosRecepcion): Promise<ResultadoCompra<{ numero: number }>> {
  return ejecutar(db, async () => {
    const pedidas = d.lineas.filter((l) => l.cantidad > 0);
    if (pedidas.length === 0) throw new ComprasError("Indica la cantidad recibida de al menos una línea.");
    const r = await db.$transaction(async (tx) => {
      const orden = await tx.ordenCompra.findUnique({ where: { id: ordenId }, include: { lineas: true } });
      if (!orden) throw new ComprasError("La orden ya no existe.");
      if (orden.estado !== "EMITIDA" && orden.estado !== "RECIBIDA_PARCIAL") throw new ComprasError("Solo se recibe una orden emitida con pendientes.");

      const recepcion = await tx.recepcion.create({
        data: { ordenId, almacenId: d.almacenId, documento: d.documento, observaciones: d.observaciones, usuarioId: actor.id, usuarioNombre: actor.nombre },
        select: { id: true, numero: true },
      });
      const porId = new Map(orden.lineas.map((l) => [l.id, l]));
      for (const p of pedidas) {
        const l = porId.get(p.ordenLineaId);
        if (!l) throw new ComprasError("Una línea no pertenece a esta orden.");
        const pendiente = redondear4(Number(l.cantidad) - Number(l.cantidadRecibida));
        if (p.cantidad > pendiente) throw new ComprasError(`${l.productoCodigo}: solo faltan ${pendiente} por recibir.`);
        // Suma atómica: si otra recepción llegó primero y ya no cabe, no se actualiza nada.
        const u = await tx.ordenCompraLinea.updateMany({
          where: { id: l.id, cantidadRecibida: { lte: redondear4(Number(l.cantidad) - p.cantidad) } },
          data: { cantidadRecibida: { increment: p.cantidad } },
        });
        if (u.count === 0) throw new ComprasError(`${l.productoCodigo}: la cantidad pendiente cambió. Recarga la página.`);
        const costoNeto = calcularLinea({ cantidad: Number(l.cantidad), costoUnitario: Number(l.costoUnitario), descuento: Number(l.descuento), ivaPorcentaje: 0 }).costoNetoUnitario;
        await tx.recepcionLinea.create({ data: { recepcionId: recepcion.id, ordenLineaId: l.id, productoCodigo: l.productoCodigo, cantidad: p.cantidad, costoUnitario: costoNeto } });
        await aplicarMovimiento(tx, actor, {
          tipo: "ENTRADA", almacenId: d.almacenId, productoCodigo: l.productoCodigo, cantidad: p.cantidad, costoUnitario: costoNeto,
          documento: numeroOrden(orden.numero), motivo: `Recepción ${numeroRecepcion(recepcion.numero)}${d.documento ? ` · doc. proveedor ${d.documento}` : ""}`,
        });
      }
      const despues = await tx.ordenCompraLinea.findMany({ where: { ordenId }, select: { cantidad: true, cantidadRecibida: true } });
      const completa = despues.every((l) => Number(l.cantidadRecibida) >= Number(l.cantidad));
      await tx.ordenCompra.update({ where: { id: ordenId }, data: { estado: completa ? "RECIBIDA" : "RECIBIDA_PARCIAL" } });
      return { numero: recepcion.numero, ordenNumero: orden.numero, completa };
    });
    await registrarCambio(db, actor, {
      modulo: "compras", entidad: "orden_compra", entidadId: ordenId, descripcion: numeroOrden(r.ordenNumero), accion: "otro",
      despues: { operacion: `Recepción ${numeroRecepcion(r.numero)}`, estado: r.completa ? "RECIBIDA" : "RECIBIDA_PARCIAL" },
    });
    return { ok: true, numero: r.numero };
  });
}
