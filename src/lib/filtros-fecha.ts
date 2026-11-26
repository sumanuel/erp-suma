// Rango de fechas de los filtros. Los calendarios siempre muestran fechas: el mes en curso o, para «todas», desde el primer registro hasta hoy
// (o hasta el último, si hay alguno con fecha futura). Solo se filtra por un extremo cuando de verdad deja algo fuera.
import { hoyCaracas } from "@/lib/tasas";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const dia = (s: string | undefined) => {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || iso(d) !== s ? undefined : d;
};

/** Para `aggregate`: la primera y la última fecha de una tabla. */
export const LIMITES_FECHA = { _min: { fecha: true }, _max: { fecha: true } } as const;
export type LimitesFecha = { _min: { fecha: Date | null }; _max: { fecha: Date | null } };

/** `alEntrar` es lo que se muestra cuando la dirección no trae fechas; con las fechas vacías (`desde=&hasta=`) salen todas. */
export function rangoDeFechas(p: { desde?: string; hasta?: string }, alEntrar: "mes" | "todas", limites: LimitesFecha, ahora: Date = hoyCaracas()) {
  const hoy = iso(ahora);
  const primero = limites._min.fecha && iso(limites._min.fecha) < hoy ? iso(limites._min.fecha) : hoy;
  const ultimo = limites._max.fecha && iso(limites._max.fecha) > hoy ? iso(limites._max.fecha) : hoy;
  const porOmision = (extremo: "desde" | "hasta") => (alEntrar !== "mes" ? "" : extremo === "desde" ? `${hoy.slice(0, 8)}01` : hoy);
  const pedidoDesde = dia(p.desde ?? porOmision("desde"));
  const pedidoHasta = dia(p.hasta ?? porOmision("hasta"));
  const desdeFecha = pedidoDesde && iso(pedidoDesde) > primero ? pedidoDesde : undefined;
  const hastaFecha = pedidoHasta && iso(pedidoHasta) < ultimo ? pedidoHasta : undefined;
  return {
    /// Lo que muestran los calendarios.
    desde: pedidoDesde ? iso(pedidoDesde) : primero,
    hasta: pedidoHasta ? iso(pedidoHasta) : ultimo,
    /// Lo que se filtra (vacío cuando el extremo no deja nada fuera).
    desdeFecha,
    hastaFecha,
    restringe: !!(desdeFecha || hastaFecha),
  };
}

export const porFecha = (desde?: Date, hasta?: Date) => (desde || hasta ? { fecha: { ...(desde ? { gte: desde } : {}), ...(hasta ? { lte: hasta } : {}) } } : {});
