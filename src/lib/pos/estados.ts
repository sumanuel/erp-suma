// Constantes del punto de venta sin acceso a datos (las usan servidor y navegador).
export const numeroTurno = (n: number) => `TC-${String(n).padStart(6, "0")}`;
export const numeroVentaPos = (n: number) => `VP-${String(n).padStart(6, "0")}`;

export const ESTADOS_TURNO = {
  ABIERTO: { etiqueta: "Abierto", tono: "exito" },
  CERRADO: { etiqueta: "Cerrado", tono: "neutro" },
} as const;
export type EstadoTurno = keyof typeof ESTADOS_TURNO;

/** Formas de pago del mostrador. Solo el efectivo admite vuelto. */
export const FORMAS_PAGO_POS = {
  EFECTIVO: "Efectivo",
  PUNTO_VENTA: "Punto de venta",
  PAGO_MOVIL: "Pago móvil",
  TRANSFERENCIA: "Transferencia",
  ZELLE: "Zelle",
} as const;
