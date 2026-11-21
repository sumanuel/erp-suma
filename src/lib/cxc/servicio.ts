import "server-only";
import type { Db } from "@/lib/tenant";
import { registrarCambio } from "@/lib/auditoria";
import type { Actor } from "@/lib/inventario/movimientos";
import { numeroFactura } from "@/lib/facturacion/estados";
import { hoyCaracas, tasaVigente } from "@/lib/tasas";
import { aplicarMovimientoCuenta, TesoreriaRechazada } from "@/lib/tesoreria/movimientos";
import { FORMAS_PAGO, numeroCobro, type FormaPago } from "./estados";

// Servicio de cuentas por cobrar. Un cobro baja el saldo de sus facturas con un UPDATE atómico condicionado (nadie puede cobrar más de lo que
// se debe, ni dos cobros simultáneos pasarse del saldo). Anular un cobro restituye exactamente lo que aplicó.

export type ResultadoCobro<T = object> = ({ ok: true } & T) | { ok: false; error: string };
class CobroError extends Error {}

const redondear2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const decimales = (n: number) => (String(n).split(".")[1] ?? "").length;

export type DatosCobro = {
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
    if (e instanceof CobroError || e instanceof TesoreriaRechazada) return { ok: false, error: e.message };
    throw e;
  }
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

    const r = await db.$transaction(async (tx) => {
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
      const montoMoneda = d.moneda === "VES" ? redondear2(montoUsd * (tasa as number)) : redondear2(montoUsd);
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
      const c = await tx.cobro.create({
        data: {
          cuentaId: d.cuentaId, clienteId: d.clienteId, fecha: hoyCaracas(), formaPago: d.formaPago, moneda: d.moneda, montoMoneda, tasaUsd: tasa, montoUsd,
          referencia: d.referencia, observaciones: d.observaciones, creadoPorId: actor.id, creadoPorNombre: actor.nombre,
          aplicaciones: { create: aplic.map((a) => ({ facturaId: a.facturaId, montoUsd: a.montoUsd })) },
        },
        select: { id: true, numero: true },
      });
      await aplicarMovimientoCuenta(tx, actor, { cuentaId: d.cuentaId, tipo: "COBRO", monto: montoMoneda, documento: numeroCobro(c.numero), descripcion: `Cobro a cliente${d.referencia ? ` · ref. ${d.referencia}` : ""}` });
      return { ...c, montoUsd, montoMoneda };
    });
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
      return c.numero;
    });
    await registrarCambio(db, actor, { modulo: "cxc", entidad: "cobro", entidadId: id, descripcion: numeroCobro(numero), accion: "otro", despues: { estado: "ANULADO", motivo: m } });
    return { ok: true };
  });
}

export const esFormaPago = (v: string): v is FormaPago => v in FORMAS_PAGO;
