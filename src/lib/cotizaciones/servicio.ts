import "server-only";
import type { Db } from "@/lib/tenant";
import { registrarCambio } from "@/lib/auditoria";
import type { Actor } from "@/lib/inventario/movimientos";
import { numeroPedido } from "@/lib/pedidos/calculos";
import { PedidoError, prepararLineasVenta, type LineaPedido } from "@/lib/pedidos/servicio";
import { hoyCaracas, tasaVigente } from "@/lib/tasas";
import { calcularTotales, estaVigente, numeroCotizacion } from "./estados";
import { VentaError, encabezadoDe, validarEncabezado, type EncabezadoVenta } from "@/lib/ventas/condiciones";

// Servicio de cotizaciones. Una cotización no reserva ni mueve inventario. Convertir una cotización emitida y vigente crea un pedido en borrador
// con los mismos precios, y la cotización pasa a ACEPTADA en la misma transacción (el cambio de estado condicionado impide convertirla dos veces).

export type DatosCotizacion = { clienteId: string; fecha: Date; validezDias: number; observaciones: string | null; lineas: LineaPedido[]; encabezado?: EncabezadoVenta; sinCambiarPrecio?: boolean };
export type ResultadoCotizacion<T = object> = ({ ok: true } & T) | { ok: false; error: string };

class CotizacionError extends Error {}

async function ejecutar<T>(trabajo: () => Promise<ResultadoCotizacion<T>>): Promise<ResultadoCotizacion<T>> {
  try {
    return await trabajo();
  } catch (e) {
    if (e instanceof CotizacionError || e instanceof PedidoError || e instanceof VentaError) return { ok: false, error: e.message };
    throw e;
  }
}

const vence = (fecha: Date, dias: number) => new Date(fecha.getTime() + dias * 86_400_000);

export async function guardarCotizacion(db: Db, actor: Actor, id: string | null, d: DatosCotizacion): Promise<ResultadoCotizacion<{ id: string; numero: number }>> {
  return ejecutar(async () => {
    if (!Number.isInteger(d.validezDias) || d.validezDias < 1 || d.validezDias > 365) throw new CotizacionError("La vigencia debe ser un entero entre 1 y 365 días.");
    const r = await db.$transaction(async (tx) => {
      const enc = await validarEncabezado(tx, d.encabezado);
      const lineas = await prepararLineasVenta(tx, { ...d, descuentos: enc.descuentos });
      const t = calcularTotales(lineas.map((l) => l._e));
      const filas = lineas.map((l) => ({ linea: l.linea, productoCodigo: l.productoCodigo, descripcion: l.descripcion, cantidad: l.cantidad, precioUnitario: l.precioUnitario, descuento: l.descuento, descuentoLinea: l.descuentoLinea, ivaPorcentaje: l.ivaPorcentaje, total: l.total, bonificacion: l.bonificacion }));
      const base = { clienteId: d.clienteId, fecha: d.fecha, validezDias: d.validezDias, fechaVencimiento: vence(d.fecha, d.validezDias), observaciones: d.observaciones, ...enc.columnas, ...t };
      if (id) {
        const u = await tx.cotizacion.updateMany({ where: { id, estado: "BORRADOR" }, data: base });
        if (u.count === 0) throw new CotizacionError("Solo se puede editar una cotización en borrador (o ya no existe).");
        await tx.cotizacionLinea.deleteMany({ where: { cotizacionId: id } });
        await tx.cotizacionLinea.createMany({ data: filas.map((f) => ({ ...f, cotizacionId: id })) });
        const o = await tx.cotizacion.findUniqueOrThrow({ where: { id }, select: { id: true, numero: true } });
        return { ...o, nueva: false };
      }
      const o = await tx.cotizacion.create({ data: { ...base, creadoPorId: actor.id, creadoPorNombre: actor.nombre, lineas: { create: filas } }, select: { id: true, numero: true } });
      return { ...o, nueva: true };
    });
    await registrarCambio(db, actor, { modulo: "cotizaciones", entidad: "cotizacion", entidadId: r.id, descripcion: numeroCotizacion(r.numero), accion: r.nueva ? "crear" : "editar", despues: { lineas: d.lineas.length } });
    return { ok: true, id: r.id, numero: r.numero };
  });
}

async function cambiarEstado(db: Db, actor: Actor, id: string, desde: string[], hacia: string, operacion: string, extra: { tasaUsd?: number; motivo?: string } = {}): Promise<ResultadoCotizacion> {
  return ejecutar(async () => {
    const numero = await db.$transaction(async (tx) => {
      const c = await tx.cotizacion.findUnique({ where: { id }, select: { numero: true, _count: { select: { lineas: true } } } });
      if (!c) throw new CotizacionError("La cotización ya no existe.");
      if (hacia === "EMITIDA" && c._count.lineas === 0) throw new CotizacionError("La cotización no tiene líneas.");
      const u = await tx.cotizacion.updateMany({ where: { id, estado: { in: desde } }, data: { estado: hacia, ...(extra.tasaUsd ? { tasaUsd: extra.tasaUsd } : {}), ...(extra.motivo ? { motivoCierre: extra.motivo.slice(0, 300) } : {}) } });
      if (u.count === 0) throw new CotizacionError("La cotización cambió de estado mientras la veías. Recarga la página.");
      return c.numero;
    });
    await registrarCambio(db, actor, { modulo: "cotizaciones", entidad: "cotizacion", entidadId: id, descripcion: numeroCotizacion(numero), accion: "otro", despues: { estado: hacia, operacion, ...(extra.motivo ? { motivo: extra.motivo } : {}) } });
    return { ok: true };
  });
}

/** Emite la cotización (la oferta queda firme y ya no se edita) y congela la tasa del dólar de hoy. */
export async function emitirCotizacion(db: Db, actor: Actor, id: string): Promise<ResultadoCotizacion> {
  const tasa = await tasaVigente(db, "USD");
  if (!tasa) return { ok: false, error: "No hay tasa del dólar cargada: regístrala en Tasa de cambio antes de emitir." };
  return cambiarEstado(db, actor, id, ["BORRADOR"], "EMITIDA", "Emitida", { tasaUsd: tasa.valor });
}

export const rechazarCotizacion = (db: Db, a: Actor, id: string, motivo: string) =>
  motivo.trim().length < 3 ? Promise.resolve<ResultadoCotizacion>({ ok: false, error: "Indica el motivo del rechazo." }) : cambiarEstado(db, a, id, ["EMITIDA"], "RECHAZADA", "Rechazada por el cliente", { motivo: motivo.trim() });

export const anularCotizacion = (db: Db, a: Actor, id: string) => cambiarEstado(db, a, id, ["BORRADOR", "EMITIDA"], "ANULADA", "Anulada");

/** Convierte una cotización emitida y vigente en un pedido en borrador con los mismos precios. */
export async function convertirEnPedido(db: Db, actor: Actor, id: string): Promise<ResultadoCotizacion<{ pedidoId: string; numero: number }>> {
  return ejecutar(async () => {
    const r = await db.$transaction(async (tx) => {
      // Primero se marca como aceptada (condicionado a EMITIDA): si dos personas convierten a la vez, solo una continúa.
      const u = await tx.cotizacion.updateMany({ where: { id, estado: "EMITIDA" }, data: { estado: "ACEPTADA" } });
      if (u.count === 0) throw new CotizacionError("Solo se convierte una cotización emitida. Recarga la página.");
      const c = await tx.cotizacion.findUniqueOrThrow({ where: { id }, include: { lineas: { orderBy: { linea: "asc" } } } });
      if (!estaVigente(hoyCaracas(), c.fechaVencimiento)) throw new CotizacionError("La cotización está vencida: haz una nueva con los precios de hoy.");
      // Revalida producto activo, precio máximo y datos del cliente con las reglas de un pedido, pero conservando los precios cotizados.
      const enc = await validarEncabezado(tx, encabezadoDe(c));
      const lineas = await prepararLineasVenta(tx, {
        clienteId: c.clienteId,
        descuentos: enc.descuentos,
        // Se parte del descuento que escribió quien cotizó (sin los globales), que se vuelven a combinar.
        lineas: c.lineas.filter((l) => !l.bonificacion).map((l) => ({ productoCodigo: l.productoCodigo, cantidad: Number(l.cantidad), precioUnitario: Number(l.precioUnitario), descuento: Number(l.descuentoLinea ?? l.descuento) })),
      });
      const t = calcularTotales(lineas.map((l) => l._e));
      const p = await tx.pedidoVenta.create({
        data: {
          clienteId: c.clienteId, cotizacionId: id, fecha: hoyCaracas(), observaciones: c.observaciones, ...enc.columnas, ...t, creadoPorId: actor.id, creadoPorNombre: actor.nombre,
          lineas: { create: lineas.map((l) => ({ linea: l.linea, productoCodigo: l.productoCodigo, descripcion: l.descripcion, cantidad: l.cantidad, precioUnitario: l.precioUnitario, descuento: l.descuento, descuentoLinea: l.descuentoLinea, ivaPorcentaje: l.ivaPorcentaje, total: l.total, bonificacion: l.bonificacion })) },
        },
        select: { id: true, numero: true },
      });
      return { pedidoId: p.id, numero: p.numero, cotizacion: c.numero };
    });
    await registrarCambio(db, actor, { modulo: "cotizaciones", entidad: "cotizacion", entidadId: id, descripcion: numeroCotizacion(r.cotizacion), accion: "otro", despues: { estado: "ACEPTADA", operacion: `Convertida en ${numeroPedido(r.numero)}` } });
    await registrarCambio(db, actor, { modulo: "pedidos", entidad: "pedido_venta", entidadId: r.pedidoId, descripcion: numeroPedido(r.numero), accion: "crear", despues: { origen: numeroCotizacion(r.cotizacion) } });
    return { ok: true, pedidoId: r.pedidoId, numero: r.numero };
  });
}
