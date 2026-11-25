import "server-only";
import { hoyCaracas } from "@/lib/tasas";
import type { Parametro } from "./tipos";

export const redondear2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Valores válidos de los parámetros de un reporte: lo que llegue en la URL se valida; lo inválido o ausente toma el valor por defecto. */
export function resolverParametros(def: Parametro[], pedidos: Record<string, string | undefined>): Record<string, string> {
  const hoy = hoyCaracas();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const defectoFecha = { hoy: iso(hoy), inicioMes: iso(new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1))), inicioAnio: iso(new Date(Date.UTC(hoy.getUTCFullYear(), 0, 1))) };
  const r: Record<string, string> = {};
  for (const p of def) {
    const v = pedidos[p.id];
    if (p.tipo === "fecha") r[p.id] = v && FECHA.test(v) && !Number.isNaN(new Date(`${v}T00:00:00.000Z`).getTime()) ? v : defectoFecha[p.defecto];
    else if (p.tipo === "texto") r[p.id] = (v ?? "").trim().slice(0, 60);
    else r[p.id] = v && p.opciones.some((o) => o.valor === v) ? v : p.defecto;
  }
  // Si el rango viene al revés, se acomoda.
  if (r.desde && r.hasta && r.desde > r.hasta) [r.desde, r.hasta] = [r.hasta, r.desde];
  return r;
}

export const aFecha = (s: string) => new Date(`${s}T00:00:00.000Z`);

/** El día de Caracas de un momento (con hora), como fecha de calendario: para mostrar movimientos hechos de noche con su fecha local. */
export const diaCaracas = (momento: Date) => aFecha(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(momento));
