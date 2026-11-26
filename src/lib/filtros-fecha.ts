// Rango de fechas de los listados de documentos. Con las fechas ausentes de la dirección se usa el valor de entrada de cada lista (el mes en
// curso o todas); con las fechas vacías (`desde=&hasta=`) salen todas.
import { hoyCaracas } from "@/lib/tasas";

const dia = (s: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

export function rangoDeFechas(p: { desde?: string; hasta?: string }, alEntrar: "mes" | "todas") {
  const hoy = hoyCaracas().toISOString().slice(0, 10);
  const desde = p.desde ?? (alEntrar === "mes" ? `${hoy.slice(0, 8)}01` : "");
  const hasta = p.hasta ?? (alEntrar === "mes" ? hoy : "");
  return { desde, hasta, desdeFecha: dia(desde), hastaFecha: dia(hasta) };
}

export const porFecha = (desde?: Date, hasta?: Date) => (desde || hasta ? { fecha: { ...(desde ? { gte: desde } : {}), ...(hasta ? { lte: hasta } : {}) } } : {});
