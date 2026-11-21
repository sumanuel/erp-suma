// Formatos de pantalla de Compras (es-VE, hora de Caracas). Los montos son USD con 2 decimales visibles; la cantidad muestra hasta 4.
const fecha = new Intl.DateTimeFormat("es-VE", { dateStyle: "short", timeZone: "UTC" }); // las fechas de día se guardan a medianoche UTC
const fechaHora = new Intl.DateTimeFormat("es-VE", { dateStyle: "short", timeStyle: "short", timeZone: "America/Caracas" });

export const formatoFecha = (d: Date | null | undefined) => (d ? fecha.format(d) : "—");
export const formatoFechaHora = (d: Date | null | undefined) => (d ? fechaHora.format(d) : "—");
export const formatoUsd = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
export const formatoCantidad = (n: number) => n.toLocaleString("es-VE", { maximumFractionDigits: 4 });

/** Centavos enteros a texto con 2 decimales (es-VE); cero se muestra vacío si `vacioEnCero`. */
export const formatoCentavos = (c: number, vacioEnCero = false) => (vacioEnCero && c === 0 ? "" : (c / 100).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

/** Rango por defecto de los reportes: del primer día del mes en curso a hoy; lee `desde` y `hasta` (AAAA-MM-DD) si vienen válidos. */
export function rangoDeReporte(hoy: Date, desde?: string, hasta?: string) {
  const ok = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T00:00:00.000Z`).getTime()) ? new Date(`${s}T00:00:00.000Z`) : null);
  const d = ok(desde) ?? new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1));
  const h = ok(hasta) ?? hoy;
  return h.getTime() < d.getTime() ? { desde: h, hasta: d } : { desde: d, hasta: h };
}
