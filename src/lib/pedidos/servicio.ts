import "server-only";
import type { Db } from "@/lib/tenant";
import { registrarCambio } from "@/lib/auditoria";
import type { Actor } from "@/lib/inventario/movimientos";
import { tasaVigente } from "@/lib/tasas";
import { calcularLinea, calcularTotales, descuentoEfectivo, descuentoGlobal, numeroPedido } from "./calculos";
import { VentaError, validarEncabezado, type EncabezadoVenta } from "@/lib/ventas/condiciones";
import { resolverPrecios } from "@/lib/ventas/precios";

// Servicio de pedidos de venta. Cada operación es una transacción. Confirmar reserva mercancía: la reserva no es una columna sino la suma
// de las líneas de pedidos CONFIRMADOS, así que no hay un saldo que se pueda desajustar; el candado por producto evita que dos
// confirmaciones simultáneas reserven lo mismo.

export type LineaPedido = { productoCodigo: string; cantidad: number; precioUnitario: number; descuento: number };
export type DatosPedido = { clienteId: string; fecha: Date; observaciones: string | null; lineas: LineaPedido[]; encabezado?: EncabezadoVenta };
export type ResultadoPedido<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export class PedidoError extends Error {}
export type Tx = Parameters<Parameters<Db["$transaction"]>[0]>[0];

async function ejecutar<T>(trabajo: () => Promise<ResultadoPedido<T>>): Promise<ResultadoPedido<T>> {
  try {
    return await trabajo();
  } catch (e) {
    if (e instanceof PedidoError || e instanceof VentaError) return { ok: false, error: e.message };
    throw e;
  }
}

/** Cantidad disponible por producto: existencia en todos los almacenes menos lo reservado por pedidos confirmados (menos el pedido indicado). */
export async function disponibles(db: Db | Tx, codigos: string[], excluirPedidoId?: string): Promise<Map<string, number>> {
  const [stock, reservado] = await Promise.all([
    db.existencia.groupBy({ by: ["productoCodigo"], where: { productoCodigo: { in: codigos } }, _sum: { cantidad: true } }),
    db.pedidoVentaLinea.groupBy({
      by: ["productoCodigo"],
      where: { productoCodigo: { in: codigos }, pedido: { estado: "CONFIRMADO", ...(excluirPedidoId ? { id: { not: excluirPedidoId } } : {}) } },
      _sum: { cantidad: true },
    }),
  ]);
  const r = new Map(codigos.map((c) => [c, 0]));
  for (const s of stock) r.set(s.productoCodigo, Number(s._sum.cantidad ?? 0));
  for (const x of reservado) r.set(x.productoCodigo, (r.get(x.productoCodigo) ?? 0) - Number(x._sum.cantidad ?? 0));
  return r;
}

export async function prepararLineasVenta(tx: Tx, d: Pick<DatosPedido, "clienteId" | "lineas"> & { descuentos?: number[] }) {
  const cliente = await tx.cliente.findUnique({ where: { id: d.clienteId }, select: { activo: true, situacion: true, listaPrecio: true } });
  if (!cliente || !cliente.activo) throw new PedidoError("El cliente no existe o está inactivo.");
  if (cliente.situacion === "BLOQUEADO") throw new PedidoError("El cliente está bloqueado: no se le puede vender.");
  const global = descuentoGlobal(d.descuentos ?? []);
  const precios = await resolverPrecios(tx, d.lineas.map((l) => l.productoCodigo), cliente.listaPrecio);
  if (d.lineas.length === 0) throw new PedidoError("Agrega al menos un producto.");
  if (d.lineas.length > 500) throw new PedidoError("Máximo 500 líneas por pedido.");
  const codigos = d.lineas.map((l) => l.productoCodigo);
  if (new Set(codigos).size !== codigos.length) throw new PedidoError("Hay un producto repetido: suma sus cantidades en una sola línea.");
  const productos = await tx.producto.findMany({ where: { codigo: { in: codigos } }, include: { alicuotaIva: { select: { porcentajeVenta: true } } } });
  const porCodigo = new Map(productos.map((p) => [p.codigo, p]));
  return d.lineas.map((l, i) => {
    const p = porCodigo.get(l.productoCodigo);
    if (!p) throw new PedidoError(`El producto ${l.productoCodigo} no existe.`);
    if (!p.activo) throw new PedidoError(`El producto ${l.productoCodigo} está inactivo.`);
    if (!(l.cantidad > 0) || l.cantidad > 1e9) throw new PedidoError(`Línea ${i + 1}: la cantidad debe ser mayor que 0.`);
    if (l.precioUnitario < 0 || l.precioUnitario > 1e9) throw new PedidoError(`Línea ${i + 1}: precio inválido.`);
    if (l.descuento < 0 || l.descuento > 100) throw new PedidoError(`Línea ${i + 1}: el descuento debe estar entre 0 y 100.`);
    const maximo = Number(p.precioMaximoPublico);
    const efectivo = descuentoEfectivo(l.descuento, global);
    const neto = l.precioUnitario * (1 - efectivo / 100);
    if (maximo > 0 && neto > maximo + 1e-9) throw new PedidoError(`${l.productoCodigo}: el precio supera el máximo al público (${maximo}).`);
    const ivaPorcentaje = Number(p.alicuotaIva.porcentajeVenta);
    // El descuento máximo de la lista limita lo que escribió quien vende (el global del cliente no cuenta contra ese tope).
    const tope = precios.get(l.productoCodigo);
    if (tope && tope.origen === "LISTA" && tope.descuentoMaxPct > 0 && l.descuento > tope.descuentoMaxPct + 1e-9) throw new PedidoError(`${l.productoCodigo}: el descuento máximo de la lista ${cliente.listaPrecio} es ${tope.descuentoMaxPct} %.`);
    const calc = calcularLinea({ cantidad: l.cantidad, costoUnitario: l.precioUnitario, descuento: efectivo, ivaPorcentaje });
    return { linea: i + 1, productoCodigo: l.productoCodigo, descripcion: p.descripcion, cantidad: l.cantidad, precioUnitario: l.precioUnitario, descuento: efectivo, descuentoLinea: l.descuento, ivaPorcentaje, total: calc.total, _e: { cantidad: l.cantidad, costoUnitario: l.precioUnitario, descuento: efectivo, ivaPorcentaje } };
  });
}

export async function guardarPedido(db: Db, actor: Actor, id: string | null, d: DatosPedido): Promise<ResultadoPedido<{ id: string; numero: number }>> {
  return ejecutar(async () => {
    const r = await db.$transaction(async (tx) => {
      const enc = await validarEncabezado(tx, d.encabezado);
      const lineas = await prepararLineasVenta(tx, { ...d, descuentos: enc.descuentos });
      const t = calcularTotales(lineas.map((l) => l._e));
      const filas = lineas.map((l) => ({ linea: l.linea, productoCodigo: l.productoCodigo, descripcion: l.descripcion, cantidad: l.cantidad, precioUnitario: l.precioUnitario, descuento: l.descuento, descuentoLinea: l.descuentoLinea, ivaPorcentaje: l.ivaPorcentaje, total: l.total }));
      const base = { clienteId: d.clienteId, fecha: d.fecha, observaciones: d.observaciones, ...enc.columnas, ...t };
      if (id) {
        // Se edita solo si sigue en borrador: la condición va en el mismo UPDATE para que no se pisen dos personas.
        const u = await tx.pedidoVenta.updateMany({ where: { id, estado: "BORRADOR" }, data: base });
        if (u.count === 0) throw new PedidoError("Solo se puede editar un pedido en borrador (o ya no existe).");
        await tx.pedidoVentaLinea.deleteMany({ where: { pedidoId: id } });
        await tx.pedidoVentaLinea.createMany({ data: filas.map((f) => ({ ...f, pedidoId: id })) });
        const o = await tx.pedidoVenta.findUniqueOrThrow({ where: { id }, select: { id: true, numero: true } });
        return { ...o, nuevo: false };
      }
      const o = await tx.pedidoVenta.create({ data: { ...base, creadoPorId: actor.id, creadoPorNombre: actor.nombre, lineas: { create: filas } }, select: { id: true, numero: true } });
      return { ...o, nuevo: true };
    });
    await registrarCambio(db, actor, {
      modulo: "pedidos", entidad: "pedido_venta", entidadId: r.id, descripcion: numeroPedido(r.numero), accion: r.nuevo ? "crear" : "editar",
      despues: { lineas: d.lineas.length },
    });
    return { ok: true, id: r.id, numero: r.numero };
  });
}

/** Confirma el pedido: valida disponibilidad (con candado por producto), congela la tasa del dólar y reserva. */
export async function confirmarPedido(db: Db, actor: Actor, id: string): Promise<ResultadoPedido> {
  return ejecutar(async () => {
    const r = await db.$transaction(async (tx) => {
      const p = await tx.pedidoVenta.findUnique({ where: { id }, include: { lineas: true } });
      if (!p) throw new PedidoError("El pedido ya no existe.");
      if (p.estado !== "BORRADOR") throw new PedidoError("El pedido cambió de estado mientras lo veías. Recarga la página.");
      if (p.lineas.length === 0) throw new PedidoError("El pedido no tiene líneas.");
      const codigos = p.lineas.map((l) => l.productoCodigo).sort();
      for (const c of codigos) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"reserva:" + c}))`;
      const libre = await disponibles(tx, codigos, id);
      for (const l of p.lineas) {
        const hay = libre.get(l.productoCodigo) ?? 0;
        if (Number(l.cantidad) > hay) throw new PedidoError(`${l.productoCodigo}: solo hay ${Math.max(hay, 0)} disponibles (existencia menos reservas).`);
      }
      const tasa = await tasaVigente(tx as unknown as Db, "USD");
      if (!tasa) throw new PedidoError("No hay tasa del dólar cargada: regístrala en Tasa de cambio antes de confirmar.");
      const u = await tx.pedidoVenta.updateMany({ where: { id, estado: "BORRADOR" }, data: { estado: "CONFIRMADO", tasaUsd: tasa.valor } });
      if (u.count === 0) throw new PedidoError("El pedido cambió de estado mientras lo veías. Recarga la página.");
      return { numero: p.numero, tasa: tasa.valor };
    });
    await registrarCambio(db, actor, { modulo: "pedidos", entidad: "pedido_venta", entidadId: id, descripcion: numeroPedido(r.numero), accion: "otro", despues: { estado: "CONFIRMADO", operacion: "Confirmado y reservado", tasaUsd: r.tasa } });
    return { ok: true };
  });
}

/** Anula un pedido en borrador o confirmado (libera la reserva). Uno facturado no se anula aquí: se anula su factura. */
export async function anularPedido(db: Db, actor: Actor, id: string): Promise<ResultadoPedido> {
  return ejecutar(async () => {
    const numero = await db.$transaction(async (tx) => {
      const p = await tx.pedidoVenta.findUnique({ where: { id }, select: { numero: true } });
      if (!p) throw new PedidoError("El pedido ya no existe.");
      const u = await tx.pedidoVenta.updateMany({ where: { id, estado: { in: ["BORRADOR", "CONFIRMADO"] } }, data: { estado: "ANULADO" } });
      if (u.count === 0) throw new PedidoError("El pedido ya está facturado o anulado. Recarga la página.");
      return p.numero;
    });
    await registrarCambio(db, actor, { modulo: "pedidos", entidad: "pedido_venta", entidadId: id, descripcion: numeroPedido(numero), accion: "otro", despues: { estado: "ANULADO", operacion: "Anulado" } });
    return { ok: true };
  });
}

export type ProductoVenta = { codigo: string; descripcion: string; precioLista: number; ivaPorcentaje: number; disponible: number; descuentoSugerido?: number; descuentoMax?: number; origenPrecio?: "BASE" | "LISTA" | "PROMOCION" };

/** Busca productos activos para armar un documento de venta, con su precio de lista y lo disponible (existencia menos reservas). */
export async function buscarProductosVenta(db: Db, texto: string, lista = "A"): Promise<ProductoVenta[]> {
  const q = texto.trim().slice(0, 60);
  if (q.length < 2) return [];
  const r = await db.producto.findMany({
    where: { activo: true, OR: [{ codigo: { contains: q, mode: "insensitive" } }, { descripcion: { contains: q, mode: "insensitive" } }, { codigoBarras: q }] },
    include: { alicuotaIva: { select: { porcentajeVenta: true } } },
    orderBy: { descripcion: "asc" },
    take: 12,
  });
  const codigos = r.map((p) => p.codigo);
  const [libre, precios] = await Promise.all([disponibles(db, codigos), resolverPrecios(db, codigos, /^[A-Z]$/.test(lista) ? lista : "A")]);
  return r.map((p) => {
    const x = precios.get(p.codigo);
    return {
      codigo: p.codigo, descripcion: p.descripcion, precioLista: x?.precioUsd ?? Number(p.precioLista), ivaPorcentaje: Number(p.alicuotaIva.porcentajeVenta), disponible: libre.get(p.codigo) ?? 0,
      descuentoSugerido: x?.descuentoSugeridoPct ?? 0, descuentoMax: x?.descuentoMaxPct ?? 0, origenPrecio: x?.origen ?? "BASE",
    };
  });
}
