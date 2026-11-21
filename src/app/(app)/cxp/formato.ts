// Formatos de pantalla de Compras (es-VE, hora de Caracas). Los montos son USD con 2 decimales visibles; la cantidad muestra hasta 4.
const fecha = new Intl.DateTimeFormat("es-VE", { dateStyle: "short", timeZone: "UTC" }); // las fechas de día se guardan a medianoche UTC
const fechaHora = new Intl.DateTimeFormat("es-VE", { dateStyle: "short", timeStyle: "short", timeZone: "America/Caracas" });

export const formatoFecha = (d: Date | null | undefined) => (d ? fecha.format(d) : "—");
export const formatoFechaHora = (d: Date | null | undefined) => (d ? fechaHora.format(d) : "—");
export const formatoUsd = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
export const formatoCantidad = (n: number) => n.toLocaleString("es-VE", { maximumFractionDigits: 4 });
