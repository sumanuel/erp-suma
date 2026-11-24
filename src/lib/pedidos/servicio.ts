import "server-only";
import { siguienteNumero } from "@/lib/numeracion";
import type { Db } from "@/lib/tenant";
import { registrarCambio } from "@/lib/auditoria";
import type { Actor } from "@/lib/inventario/movimientos";
import { hoyCaracas, tasaVigente } from "@/lib/tasas";
import { calcularLinea, calcularTotales, descuentoEfectivo, descuentoGlobal, numeroPedido } from "./calculos";
import { VentaError, validarEncabezado, type EncabezadoVenta } from "@/lib/ventas/condiciones";
import type { OpcionesUnidad } from "@/lib/ventas/presentaciones";
import { cantidadBonificada, promocionesLleve, resolverPrecios } from "@/lib/ventas/precios";

// Servicio de pedidos de venta. Cada operación es una transacción. Confirmar reserva mercancía: la reserva no es una columna sino la suma
// de las líneas de pedidos CONFIRMADOS, así que no hay un saldo que se pueda desajustar; el candado por producto evita que dos
// confirmaciones simultáneas reserven lo mismo.

export type LineaPedido = { productoCodigo: string; cantidad: number; precioUnitario: number; descuento: number; almacenId?: string | null;
  /// Presentación en la que se vende (caja, bulto…): `cantidad` y `precioUnitario` vienen en esa unidad y se guardan en unidades base.
  presentacionId?: string | null;
};
/// `sinCambiarPrecio`: quien guarda no tiene el permiso «cambiar precio»; el precio de cada línea debe ser el de la lista del cliente.
export type DatosPedido = { clienteId: string; fecha: Date; observaciones: string | null; lineas: LineaPedido[]; encabezado?: EncabezadoVenta; sinCambiarPrecio?: boolean };
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

export async function prepararLineasVenta(tx: Tx, d: Pick<DatosPedido, "clienteId" | "lineas" | "sinCambiarPrecio"> & { descuentos?: number[] }) {
  const cliente = await tx.cliente.findUnique({ where: { id: d.clienteId }, select: { activo: true, situacion: true, listaPrecio: true } });
  if (!cliente || !cliente.activo) throw new PedidoError("El cliente no existe o está inactivo.");
  if (cliente.situacion === "BLOQUEADO") throw new PedidoError("El cliente está bloqueado: no se le puede vender.");
  const global = descuentoGlobal(d.descuentos ?? []);
  const precios = await resolverPrecios(tx, d.lineas.map((l) => l.productoCodigo), cliente.listaPrecio);
  const lleve = await promocionesLleve(tx, d.lineas.map((l) => l.productoCodigo), cliente.listaPrecio);
  const almacenes = [...new Set(d.lineas.map((l) => l.almacenId).filter((x): x is string => !!x))];
  if (almacenes.length) {
    const ok = new Set((await tx.almacen.findMany({ where: { id: { in: almacenes }, activo: true }, select: { id: true } })).map((a) => a.id));
    if (almacenes.some((a) => !ok.has(a))) throw new PedidoError("Hay un almacén de línea que no existe o está inactivo.");
  }
  if (d.lineas.length === 0) throw new PedidoError("Agrega al menos un producto.");
  if (d.lineas.length > 500) throw new PedidoError("Máximo 500 líneas por pedido.");
  const codigos = d.lineas.map((l) => l.productoCodigo);
  if (new Set(codigos).size !== codigos.length) throw new PedidoError("Hay un producto repetido: suma sus cantidades en una sola línea.");
  const productos = await tx.producto.findMany({ where: { codigo: { in: codigos } }, include: { alicuotaIva: { select: { porcentajeVenta: true } } } });
  const idsPres = d.lineas.map((l) => l.presentacionId).filter((x): x is string => !!x);
  const presentaciones = new Map((idsPres.length ? await tx.productoPresentacion.findMany({ where: { id: { in: idsPres } } }) : []).map((x) => [x.id, x]));
  const porCodigo = new Map(productos.map((p) => [p.codigo, p]));
  const normales = d.lineas.map((l, i) => {
    const p = porCodigo.get(l.productoCodigo);
    if (!p) throw new PedidoError(`El producto ${l.productoCodigo} no existe.`);
    if (!p.activo) throw new PedidoError(`El producto ${l.productoCodigo} está inactivo.`);
    if (!(l.cantidad > 0) || l.cantidad > 1e9) throw new PedidoError(`Línea ${i + 1}: la cantidad debe ser mayor que 0.`);
    if (l.precioUnitario < 0 || l.precioUnitario > 1e9) throw new PedidoError(`Línea ${i + 1}: precio inválido.`);
    if (l.descuento < 0 || l.descuento > 100) throw new PedidoError(`Línea ${i + 1}: el descuento debe estar entre 0 y 100.`);
    // Unidad de venta: la línea se guarda en unidades base (cantidad × factor, precio ÷ factor).
    let factor = 1;
    if (l.presentacionId) {
      const pr = presentaciones.get(l.presentacionId);
      if (!pr || pr.productoCodigo !== l.productoCodigo) throw new PedidoError(`Línea ${i + 1}: la presentación no es de ${l.productoCodigo}.`);
      if (!pr.visibleVentas) throw new PedidoError(`Línea ${i + 1}: la presentación no se vende.`);
      factor = Number(pr.cantidad);
    }
    const cantidad = l.cantidad * factor;
    const precioBase = l.precioUnitario / factor;
    const maximo = Number(p.precioMaximoPublico);
    const efectivo = descuentoEfectivo(l.descuento, global);
    const neto = precioBase * (1 - efectivo / 100);
    if (maximo > 0 && neto > maximo + 1e-9) throw new PedidoError(`${l.productoCodigo}: el precio supera el máximo al público (${maximo}).`);
    const ivaPorcentaje = Number(p.alicuotaIva.porcentajeVenta);
    // El descuento máximo de la lista limita lo que escribió quien vende (el global del cliente no cuenta contra ese tope).
    const tope = precios.get(l.productoCodigo);
    const pres = l.presentacionId ? presentaciones.get(l.presentacionId) : undefined;
    // Precio de lista de la presentación: el propio de la presentación si lo tiene; si no, el precio base por su cantidad.
    const listaPres = tope ? (pres && Number(pres.precioVenta) > 0 ? Number(pres.precioVenta) : tope.precioUsd * factor) : null;
    if (d.sinCambiarPrecio && listaPres !== null && Math.abs(l.precioUnitario - listaPres) > 1e-4) throw new PedidoError(`${l.productoCodigo}: no tienes permiso para cambiar el precio (la lista ${cliente.listaPrecio} dice ${listaPres}).`);
    if (tope && tope.origen === "LISTA" && tope.descuentoMaxPct > 0 && l.descuento > tope.descuentoMaxPct + 1e-9) throw new PedidoError(`${l.productoCodigo}: el descuento máximo de la lista ${cliente.listaPrecio} es ${tope.descuentoMaxPct} %.`);
    const calc = calcularLinea({ cantidad, costoUnitario: precioBase, descuento: efectivo, ivaPorcentaje });
    return { linea: i + 1, productoCodigo: l.productoCodigo, descripcion: p.descripcion, cantidad, precioUnitario: precioBase, descuento: efectivo, descuentoLinea: l.descuento as number | null, ivaPorcentaje, total: calc.total, bonificacion: false, almacenId: l.almacenId ?? null, presentacionId: l.presentacionId ?? null, factor, _e: { cantidad, costoUnitario: precioBase, descuento: efectivo, ivaPorcentaje } };
  });
  // Promociones «compra N, llévate M»: el sistema agrega la línea regalada (precio 0) al final.
  const regalos = normales.flatMap((l) => {
    const promo = lleve.get(l.productoCodigo);
    const extra = promo ? cantidadBonificada(promo, l.cantidad) : 0;
    if (extra <= 0) return [];
    return [{ productoCodigo: l.productoCodigo, descripcion: `${l.descripcion} (bonificación)`, cantidad: extra, precioUnitario: 0, descuento: 0, descuentoLinea: null as number | null, ivaPorcentaje: l.ivaPorcentaje, total: 0, bonificacion: true, almacenId: l.almacenId, presentacionId: null as string | null, factor: 1, _e: { cantidad: extra, costoUnitario: 0, descuento: 0, ivaPorcentaje: l.ivaPorcentaje } }];
  });
  if (normales.length + regalos.length > 500) throw new PedidoError("Máximo 500 líneas por documento (con las bonificaciones).");
  return [...normales, ...regalos.map((r, k) => ({ ...r, linea: normales.length + k + 1 }))];
}

export async function guardarPedido(db: Db, actor: Actor, id: string | null, d: DatosPedido): Promise<ResultadoPedido<{ id: string; numero: number }>> {
  return ejecutar(async () => {
    const r = await db.$transaction(async (tx) => {
      const enc = await validarEncabezado(tx, d.encabezado);
      const lineas = await prepararLineasVenta(tx, { ...d, descuentos: enc.descuentos });
      const t = calcularTotales(lineas.map((l) => l._e));
      const filas = lineas.map((l) => ({ linea: l.linea, productoCodigo: l.productoCodigo, descripcion: l.descripcion, cantidad: l.cantidad, precioUnitario: l.precioUnitario, descuento: l.descuento, descuentoLinea: l.descuentoLinea, ivaPorcentaje: l.ivaPorcentaje, total: l.total, bonificacion: l.bonificacion, almacenId: l.almacenId, presentacionId: l.presentacionId, factor: l.factor }));
      // Editar el pedido borra la decisión de gerencia anterior: lo que se aprobó ya no es lo que hay.
      const base = { clienteId: d.clienteId, fecha: d.fecha, observaciones: d.observaciones, ...enc.columnas, ...t, reglaRechazoId: null, aprobacionEstado: null, aprobadoPorId: null, aprobadoPorNombre: null, aprobadoEn: null, aprobacionMotivo: null };
      if (id) {
        // Se edita solo si sigue en borrador: la condición va en el mismo UPDATE para que no se pisen dos personas.
        const u = await tx.pedidoVenta.updateMany({ where: { id, estado: "BORRADOR" }, data: base });
        if (u.count === 0) throw new PedidoError("Solo se puede editar un pedido en borrador (o ya no existe).");
        await tx.pedidoVentaLinea.deleteMany({ where: { pedidoId: id } });
        await tx.pedidoVentaLinea.createMany({ data: filas.map((f) => ({ ...f, pedidoId: id })) });
        const o = await tx.pedidoVenta.findUniqueOrThrow({ where: { id }, select: { id: true, numero: true } });
        return { ...o, nuevo: false };
      }
      const o = await tx.pedidoVenta.create({ data: { numero: await siguienteNumero(tx, "PEDIDO"), ...base, creadoPorId: actor.id, creadoPorNombre: actor.nombre, lineas: { create: filas } }, select: { id: true, numero: true } });
      return { ...o, nuevo: true };
    });
    await registrarCambio(db, actor, {
      modulo: "pedidos", entidad: "pedido_venta", entidadId: r.id, descripcion: numeroPedido(r.numero), accion: r.nuevo ? "crear" : "editar",
      despues: { lineas: d.lineas.length },
    });
    return { ok: true, id: r.id, numero: r.numero };
  });
}

/**
 * Aprobación gerencial (original: admaprobgerent). Con el interruptor (regla 1) activo, al cerrar el pedido se revisan las reglas activas: condición de pago del cliente
 * (2), mora (3), límite de crédito (4) y descuento máximo (5). Devuelve la primera que se incumple, o null.
 */
export async function reglaIncumplida(tx: Tx, p: { clienteId: string; condicionPagoId: string | null; total: unknown; lineas: { descuento: unknown; descuentoLinea: unknown; bonificacion: boolean }[] }) {
  const reglas = await tx.reglaAprobacion.findMany({ orderBy: { id: "asc" } });
  if (!reglas.find((r) => r.id === 1)?.activa) return null;
  for (const r of reglas.filter((x) => x.id > 1 && x.activa)) {
    const monto = Number(r.monto);
    if (r.id === 2) {
      const c = p.condicionPagoId ? await tx.condicionPago.findUnique({ where: { id: p.condicionPagoId }, select: { codigo: true } }) : null;
      if (c && c.codigo === String(Math.trunc(monto))) return r;
    } else if (r.id === 3) {
      const vencidas = await tx.factura.count({ where: { clienteId: p.clienteId, estado: "EMITIDA", saldo: { gt: 0 }, fechaVencimiento: { lt: hoyCaracas() } } });
      if (vencidas > 0) return r;
    } else if (r.id === 4) {
      const limite = Number((await tx.cliente.findUnique({ where: { id: p.clienteId }, select: { limiteCredito: true } }))?.limiteCredito ?? 0);
      if (limite > 0 && Number(p.total) > limite + 1e-9) return r;
    } else if (r.id === 5) {
      const mayor = Math.max(0, ...p.lineas.filter((l) => !l.bonificacion).map((l) => Number(l.descuentoLinea ?? l.descuento)));
      if (mayor > monto + 1e-9) return r;
    }
  }
  return null;
}

/** Confirma el pedido: valida disponibilidad (con candado por producto), congela la tasa del dólar y reserva. Si incumple una regla de aprobación gerencial queda POR_APROBAR (`porAprobar` trae el motivo). */
export async function confirmarPedido(db: Db, actor: Actor, id: string): Promise<ResultadoPedido<{ porAprobar?: string }>> {
  return ejecutar<{ porAprobar?: string }>(async () => {
    const r = await db.$transaction(async (tx) => {
      const p = await tx.pedidoVenta.findUnique({ where: { id }, include: { lineas: true } });
      if (!p) throw new PedidoError("El pedido ya no existe.");
      if (p.estado !== "BORRADOR") throw new PedidoError("El pedido cambió de estado mientras lo veías. Recarga la página.");
      if (p.lineas.length === 0) throw new PedidoError("El pedido no tiene líneas.");
      if (p.aprobacionEstado !== "APROBADO") {
        const regla = await reglaIncumplida(tx, p);
        if (regla) {
          await tx.pedidoVenta.update({ where: { id }, data: { estado: "POR_APROBAR", reglaRechazoId: regla.id, aprobacionEstado: null } });
          return { numero: p.numero, regla: regla.descripcion };
        }
      }
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
    if ("regla" in r) {
      await registrarCambio(db, actor, { modulo: "pedidos", entidad: "pedido_venta", entidadId: id, descripcion: numeroPedido(r.numero), accion: "otro", despues: { estado: "POR_APROBAR", operacion: "Pasa a aprobación gerencial", regla: r.regla } });
      return { ok: true, porAprobar: `Pedido no aprobado: ${r.regla}. Quedó por aprobar por gerencia.` };
    }
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
      const u = await tx.pedidoVenta.updateMany({ where: { id, estado: { in: ["BORRADOR", "POR_APROBAR", "CONFIRMADO"] } }, data: { estado: "ANULADO" } });
      if (u.count === 0) throw new PedidoError("El pedido ya está facturado o anulado. Recarga la página.");
      return p.numero;
    });
    await registrarCambio(db, actor, { modulo: "pedidos", entidad: "pedido_venta", entidadId: id, descripcion: numeroPedido(numero), accion: "otro", despues: { estado: "ANULADO", operacion: "Anulado" } });
    return { ok: true };
  });
}

/**
 * Decisión del gerente sobre un pedido POR_APROBAR (original: cmdAprobar / cmdRechazar de frmPedido). Ambas lo devuelven a BORRADOR con la decisión registrada:
 * aprobado, al cerrarlo de nuevo ya no se revisan las reglas; rechazado, queda para corregir (volverá a revisarse al cerrar).
 */
export async function resolverAprobacion(db: Db, actor: Actor, id: string, decision: "APROBADO" | "RECHAZADO", motivo: string | null): Promise<ResultadoPedido> {
  return ejecutar(async () => {
    const m = motivo?.trim() || null;
    if (m && m.length > 300) throw new PedidoError("El motivo admite máximo 300 caracteres.");
    if (decision === "RECHAZADO" && !m) throw new PedidoError("Indica el motivo del rechazo.");
    const numero = await db.$transaction(async (tx) => {
      const p = await tx.pedidoVenta.findUnique({ where: { id }, select: { numero: true } });
      if (!p) throw new PedidoError("El pedido ya no existe.");
      const u = await tx.pedidoVenta.updateMany({ where: { id, estado: "POR_APROBAR" }, data: { estado: "BORRADOR", aprobacionEstado: decision, aprobadoPorId: actor.id, aprobadoPorNombre: actor.nombre, aprobadoEn: new Date(), aprobacionMotivo: m } });
      if (u.count === 0) throw new PedidoError("El pedido ya no está por aprobar. Recarga la página.");
      return p.numero;
    });
    await registrarCambio(db, actor, { modulo: "pedidos", entidad: "pedido_venta", entidadId: id, descripcion: numeroPedido(numero), accion: "otro", despues: { operacion: decision === "APROBADO" ? "Aprobado por gerencia" : "Rechazado por gerencia", motivo: m } });
    return { ok: true };
  });
}

export type ProductoVenta = { presentaciones?: OpcionesUnidad["presentaciones"]; codigo: string; descripcion: string; precioLista: number; ivaPorcentaje: number; disponible: number; descuentoSugerido?: number; descuentoMax?: number; origenPrecio?: "BASE" | "LISTA" | "PROMOCION" };

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
  const listaOk = /^[A-Z]$/.test(lista) ? lista : "A";
  const [libre, precios, unidades] = await Promise.all([disponibles(db, codigos), resolverPrecios(db, codigos, listaOk), presentacionesVenta(db, codigos, listaOk)]);
  return r.map((p) => {
    const x = precios.get(p.codigo);
    return {
      presentaciones: unidades.get(p.codigo)?.presentaciones ?? [],
      codigo: p.codigo, descripcion: p.descripcion, precioLista: x?.precioUsd ?? Number(p.precioLista), ivaPorcentaje: Number(p.alicuotaIva.porcentajeVenta), disponible: libre.get(p.codigo) ?? 0,
      descuentoSugerido: x?.descuentoSugeridoPct ?? 0, descuentoMax: x?.descuentoMaxPct ?? 0, origenPrecio: x?.origen ?? "BASE",
    };
  });
}

/** Presentaciones vendibles de cada producto (las que traen más de una unidad base) con su precio de lista; el precio base va aparte para volver a la unidad. */
export async function presentacionesVenta(db: Pick<Db, "productoPresentacion" | "producto" | "productoPrecio" | "promocion">, codigos: string[], lista: string): Promise<Map<string, OpcionesUnidad>> {
  const r = new Map<string, OpcionesUnidad>();
  if (codigos.length === 0) return r;
  const [filas, precios] = await Promise.all([
    db.productoPresentacion.findMany({ where: { productoCodigo: { in: codigos }, visibleVentas: true, cantidad: { not: 1 } }, include: { unidadMedida: { select: { nombre: true } } }, orderBy: { cantidad: "asc" } }),
    resolverPrecios(db, codigos, lista),
  ]);
  for (const c of codigos) r.set(c, { precioUnidad: precios.get(c)?.precioUsd ?? 0, presentaciones: [] });
  for (const f of filas) {
    const o = r.get(f.productoCodigo)!;
    const factor = Number(f.cantidad);
    o.presentaciones.push({ id: f.id, nombre: f.nombre ?? f.unidadMedida.nombre, factor, precio: Number(f.precioVenta) > 0 ? Number(f.precioVenta) : o.precioUnidad * factor });
  }
  return r;
}

/**
 * Asigna cada línea del pedido a un bulto (lista de empaque, original: lbxBultos). Se puede mientras el pedido no esté facturado ni anulado; el número de bultos del
 * pedido pasa a ser el mayor asignado. Una línea sin bulto (null) queda sin asignar.
 */
export async function asignarBultos(db: Db, actor: Actor, pedidoId: string, asignaciones: { lineaId: string; bulto: number | null }[]): Promise<ResultadoPedido> {
  return ejecutar(async () => {
    for (const a of asignaciones) if (a.bulto !== null && (!Number.isInteger(a.bulto) || a.bulto < 1 || a.bulto > 9999)) throw new PedidoError("El bulto debe ser un entero entre 1 y 9999.");
    const numero = await db.$transaction(async (tx) => {
      const p = await tx.pedidoVenta.findUnique({ where: { id: pedidoId }, include: { lineas: { select: { id: true } } } });
      if (!p) throw new PedidoError("El pedido ya no existe.");
      if (p.estado === "FACTURADO" || p.estado === "ANULADO") throw new PedidoError("Un pedido facturado o anulado ya no se empaca aquí.");
      const propias = new Set(p.lineas.map((l) => l.id));
      for (const a of asignaciones) {
        if (!propias.has(a.lineaId)) throw new PedidoError("Una línea no pertenece a este pedido.");
        await tx.pedidoVentaLinea.update({ where: { id: a.lineaId }, data: { bulto: a.bulto } });
      }
      const mayor = await tx.pedidoVentaLinea.aggregate({ where: { pedidoId }, _max: { bulto: true } });
      if (mayor._max.bulto) await tx.pedidoVenta.update({ where: { id: pedidoId }, data: { bultos: mayor._max.bulto } });
      return p.numero;
    });
    await registrarCambio(db, actor, { modulo: "pedidos", entidad: "pedido_venta", entidadId: pedidoId, descripcion: numeroPedido(numero), accion: "otro", despues: { operacion: "Bultos asignados", lineas: asignaciones.length } });
    return { ok: true };
  });
}
