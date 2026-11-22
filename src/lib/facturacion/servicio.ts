import "server-only";
import type { Db } from "@/lib/tenant";
import { registrarCambio } from "@/lib/auditoria";
import { aplicarMovimiento, MovimientoRechazado, type Actor } from "@/lib/inventario/movimientos";
import { calcularTotales } from "@/lib/pedidos/calculos";
import { VentaError, encabezadoDe, validarEncabezado, verificarCredito, type EncabezadoVenta } from "@/lib/ventas/condiciones";
import { disponibles, prepararLineasVenta, PedidoError, type LineaPedido, type Tx } from "@/lib/pedidos/servicio";
import { numeroFactura } from "./estados";
import { contabilizarFactura, revertirFactura } from "@/lib/contabilidad/automatico";
import { ContaError } from "@/lib/contabilidad/servicio";
import { aBolivares, hoyCaracas, tasaVigente } from "@/lib/tasas";

// Servicio de facturación. Emitir y anular son transacciones completas: la factura, su kardex y el estado del pedido quedan juntos o no quedan.
// Una factura emitida no se edita. Anular devuelve la mercancía como ajuste sobrante (no altera el costo promedio) y reabre el pedido de origen.

export type ResultadoFactura<T = object> = ({ ok: true } & T) | { ok: false; error: string };
class FacturaError extends Error {}

async function ejecutar<T>(trabajo: () => Promise<ResultadoFactura<T>>): Promise<ResultadoFactura<T>> {
  try {
    return await trabajo();
  } catch (e) {
    if (e instanceof FacturaError || e instanceof PedidoError || e instanceof ContaError || e instanceof VentaError) return { ok: false, error: e.message };
    if (e instanceof MovimientoRechazado) return { ok: false, error: Object.values(e.errores)[0] ?? "No se pudo mover el inventario." };
    throw e;
  }
}

type LineaLista = { productoCodigo: string; descripcion: string; cantidad: number; precioUnitario: number; descuento: number; descuentoLinea?: number | null; ivaPorcentaje: number; total: number };

/** Crea la factura y descuenta el inventario, todo dentro de la transacción recibida. */
async function crearFactura(tx: Tx, actor: Actor, d: { clienteId: string; pedidoId: string | null; almacenId: string; observaciones: string | null; diasCredito: number; lineas: LineaLista[]; encabezado: Awaited<ReturnType<typeof validarEncabezado>>["columnas"] }) {
  const tasa = await tasaVigente(tx as unknown as Db, "USD");
  if (!tasa) throw new FacturaError("No hay tasa del dólar cargada: regístrala en Tasa de cambio antes de facturar.");
  const almacen = await tx.almacen.findUnique({ where: { id: d.almacenId }, select: { activo: true } });
  if (!almacen?.activo) throw new FacturaError("El almacén no existe o está inactivo.");

  const t = calcularTotales(d.lineas.map((l) => ({ cantidad: l.cantidad, costoUnitario: l.precioUnitario, descuento: l.descuento, ivaPorcentaje: l.ivaPorcentaje })));
  const costos = new Map((await tx.producto.findMany({ where: { codigo: { in: d.lineas.map((l) => l.productoCodigo) } }, select: { codigo: true, costoPromedio: true } })).map((p) => [p.codigo, Number(p.costoPromedio)]));
  if (!Number.isInteger(d.diasCredito) || d.diasCredito < 0 || d.diasCredito > 365) throw new FacturaError("Los días de crédito deben ser un número entero entre 0 y 365.");
  // Bloqueo, crédito, límite y vencimientos del cliente (a crédito) antes de crear nada.
  await verificarCredito(tx, d.clienteId, t.total, d.diasCredito);
  const fecha = hoyCaracas();
  const vence = new Date(fecha.getTime() + d.diasCredito * 86_400_000);
  const f = await tx.factura.create({
    data: {
      clienteId: d.clienteId, pedidoId: d.pedidoId, almacenId: d.almacenId, fecha, observaciones: d.observaciones, ...d.encabezado, ...t,
      diasCredito: d.diasCredito, fechaVencimiento: vence, saldo: t.total,
      tasaUsd: tasa.valor, totalBs: aBolivares(t.total, tasa.valor), creadoPorId: actor.id, creadoPorNombre: actor.nombre,
      lineas: { create: d.lineas.map((l, i) => ({ linea: i + 1, productoCodigo: l.productoCodigo, descripcion: l.descripcion, cantidad: l.cantidad, precioUnitario: l.precioUnitario, descuento: l.descuento, descuentoLinea: l.descuentoLinea ?? null, ivaPorcentaje: l.ivaPorcentaje, total: l.total, costoUnitario: costos.get(l.productoCodigo) ?? 0 })) },
    },
    select: { id: true, numero: true },
  });
  for (const l of d.lineas) {
    try {
      await aplicarMovimiento(tx, actor, { tipo: "SALIDA", almacenId: d.almacenId, productoCodigo: l.productoCodigo, cantidad: l.cantidad, documento: numeroFactura(f.numero), motivo: "Venta" });
    } catch (e) {
      if (e instanceof MovimientoRechazado) throw new FacturaError(`${l.productoCodigo}: ${Object.values(e.errores)[0] ?? "no se pudo descontar del inventario."}`);
      throw e;
    }
  }
  await contabilizarFactura(tx, actor, f.id);
  return { ...f, total: t.total, lineas: d.lineas.length };
}

async function auditarEmision(db: Db, actor: Actor, r: { id: string; numero: number; total: number; lineas: number }, pedidoId: string | null) {
  await registrarCambio(db, actor, { modulo: "facturacion", entidad: "factura", entidadId: r.id, descripcion: numeroFactura(r.numero), accion: "crear", despues: { lineas: r.lineas, totalUsd: r.total, ...(pedidoId ? { pedidoId } : {}) } });
}

export type DatosFactura = { clienteId: string; almacenId: string; observaciones: string | null; diasCredito: number; lineas: LineaPedido[]; encabezado?: EncabezadoVenta };

/** Factura directa (sin pedido). Respeta lo reservado por pedidos confirmados de otros clientes. */
export async function emitirFactura(db: Db, actor: Actor, d: DatosFactura): Promise<ResultadoFactura<{ id: string; numero: number }>> {
  return ejecutar(async () => {
    const r = await db.$transaction(async (tx) => {
      const enc = await validarEncabezado(tx, d.encabezado);
      const lineas = await prepararLineasVenta(tx, { ...d, descuentos: enc.descuentos });
      const codigos = lineas.map((l) => l.productoCodigo).sort();
      for (const c of codigos) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"reserva:" + c}))`;
      const libre = await disponibles(tx, codigos);
      for (const l of lineas) {
        const hay = libre.get(l.productoCodigo) ?? 0;
        if (l.cantidad > hay) throw new FacturaError(`${l.productoCodigo}: solo hay ${Math.max(hay, 0)} disponibles (existencia menos reservas de pedidos).`);
      }
      return crearFactura(tx, actor, { clienteId: d.clienteId, pedidoId: null, almacenId: d.almacenId, observaciones: d.observaciones, diasCredito: d.diasCredito, lineas, encabezado: enc.columnas });
    });
    await auditarEmision(db, actor, r, null);
    return { ok: true, id: r.id, numero: r.numero };
  });
}

/** Factura un pedido confirmado con sus mismas líneas y precios. La reserva del pedido se consume con la salida de inventario. */
export async function emitirFacturaDePedido(db: Db, actor: Actor, pedidoId: string, almacenId: string, observaciones: string | null, diasCredito: number): Promise<ResultadoFactura<{ id: string; numero: number }>> {
  return ejecutar(async () => {
    const r = await db.$transaction(async (tx) => {
      // El estado se cambia primero y solo si sigue CONFIRMADO: dos personas no pueden facturar el mismo pedido.
      const u = await tx.pedidoVenta.updateMany({ where: { id: pedidoId, estado: "CONFIRMADO" }, data: { estado: "FACTURADO" } });
      if (u.count === 0) throw new FacturaError("Solo se factura un pedido confirmado. Recarga la página.");
      const p = await tx.pedidoVenta.findUniqueOrThrow({ where: { id: pedidoId }, include: { lineas: { orderBy: { linea: "asc" } } } });
      const lineas: LineaLista[] = p.lineas.map((l) => ({
        productoCodigo: l.productoCodigo, descripcion: l.descripcion, cantidad: Number(l.cantidad), precioUnitario: Number(l.precioUnitario),
        descuento: Number(l.descuento), descuentoLinea: l.descuentoLinea === null ? null : Number(l.descuentoLinea), ivaPorcentaje: Number(l.ivaPorcentaje), total: Number(l.total),
      }));
      const enc = await validarEncabezado(tx, encabezadoDe(p));
      return crearFactura(tx, actor, { clienteId: p.clienteId, pedidoId, almacenId, observaciones, diasCredito, lineas, encabezado: enc.columnas });
    });
    await auditarEmision(db, actor, r, pedidoId);
    return { ok: true, id: r.id, numero: r.numero };
  });
}

/** Anula una factura emitida: devuelve la mercancía al mismo almacén y reabre el pedido de origen (vuelve a CONFIRMADO). */
export async function anularFactura(db: Db, actor: Actor, id: string, motivo: string): Promise<ResultadoFactura> {
  return ejecutar(async () => {
    const m = motivo.trim();
    if (m.length < 3) throw new FacturaError("Indica el motivo de la anulación.");
    const numero = await db.$transaction(async (tx) => {
      const u = await tx.factura.updateMany({ where: { id, estado: "EMITIDA" }, data: { estado: "ANULADA", saldo: 0, anuladaEn: new Date(), anuladaPorNombre: actor.nombre, motivoAnulacion: m.slice(0, 500) } });
      if (u.count === 0) throw new FacturaError("La factura ya está anulada o no existe. Recarga la página.");
      // Con cobros vigentes no se anula: primero hay que anular el cobro (así el saldo y la caja siempre cuadran).
      if ((await tx.cobroAplicacion.count({ where: { facturaId: id, cobro: { estado: "REGISTRADO" } } })) > 0) throw new FacturaError("La factura tiene cobros registrados: anula primero esos cobros en Cuentas por cobrar.");
      if ((await tx.retencion.count({ where: { facturaId: id, estado: "ACTIVA" } })) > 0) throw new FacturaError("La factura tiene retenciones vigentes: anúlalas primero.");
      if ((await tx.notaVenta.count({ where: { facturaId: id, estado: "ACTIVA" } })) > 0) throw new FacturaError("La factura tiene notas de crédito o débito vigentes: anúlalas primero.");
      const f = await tx.factura.findUniqueOrThrow({ where: { id }, include: { lineas: true } });
      for (const l of f.lineas) {
        await aplicarMovimiento(tx, actor, { tipo: "AJUSTE_POSITIVO", almacenId: f.almacenId, productoCodigo: l.productoCodigo, cantidad: Number(l.cantidad), documento: numeroFactura(f.numero), motivo: `Anulación de factura: ${m.slice(0, 200)}` });
      }
      await revertirFactura(tx, actor, f.numero);
      if (f.pedidoId) await tx.pedidoVenta.updateMany({ where: { id: f.pedidoId, estado: "FACTURADO" }, data: { estado: "CONFIRMADO" } });
      return f.numero;
    });
    await registrarCambio(db, actor, { modulo: "facturacion", entidad: "factura", entidadId: id, descripcion: numeroFactura(numero), accion: "otro", despues: { estado: "ANULADA", motivo: m } });
    return { ok: true };
  });
}

/** Registra el número de factura fiscal y/o el número de control (los da la máquina fiscal o la imprenta). Cada uno se registra una sola vez y no se cambia: quedan en el libro de ventas. */
export async function registrarNumerosFiscales(db: Db, actor: Actor, id: string, d: { numeroFiscal: string | null; numeroControl: string | null }): Promise<ResultadoFactura> {
  return ejecutar(async () => {
    const valido = (s: string | null) => s === null || /^[A-Za-z0-9][A-Za-z0-9\-/.]{0,29}$/.test(s);
    if (!valido(d.numeroFiscal) || !valido(d.numeroControl)) throw new FacturaError("Los números admiten letras, dígitos, guion, punto y barra (máximo 30 caracteres).");
    if (!d.numeroFiscal && !d.numeroControl) throw new FacturaError("Indica el número de factura o el de control.");
    const numero = await db.$transaction(async (tx) => {
      const f = await tx.factura.findUnique({ where: { id }, select: { numero: true, estado: true, numeroFiscal: true, numeroControl: true } });
      if (!f) throw new FacturaError("La factura ya no existe.");
      if (f.estado !== "EMITIDA") throw new FacturaError("La factura está anulada.");
      if ((d.numeroFiscal && f.numeroFiscal) || (d.numeroControl && f.numeroControl)) throw new FacturaError("Ese número ya estaba registrado y no se puede cambiar.");
      for (const [campo, valor] of [["numeroFiscal", d.numeroFiscal], ["numeroControl", d.numeroControl]] as const) {
        if (valor && (await tx.factura.findFirst({ where: { [campo]: valor, id: { not: id } }, select: { numero: true } }))) throw new FacturaError(`El número ${valor} ya está en otra factura.`);
      }
      // Condicionado a que sigan vacíos: dos personas no pueden pisarse.
      const u = await tx.factura.updateMany({
        where: { id, estado: "EMITIDA", ...(d.numeroFiscal ? { numeroFiscal: null } : {}), ...(d.numeroControl ? { numeroControl: null } : {}) },
        data: { ...(d.numeroFiscal ? { numeroFiscal: d.numeroFiscal } : {}), ...(d.numeroControl ? { numeroControl: d.numeroControl } : {}) },
      });
      if (u.count === 0) throw new FacturaError("La factura cambió mientras la veías. Recarga la página.");
      return f.numero;
    });
    await registrarCambio(db, actor, { modulo: "facturacion", entidad: "factura", entidadId: id, descripcion: numeroFactura(numero), accion: "editar", despues: { numeroFiscal: d.numeroFiscal, numeroControl: d.numeroControl } });
    return { ok: true };
  });
}
