import "server-only";
import type { Db } from "./tenant";

// Tasa de cambio: cuántos bolívares vale una unidad de la moneda (USD, EUR). Se guarda y se usa con todos sus decimales (el BCV publica 8);
// nunca se redondea a 2. Solo los montos finales en bolívares se redondean.

export type TasaVigente = { valor: number; fecha: Date };

/** Fecha de hoy en Caracas como Date a medianoche UTC (el formato en que se guardan las fechas de día completo). */
export function hoyCaracas(): Date {
  const d = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(new Date()); // AAAA-MM-DD
  return new Date(`${d}T00:00:00.000Z`);
}

/** La tasa más reciente hasta la fecha indicada (por defecto hoy). Null si la moneda no tiene ninguna tasa cargada. */
export async function tasaVigente(db: Db, moneda: string, fecha: Date = hoyCaracas()): Promise<TasaVigente | null> {
  const t = await db.tasaCambio.findFirst({
    where: { moneda: { codigo: moneda.toUpperCase() }, fecha: { lte: fecha } },
    orderBy: [{ fecha: "desc" }, { creadoEn: "desc" }],
    select: { valor: true, fecha: true },
  });
  const valor = t ? Number(t.valor) : 0;
  return t && valor > 0 ? { valor, fecha: t.fecha } : null;
}

/** Monto en bolívares de un monto en divisa, redondeado a 2 decimales. */
export const aBolivares = (monto: number, tasa: number) => Math.round(monto * tasa * 100) / 100;

/** Monto en divisa de un monto en bolívares, redondeado a 2 decimales. */
export const aDivisa = (bolivares: number, tasa: number) => Math.round((bolivares / tasa) * 100) / 100;

/** Texto de una tasa: hasta 8 decimales, sin ceros de relleno, coma decimal. */
export const textoTasa = (n: number) => n.toLocaleString("es-VE", { maximumFractionDigits: 8 });
