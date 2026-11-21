import "server-only";
import type { Db } from "@/lib/tenant";
import { registrarCambio } from "@/lib/auditoria";
import type { Actor } from "@/lib/inventario/movimientos";
import { ContaError } from "@/lib/contabilidad/servicio";
import { contabilizarEntero, contabilizarRetencion, revertirEntero, revertirRetencion } from "@/lib/contabilidad/automatico";
import { aplicarMovimientoCuenta, TesoreriaRechazada } from "@/lib/tesoreria/movimientos";
import { numeroFactura } from "@/lib/facturacion/estados";
import { numeroFacturaCompra } from "@/lib/cxp/estados";
import { hoyCaracas } from "@/lib/tasas";
import { numeroEntero, numeroRetencion } from "./estados";

// Retenciones de IVA e ISLR. Una retención es una parte de la factura "pagada" sin dinero: baja su saldo con un UPDATE atómico condicionado, con la tasa de la factura.
// Practicada = se la hacemos a un proveedor (sobre una factura de compra); sufrida = nos la hace un cliente (sobre una factura de venta).

export type ResultadoRetencion<T = object> = ({ ok: true } & T) | { ok: false; error: string };
class RetencionError extends Error {}

async function ejecutar<T>(trabajo: () => Promise<ResultadoRetencion<T>>): Promise<ResultadoRetencion<T>> {
  try {
    return await trabajo();
  } catch (e) {
    if (e instanceof RetencionError || e instanceof ContaError || e instanceof TesoreriaRechazada) return { ok: false, error: e.message };
    throw e;
  }
}

const redondear2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const redondear4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;
const decimales = (n: number) => (String(n).split(".")[1] ?? "").length;
const fmt = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

export type DatosRetencion = { facturaId: string; tipo: string; porcentaje: number; base?: number | null; concepto?: string | null };
export type DatosRetencionSufrida = DatosRetencion & { comprobante: string; fecha: Date };

/** Base y monto de la retención: IVA se calcula sobre el IVA de la factura; ISLR sobre la base imponible (o una menor indicada). */
function calcular(d: DatosRetencion, iva: number, subtotal: number) {
  if (d.tipo !== "IVA" && d.tipo !== "ISLR") throw new RetencionError("Tipo de retención inválido.");
  if (!Number.isFinite(d.porcentaje) || d.porcentaje <= 0 || d.porcentaje > 100 || decimales(d.porcentaje) > 4) throw new RetencionError("El porcentaje debe estar entre 0 y 100 (máximo 4 decimales).");
  let base: number;
  if (d.tipo === "IVA") {
    if (!(iva > 0)) throw new RetencionError("La factura no tiene IVA que retener.");
    base = iva;
  } else {
    base = d.base ?? subtotal;
    if (!Number.isFinite(base) || base <= 0 || decimales(base) > 4) throw new RetencionError("La base debe ser un monto mayor que 0 (máximo 4 decimales).");
    if (base > subtotal + 1e-9) throw new RetencionError(`La base no puede superar la base imponible de la factura (${fmt(subtotal)} USD).`);
  }
  const monto = redondear4((base * d.porcentaje) / 100);
  if (!(monto > 0)) throw new RetencionError("La retención resulta menor a 0,0001 USD.");
  return { base: redondear4(base), monto };
}

async function siguienteNumero(tx: Parameters<Parameters<Db["$transaction"]>[0]>[0]) {
  const r = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval(pg_get_serial_sequence('retencion', 'numero')) AS n`;
  return Number(r[0].n);
}

/** Retención que le practicamos a un proveedor sobre una de sus facturas. El comprobante lo numeramos nosotros. */
export async function registrarRetencionPracticada(db: Db, actor: Actor, d: DatosRetencion): Promise<ResultadoRetencion<{ id: string; numero: number }>> {
  return ejecutar(async () => {
    const r = await db.$transaction(async (tx) => {
      const f = await tx.facturaCompra.findUnique({ where: { id: d.facturaId }, select: { id: true, numero: true, proveedorId: true, estado: true, iva: true, subtotal: true, tasaUsd: true } });
      if (!f) throw new RetencionError("La factura no existe.");
      if (f.estado !== "REGISTRADA") throw new RetencionError("La factura está anulada.");
      const { base, monto } = calcular(d, Number(f.iva), Number(f.subtotal));
      if (await tx.retencion.findFirst({ where: { facturaCompraId: f.id, tipo: d.tipo, estado: "ACTIVA" }, select: { numero: true } })) throw new RetencionError(`Esta factura ya tiene una retención de ${d.tipo} vigente.`);
      const u = await tx.facturaCompra.updateMany({ where: { id: f.id, estado: "REGISTRADA", saldo: { gte: monto } }, data: { saldo: { decrement: monto } } });
      if (u.count === 0) {
        const x = await tx.facturaCompra.findUniqueOrThrow({ where: { id: f.id }, select: { saldo: true } });
        throw new RetencionError(`La retención (${fmt(monto)} USD) supera lo que aún se debe de ${numeroFacturaCompra(f.numero)} (${fmt(Number(x.saldo))} USD).`);
      }
      const fecha = hoyCaracas();
      const numero = await siguienteNumero(tx);
      const comprobante = d.tipo === "IVA" ? `${fecha.getUTCFullYear()}${String(fecha.getUTCMonth() + 1).padStart(2, "0")}${String(numero).padStart(8, "0")}` : `RI-${String(numero).padStart(6, "0")}`;
      const tasa = Number(f.tasaUsd);
      const ret = await tx.retencion.create({
        data: {
          numero, tipo: d.tipo, sentido: "PRACTICADA", facturaCompraId: f.id, proveedorId: f.proveedorId, comprobante, fecha, concepto: d.concepto?.trim() || null,
          baseUsd: base, porcentaje: d.porcentaje, montoUsd: monto, tasaUsd: tasa, montoBs: redondear2(monto * tasa), creadoPorId: actor.id, creadoPorNombre: actor.nombre,
        },
        select: { id: true, numero: true },
      });
      await contabilizarRetencion(tx, actor, ret.id);
      return { ...ret, factura: numeroFacturaCompra(f.numero), comprobante };
    });
    await registrarCambio(db, actor, { modulo: "cxp", entidad: "retencion", entidadId: r.id, descripcion: numeroRetencion(r.numero), accion: "crear", despues: { tipo: d.tipo, sentido: "PRACTICADA", factura: r.factura, comprobante: r.comprobante, porcentaje: d.porcentaje } });
    return { ok: true, id: r.id, numero: r.numero };
  });
}

/** Retención que un cliente nos hizo sobre una de nuestras facturas. El comprobante es el que él nos entregó. */
export async function registrarRetencionSufrida(db: Db, actor: Actor, d: DatosRetencionSufrida): Promise<ResultadoRetencion<{ id: string; numero: number }>> {
  return ejecutar(async () => {
    const comprobante = d.comprobante.trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9\-/.]{0,39}$/.test(comprobante)) throw new RetencionError("Indica el número del comprobante de retención (letras, dígitos, guion, punto o barra).");
    if (d.fecha.getTime() > hoyCaracas().getTime()) throw new RetencionError("La fecha del comprobante no puede ser futura.");
    const r = await db.$transaction(async (tx) => {
      const f = await tx.factura.findUnique({ where: { id: d.facturaId }, select: { id: true, numero: true, clienteId: true, estado: true, iva: true, subtotal: true, tasaUsd: true } });
      if (!f) throw new RetencionError("La factura no existe.");
      if (f.estado !== "EMITIDA") throw new RetencionError("La factura está anulada.");
      const { base, monto } = calcular(d, Number(f.iva), Number(f.subtotal));
      if (await tx.retencion.findFirst({ where: { facturaId: f.id, tipo: d.tipo, estado: "ACTIVA" }, select: { numero: true } })) throw new RetencionError(`Esta factura ya tiene una retención de ${d.tipo} vigente.`);
      if (await tx.retencion.findFirst({ where: { sentido: "SUFRIDA", clienteId: f.clienteId, tipo: d.tipo, comprobante, estado: "ACTIVA" }, select: { numero: true } })) throw new RetencionError(`El comprobante ${comprobante} ya está registrado para este cliente.`);
      const u = await tx.factura.updateMany({ where: { id: f.id, estado: "EMITIDA", saldo: { gte: monto } }, data: { saldo: { decrement: monto } } });
      if (u.count === 0) {
        const x = await tx.factura.findUniqueOrThrow({ where: { id: f.id }, select: { saldo: true } });
        throw new RetencionError(`La retención (${fmt(monto)} USD) supera lo que aún se debe de ${numeroFactura(f.numero)} (${fmt(Number(x.saldo))} USD).`);
      }
      const tasa = Number(f.tasaUsd);
      const ret = await tx.retencion.create({
        data: {
          tipo: d.tipo, sentido: "SUFRIDA", facturaId: f.id, clienteId: f.clienteId, comprobante, fecha: d.fecha, concepto: d.concepto?.trim() || null,
          baseUsd: base, porcentaje: d.porcentaje, montoUsd: monto, tasaUsd: tasa, montoBs: redondear2(monto * tasa), creadoPorId: actor.id, creadoPorNombre: actor.nombre,
        },
        select: { id: true, numero: true },
      });
      await contabilizarRetencion(tx, actor, ret.id);
      return { ...ret, factura: numeroFactura(f.numero) };
    });
    await registrarCambio(db, actor, { modulo: "cxc", entidad: "retencion", entidadId: r.id, descripcion: numeroRetencion(r.numero), accion: "crear", despues: { tipo: d.tipo, sentido: "SUFRIDA", factura: r.factura, comprobante, porcentaje: d.porcentaje } });
    return { ok: true, id: r.id, numero: r.numero };
  });
}

/** Anula una retención: devuelve el saldo a la factura y genera el asiento inverso. */
export async function anularRetencion(db: Db, actor: Actor, id: string, motivo: string): Promise<ResultadoRetencion<{ modulo: string }>> {
  return ejecutar(async () => {
    const m = motivo.trim();
    if (m.length < 3) throw new RetencionError("Indica el motivo de la anulación.");
    const r = await db.$transaction(async (tx) => {
      const u = await tx.retencion.updateMany({ where: { id, estado: "ACTIVA" }, data: { estado: "ANULADA", anuladaEn: new Date(), anuladaPorNombre: actor.nombre, motivoAnulacion: m.slice(0, 500) } });
      if (u.count === 0) throw new RetencionError("La retención ya está anulada o no existe. Recarga la página.");
      const x = await tx.retencion.findUniqueOrThrow({ where: { id } });
      if (x.enteroId) throw new RetencionError("Esta retención ya fue enterada al fisco: anula primero ese pago.");
      if (x.sentido === "PRACTICADA" && x.facturaCompraId) await tx.facturaCompra.update({ where: { id: x.facturaCompraId }, data: { saldo: { increment: x.montoUsd } } });
      else if (x.facturaId) await tx.factura.update({ where: { id: x.facturaId }, data: { saldo: { increment: x.montoUsd } } });
      await revertirRetencion(tx, actor, x.numero);
      return x;
    });
    await registrarCambio(db, actor, { modulo: r.sentido === "PRACTICADA" ? "cxp" : "cxc", entidad: "retencion", entidadId: id, descripcion: numeroRetencion(r.numero), accion: "otro", despues: { estado: "ANULADA", motivo: m } });
    return { ok: true, modulo: r.sentido === "PRACTICADA" ? "cxp" : "cxc" };
  });
}

// ===================== ENTERO AL FISCO =====================
const numeroTexto = (n: number) => numeroEntero(n);

/** Paga al fisco las retenciones practicadas (del mismo impuesto) que se elijan: una salida de tesorería en bolívares, el asiento y la marca de «enterada». Todo o nada. */
export async function enterarRetenciones(db: Db, actor: Actor, d: { tipo: string; retencionIds: string[]; cuentaId: string; referencia: string | null }): Promise<ResultadoRetencion<{ id: string; numero: number }>> {
  return ejecutar(async () => {
    if (d.tipo !== "IVA" && d.tipo !== "ISLR") throw new RetencionError("Tipo de impuesto inválido.");
    const ids = [...new Set(d.retencionIds)];
    if (ids.length === 0) throw new RetencionError("Elige al menos una retención para enterar.");
    if (ids.length > 500) throw new RetencionError("Máximo 500 retenciones por pago.");
    const r = await db.$transaction(async (tx) => {
      const cuenta = await tx.cuentaTesoreria.findUnique({ where: { id: d.cuentaId }, select: { moneda: true, activo: true, codigo: true } });
      if (!cuenta || !cuenta.activo) throw new RetencionError("Elige una cuenta de tesorería activa.");
      if (cuenta.moneda !== "VES") throw new RetencionError("Los impuestos se pagan en bolívares: elige una cuenta en Bs.");
      const rets = await tx.retencion.findMany({ where: { id: { in: ids } }, select: { id: true, tipo: true, sentido: true, estado: true, enteroId: true, montoBs: true } });
      if (rets.length !== ids.length) throw new RetencionError("Una retención no existe.");
      if (rets.some((x) => x.sentido !== "PRACTICADA" || x.tipo !== d.tipo || x.estado !== "ACTIVA")) throw new RetencionError(`Solo se enteran retenciones de ${d.tipo} practicadas y vigentes.`);
      if (rets.some((x) => x.enteroId)) throw new RetencionError("Alguna retención ya fue enterada.");
      const montoBs = redondear2(rets.reduce((s, x) => s + Number(x.montoBs), 0));
      const e = await tx.enteroRetencion.create({ data: { tipo: d.tipo, fecha: hoyCaracas(), cuentaId: d.cuentaId, montoBs, referencia: d.referencia, creadoPorId: actor.id, creadoPorNombre: actor.nombre }, select: { id: true, numero: true } });
      // Se marcan solo las que siguen sin enterar: dos personas no pueden enterar la misma retención.
      const u = await tx.retencion.updateMany({ where: { id: { in: ids }, enteroId: null, estado: "ACTIVA" }, data: { enteroId: e.id } });
      if (u.count !== ids.length) throw new RetencionError("Alguna retención cambió mientras la veías. Recarga la página.");
      await aplicarMovimientoCuenta(tx, actor, { cuentaId: d.cuentaId, tipo: "ENTERO_IMPUESTO", monto: montoBs, documento: numeroTexto(e.numero), descripcion: `Pago de retenciones de ${d.tipo} al fisco${d.referencia ? ` · ref. ${d.referencia}` : ""}` });
      await contabilizarEntero(tx, actor, e.id);
      return { ...e, montoBs, n: ids.length };
    });
    await registrarCambio(db, actor, { modulo: "cxp", entidad: "entero_retencion", entidadId: r.id, descripcion: numeroEntero(r.numero), accion: "crear", despues: { tipo: d.tipo, retenciones: r.n, montoBs: r.montoBs, referencia: d.referencia } });
    return { ok: true, id: r.id, numero: r.numero };
  });
}

/** Anula el pago al fisco: las retenciones vuelven a estar por enterar, el dinero regresa a la cuenta y el asiento se revierte. */
export async function anularEntero(db: Db, actor: Actor, id: string, motivo: string): Promise<ResultadoRetencion> {
  return ejecutar(async () => {
    const m = motivo.trim();
    if (m.length < 3) throw new RetencionError("Indica el motivo de la anulación.");
    const numero = await db.$transaction(async (tx) => {
      const u = await tx.enteroRetencion.updateMany({ where: { id, estado: "ACTIVO" }, data: { estado: "ANULADO", anuladoEn: new Date(), anuladoPorNombre: actor.nombre, motivoAnulacion: m.slice(0, 500) } });
      if (u.count === 0) throw new RetencionError("El pago ya está anulado o no existe. Recarga la página.");
      const e = await tx.enteroRetencion.findUniqueOrThrow({ where: { id } });
      await tx.retencion.updateMany({ where: { enteroId: id }, data: { enteroId: null } });
      await aplicarMovimientoCuenta(tx, actor, { cuentaId: e.cuentaId, tipo: "ANULACION_ENTERO", monto: Number(e.montoBs), documento: numeroEntero(e.numero), descripcion: `Anulación: ${m.slice(0, 120)}` });
      await revertirEntero(tx, actor, e.numero);
      return e.numero;
    });
    await registrarCambio(db, actor, { modulo: "cxp", entidad: "entero_retencion", entidadId: id, descripcion: numeroEntero(numero), accion: "otro", despues: { estado: "ANULADO", motivo: m } });
    return { ok: true };
  });
}
