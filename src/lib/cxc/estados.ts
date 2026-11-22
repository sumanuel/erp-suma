// Constantes de cuentas por cobrar sin acceso a datos: las usan servidor y navegador.
export const numeroRecibo = (n: number) => `RC-${String(n).padStart(6, "0")}`;
export const numeroAplicacionAnticipo = (n: number) => `AA-${String(n).padStart(6, "0")}`;
export const numeroCobro = (n: number) => `COB-${String(n).padStart(6, "0")}`;

export const FORMAS_PAGO = {
  EFECTIVO: "Efectivo",
  TRANSFERENCIA: "Transferencia",
  PAGO_MOVIL: "Pago móvil",
  PUNTO_VENTA: "Punto de venta",
  ZELLE: "Zelle",
  CHEQUE: "Cheque",
  OTRO: "Otro",
} as const;
export type FormaPago = keyof typeof FORMAS_PAGO;

export const ESTADOS_COBRO = {
  REGISTRADO: { etiqueta: "Registrado", tono: "exito" },
  ANULADO: { etiqueta: "Anulado", tono: "error" },
} as const;
export type EstadoCobro = keyof typeof ESTADOS_COBRO;

/** Días de mora de una factura: positivo si ya venció, 0 o negativo si aún no. `hoy` y `vence` son fechas de día completo (UTC medianoche). */
export const diasMora = (hoy: Date, vence: Date) => Math.round((hoy.getTime() - vence.getTime()) / 86_400_000);

export const TRAMOS = [
  { id: "porVencer", etiqueta: "Por vencer" },
  { id: "d1_30", etiqueta: "1–30 días" },
  { id: "d31_60", etiqueta: "31–60 días" },
  { id: "d61_90", etiqueta: "61–90 días" },
  { id: "d91", etiqueta: "Más de 90" },
] as const;
export type TramoId = (typeof TRAMOS)[number]["id"];

export function tramoDeMora(mora: number): TramoId {
  if (mora <= 0) return "porVencer";
  if (mora <= 30) return "d1_30";
  if (mora <= 60) return "d31_60";
  if (mora <= 90) return "d61_90";
  return "d91";
}
