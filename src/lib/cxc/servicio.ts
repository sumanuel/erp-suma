import "server-only";
import type { Db } from "@/lib/tenant";
import { registrarCambio } from "@/lib/auditoria";
import type { Actor, Tx } from "@/lib/inventario/movimientos";
import { numeroFactura } from "@/lib/facturacion/estados";
import { hoyCaracas, tasaVigente } from "@/lib/tasas";
import { aplicarMovimientoCuenta, TesoreriaRechazada } from "@/lib/tesoreria/movimientos";
import { contabilizarCobro, revertirCobro } from "@/lib/contabilidad/automatico";
import { ContaError } from "@/lib/contabilidad/servicio";
import { FORMAS_PAGO, numeroCobro, type FormaPago } from "./estados";

// Servicio de cuentas por cobrar. Un cobro baja el saldo de sus facturas con un UPDATE atómico condicionado (nadie puede cobrar más de lo que
// se debe, ni dos cobros simultáneos pasarse del saldo). Anular un cobro restituye exactamente lo que aplicó.

export type ResultadoCobro<T = object> = ({ ok: true } & T) | { ok: false; error: string };
export class CobroError extends Error {}

const redondear2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const decimales = (n: number) => (String(n).split(".")[1] ?? "").length;

export type DatosCobro = {
  /// Fecha del recibo (por omisión hoy; no puede ser futura).
  fecha?: Date;
  cobradorId?: string | null;
  reciboId?: string | null;
  /// Pago con cheque: banco emisor, número y fecha del cheque.
  bancoChequeId?: string | null;
  numeroCheque?: string | null;
  fechaCheque?: Date | null;
  numeroComprobante?: string | null;
  clienteId: string;
  formaPago: string;
  moneda: string;
  /// Cuenta de tesorería (caja o banco) donde entra el dinero; debe ser de la misma moneda en que pagó el cliente.
  cuentaId: string;
  referencia: string | null;
  observaciones: string | null;
  aplicaciones: { facturaId: string; montoUsd: number }[];
};

async function ejecutar<T>(trabajo: () => Promise<ResultadoCobro<T>>): Promise<ResultadoCobro<T>> {
  try {
    return await trabajo();
  } catch (e) {
    if (e instanceof CobroError || e instanceof TesoreriaRechazada || e instanceof ContaError) return { ok: false, error: e.message };
    throw e;
  }
}

/**
 * Registra un cobro DENTRO de la transacción recibida (la usa el punto de venta para cobrar y facturar a la vez). `aplic` ya viene filtrada y validada.
 * `montoMoneda` fija el monto exacto recibido en la moneda del pago (por ejemplo, los bolívares que se contaron) en vez de recalcularlo desde USD.
 */
export async function cobrarEnTx(tx: Tx, actor: Actor, d: DatosCobro, aplic: { facturaId: string; montoUsd: number }[], opc: { montoMoneda?: number } = {}) {
      const cliente = await tx.cliente.findUnique({ where: { id: d.clienteId }, select: { activo: true } });
      if (!cliente) throw new CobroError("El cliente no existe.");
      const total = aplic.reduce((s, a) => s + a.montoUsd, 0);
      const montoUsd = Math.round(total * 10000) / 10000;
      let tasa: number | null = null;
      if (d.moneda === "VES") {
        const t = await tasaVigente(tx as unknown as Db, "USD");
        if (!t) throw new CobroError("No hay tasa del dólar cargada para convertir el pago en bolívares.");
        tasa = t.valor;
      }
      const montoMoneda = opc.montoMoneda ?? (d.moneda === "VES" ? redondear2(montoUsd * (tasa as number)) : redondear2(montoUsd));
      if (!(montoMoneda > 0)) throw new CobroError("El monto es demasiado pequeño.");

      for (const a of aplic) {
        // Baja el saldo solo si la factura es de este cliente, está emitida y todavía debe al menos esto.
        const u = await tx.factura.updateMany({ where: { id: a.facturaId, clienteId: d.clienteId, estado: "EMITIDA", saldo: { gte: a.montoUsd } }, data: { saldo: { decrement: a.montoUsd } } });
        if (u.count === 0) {
          const f = await tx.factura.findUnique({ where: { id: a.facturaId }, select: { numero: true, estado: true, saldo: true, clienteId: true } });
          if (!f || f.clienteId !== d.clienteId) throw new CobroError("Una factura no pertenece a este cliente.");
          if (f.estado !== "EMITIDA") throw new CobroError(`${numeroFactura(f.numero)} está anulada.`);
          throw new CobroError(`${numeroFactura(f.numero)}: solo se debe ${Number(f.saldo)} USD.`);
        }
      }
      const cuenta = await tx.cuentaTesoreria.findUnique({ where: { id: d.cuentaId }, select: { moneda: true, activo: true, codigo: true } });
      if (!cuenta || !cuenta.activo) throw new CobroError("Elige una cuenta de tesorería activa.");
      if (cuenta.moneda !== d.moneda) throw new CobroError(`La cuenta ${cuenta.codigo} es en ${cuenta.moneda}: no recibe un pago en ${d.moneda}.`);
      const hoy = hoyCaracas();
      if (d.fecha && d.fecha.getTime() > hoy.getTime()) throw new CobroError("La fecha del cobro no puede ser futura.");
      if (d.formaPago === "CHEQUE" && !d.numeroCheque?.trim()) throw new CobroError("Indica el número del cheque.");
      if (d.cobradorId && !(await tx.vendedor.findUnique({ where: { id: d.cobradorId }, select: { esCobrador: true, activo: true } }))?.esCobrador) throw new CobroError("El cobrador no existe o no es cobrador.");
      if (d.bancoChequeId && !(await tx.banco.findUnique({ where: { id: d.bancoChequeId }, select: { id: true } }))) throw new CobroError("El banco del cheque no existe.");
      const c = await tx.cobro.create({
        data: {
          reciboId: d.reciboId ?? null, cobradorId: d.cobradorId || null, bancoChequeId: d.bancoChequeId || null, numeroCheque: d.numeroCheque?.trim().slice(0, 30) || null,
          fechaCheque: d.fechaCheque ?? null, numeroComprobante: d.numeroComprobante?.trim().slice(0, 50) || null,
          cuentaId: d.cuentaId, clienteId: d.clienteId, fecha: d.fecha ?? hoy, formaPago: d.formaPago, moneda: d.moneda, montoMoneda, tasaUsd: tasa, montoUsd,
          referencia: d.referencia, observaciones: d.observaciones, creadoPorId: actor.id, creadoPorNombre: actor.nombre,
          aplicaciones: { create: aplic.map((a) => ({ facturaId: a.facturaId, montoUsd: a.montoUsd })) },
        },
        select: { id: true, numero: true },
      });
      await aplicarMovimientoCuenta(tx, actor, { cuentaId: d.cuentaId, tipo: "COBRO", monto: montoMoneda, documento: numeroCobro(c.numero), descripcion: `Cobro a cliente${d.referencia ? ` · ref. ${d.referencia}` : ""}` });
      await contabilizarCobro(tx, actor, c.id);
      return { ...c, montoUsd, montoMoneda };
}

export async function registrarCobro(db: Db, actor: Actor, d: DatosCobro): Promise<ResultadoCobro<{ id: string; numero: number }>> {
  return ejecutar(async () => {
    if (!(d.formaPago in FORMAS_PAGO)) throw new CobroError("Forma de pago inválida.");
    if (d.moneda !== "USD" && d.moneda !== "VES") throw new CobroError("Moneda inválida.");
    const aplic = d.aplicaciones.filter((a) => a.montoUsd > 0);
    if (aplic.length === 0) throw new CobroError("Indica cuánto se aplica al menos a una factura.");
    if (aplic.length > 200) throw new CobroError("Máximo 200 facturas por cobro.");
    if (new Set(aplic.map((a) => a.facturaId)).size !== aplic.length) throw new CobroError("Hay una factura repetida.");
    for (const a of aplic) if (!Number.isFinite(a.montoUsd) || decimales(a.montoUsd) > 4 || a.montoUsd > 1e12) throw new CobroError("Los montos admiten hasta 4 decimales.");

    const r = await db.$transaction((tx) => cobrarEnTx(tx, actor, d, aplic));
    await registrarCambio(db, actor, {
      modulo: "cxc", entidad: "cobro", entidadId: r.id, descripcion: numeroCobro(r.numero), accion: "crear",
      despues: { formaPago: d.formaPago, moneda: d.moneda, montoMoneda: r.montoMoneda, montoUsd: r.montoUsd, facturas: aplic.length },
    });
    return { ok: true, id: r.id, numero: r.numero };
  });
}

/** Anula un cobro: devuelve a cada factura lo que se le aplicó. */
export async function anularCobro(db: Db, actor: Actor, id: string, motivo: string): Promise<ResultadoCobro> {
  return ejecutar(async () => {
    const m = motivo.trim();
    if (m.length < 3) throw new CobroError("Indica el motivo de la anulación.");
    const numero = await db.$transaction(async (tx) => {
      const u = await tx.cobro.updateMany({ where: { id, estado: "REGISTRADO" }, data: { estado: "ANULADO", anuladoEn: new Date(), anuladoPorNombre: actor.nombre, motivoAnulacion: m.slice(0, 500) } });
      if (u.count === 0) throw new CobroError("El cobro ya está anulado o no existe. Recarga la página.");
      const c = await tx.cobro.findUniqueOrThrow({ where: { id }, include: { aplicaciones: true } });
      for (const a of c.aplicaciones) await tx.factura.update({ where: { id: a.facturaId }, data: { saldo: { increment: a.montoUsd } } });
      // El dinero que entró vuelve a salir de la cuenta; si ya se gastó y no alcanza, la anulación se rechaza completa.
      if (c.cuentaId) await aplicarMovimientoCuenta(tx, actor, { cuentaId: c.cuentaId, tipo: "ANULACION_COBRO", monto: Number(c.montoMoneda), documento: numeroCobro(c.numero), descripcion: `Anulación: ${m.slice(0, 120)}` });
      await revertirCobro(tx, actor, c.numero);
      return c.numero;
    });
    await registrarCambio(db, actor, { modulo: "cxc", entidad: "cobro", entidadId: id, descripcion: numeroCobro(numero), accion: "otro", despues: { estado: "ANULADO", motivo: m } });
    return { ok: true };
  });
}

export const esFormaPago = (v: string): v is FormaPago => v in FORMAS_PAGO;

// ---------- Recibo de ingreso con varias formas de pago ----------

export type PagoRecibo = {
  formaPago: string;
  moneda: string;
  /// Lo que entregó el cliente en esa forma, en su moneda.
  monto: number;
  cuentaId: string;
  referencia?: string | null;
  bancoChequeId?: string | null;
  numeroCheque?: string | null;
  fechaCheque?: Date | null;
};
export type DatosRecibo = { clienteId: string; fecha?: Date; cobradorId?: string | null; numeroComprobante?: string | null; observaciones: string | null; pagos: PagoRecibo[]; aplicaciones: { facturaId: string; montoUsd: number }[] };

/**
 * Recibo de ingreso: el cliente paga con varias formas (50 USD en efectivo, el resto por transferencia en Bs.) y se reparte entre las facturas elegidas.
 * Genera un cobro por cada forma de pago, todos en una transacción: los pagos deben sumar exactamente lo aplicado a las facturas (a la tasa de hoy).
 */
export async function registrarRecibo(db: Db, actor: Actor, d: DatosRecibo): Promise<ResultadoCobro<{ id: string; numero: number; cobros: { id: string; numero: number }[] }>> {
  return ejecutar(async () => {
    const aplic = d.aplicaciones.filter((a) => a.montoUsd > 0);
    if (aplic.length === 0) throw new CobroError("Indica cuánto se aplica al menos a una factura.");
    if (d.pagos.length === 0) throw new CobroError("Indica al menos una forma de pago.");
    if (d.pagos.length > 10) throw new CobroError("Máximo 10 formas de pago por recibo.");
    for (const p of d.pagos) {
      if (!(p.formaPago in FORMAS_PAGO)) throw new CobroError("Forma de pago inválida.");
      if (p.moneda !== "USD" && p.moneda !== "VES") throw new CobroError("Moneda de pago inválida.");
      if (!(p.monto > 0) || decimales(p.monto) > 2 || p.monto > 1e12) throw new CobroError("Cada pago debe ser un monto mayor que 0 con máximo 2 decimales.");
    }
    for (const a of aplic) if (!Number.isFinite(a.montoUsd) || decimales(a.montoUsd) > 4 || a.montoUsd > 1e12) throw new CobroError("Los montos admiten hasta 4 decimales.");
    if (new Set(aplic.map((a) => a.facturaId)).size !== aplic.length) throw new CobroError("Hay una factura repetida.");

    const r = await db.$transaction(async (tx) => {
      const cliente = await tx.cliente.findUnique({ where: { id: d.clienteId }, select: { activo: true } });
      if (!cliente) throw new CobroError("El cliente no existe.");
      const tasa = (await tasaVigente(tx as unknown as Db, "USD"))?.valor ?? null;
      if (d.pagos.some((p) => p.moneda === "VES") && !tasa) throw new CobroError("No hay tasa del dólar cargada para convertir los pagos en bolívares.");
      const aUsd = (p: PagoRecibo) => Math.round((p.moneda === "USD" ? p.monto : p.monto / (tasa as number)) * 10000) / 10000;

      const aplicado = Math.round(aplic.reduce((s, a) => s + a.montoUsd, 0) * 10000) / 10000;
      const pagado = Math.round(d.pagos.reduce((s, p) => s + aUsd(p), 0) * 10000) / 10000;
      // Tolerancia de un centavo de bolívar: lo que se cuenta no tiene más precisión.
      const tolerancia = tasa ? 0.01 / tasa : 0.005;
      if (Math.abs(pagado - aplicado) > tolerancia) {
        throw new CobroError(pagado > aplicado
          ? `Los pagos (${pagado} USD) superan lo aplicado a las facturas (${aplicado} USD): aplica el resto a otra factura o reduce el pago.`
          : `Los pagos (${pagado} USD) no cubren lo aplicado a las facturas (${aplicado} USD).`);
      }

      const fecha = d.fecha ?? hoyCaracas();
      const recibo = await tx.reciboCobro.create({
        data: { clienteId: d.clienteId, fecha, cobradorId: d.cobradorId || null, observaciones: d.observaciones, creadoPorId: actor.id, creadoPorNombre: actor.nombre },
        select: { id: true, numero: true },
      });

      // Reparto en orden: cada pago consume lo que pueda de las aplicaciones pendientes.
      const cola = aplic.map((a) => ({ ...a, resto: a.montoUsd }));
      const cobros: { id: string; numero: number }[] = [];
      for (const [i, p] of d.pagos.entries()) {
        const ultimo = i === d.pagos.length - 1;
        let porCubrir = ultimo ? Math.round(cola.reduce((s, c) => s + c.resto, 0) * 10000) / 10000 : aUsd(p);
        const partes: { facturaId: string; montoUsd: number }[] = [];
        for (const c of cola) {
          if (porCubrir <= 0) break;
          const t = Math.min(c.resto, porCubrir);
          if (t > 0) {
            partes.push({ facturaId: c.facturaId, montoUsd: Math.round(t * 10000) / 10000 });
            c.resto = Math.round((c.resto - t) * 10000) / 10000;
            porCubrir = Math.round((porCubrir - t) * 10000) / 10000;
          }
        }
        if (partes.length === 0) throw new CobroError("Sobra una forma de pago: las anteriores ya cubrían las facturas.");
        const c = await cobrarEnTx(
          tx, actor,
          { clienteId: d.clienteId, formaPago: p.formaPago, moneda: p.moneda, cuentaId: p.cuentaId, referencia: p.referencia?.trim().slice(0, 100) || null, observaciones: d.observaciones, aplicaciones: partes, fecha, cobradorId: d.cobradorId, reciboId: recibo.id, bancoChequeId: p.bancoChequeId, numeroCheque: p.numeroCheque, fechaCheque: p.fechaCheque, numeroComprobante: d.numeroComprobante },
          partes, { montoMoneda: p.monto },
        );
        cobros.push({ id: c.id, numero: c.numero });
      }
      return { ...recibo, cobros };
    });
    await registrarCambio(db, actor, { modulo: "cxc", entidad: "recibo_cobro", entidadId: r.id, descripcion: `RC-${String(r.numero).padStart(6, "0")}`, accion: "crear", despues: { pagos: d.pagos.length, facturas: aplic.length } });
    return { ok: true, id: r.id, numero: r.numero, cobros: r.cobros };
  });
}
