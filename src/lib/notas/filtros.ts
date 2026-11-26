// Filtros que comparten las pestañas de devoluciones y de notas: rango de fechas y búsqueda por número, factura, cliente o motivo.
import { hoyCaracas } from "@/lib/tasas";

const dia = (s: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

/** Al entrar se muestra el mes en curso; con las fechas vacías (`""`, no ausentes) salen todas. */
export function rangoDeFechas(p: { desde?: string; hasta?: string }) {
  const hoy = hoyCaracas().toISOString().slice(0, 10);
  const desde = p.desde ?? `${hoy.slice(0, 8)}01`;
  const hasta = p.hasta ?? hoy;
  return { desde, hasta, desdeFecha: dia(desde), hastaFecha: dia(hasta) };
}

export const porFecha = (desde?: Date, hasta?: Date) => (desde || hasta ? { fecha: { ...(desde ? { gte: desde } : {}), ...(hasta ? { lte: hasta } : {}) } } : {});

/** «NC-5» y «ND-5» buscan esa nota (cada tipo numera por separado); «FAC-5», las de esa factura; un número solo, cualquiera de ellas. */
export function porTexto(buscado: string) {
  const texto = buscado.trim().slice(0, 60);
  if (!texto) return {};
  const n = /^(NC|ND|FAC)?-?0*(\d{1,9})$/i.exec(texto);
  const prefijo = n?.[1]?.toUpperCase();
  const numero = Number(n?.[2]);
  const numeros = !n ? [] : prefijo === "FAC" ? [{ factura: { numero } }] : prefijo ? [{ numero, tipo: prefijo === "NC" ? "CREDITO" : "DEBITO" }] : [{ numero }, { factura: { numero } }];
  const contiene = { contains: texto, mode: "insensitive" as const };
  return { OR: [...numeros, { cliente: { razonSocial: contiene } }, { cliente: { documento: contiene } }, { motivo: contiene }] };
}
