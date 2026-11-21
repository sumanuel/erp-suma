// Constantes de cotizaciones sin acceso a datos (las usan servidor y navegador). Los cálculos son los mismos del pedido.
export { calcularLinea, calcularTotales } from "@/lib/pedidos/calculos";

export const numeroCotizacion = (n: number) => `COT-${String(n).padStart(6, "0")}`;

export const ESTADOS_COTIZACION = {
  BORRADOR: { etiqueta: "Borrador", tono: "neutro" },
  EMITIDA: { etiqueta: "Emitida", tono: "marca" },
  ACEPTADA: { etiqueta: "Aceptada", tono: "exito" },
  RECHAZADA: { etiqueta: "Rechazada", tono: "aviso" },
  ANULADA: { etiqueta: "Anulada", tono: "error" },
} as const;
export type EstadoCotizacion = keyof typeof ESTADOS_COTIZACION;

/** ¿Sigue vigente? `hoy` y `vence` son fechas de día completo (UTC medianoche); vence hasta el final de su fecha de vencimiento. */
export const estaVigente = (hoy: Date, vence: Date) => hoy.getTime() <= vence.getTime();
