// Constantes de retenciones sin acceso a datos (las usan servidor y navegador).
export const numeroRetencion = (n: number) => `RET-${String(n).padStart(6, "0")}`;
export const TIPOS_RETENCION = { IVA: "IVA", ISLR: "ISLR" } as const;
export const SENTIDOS_RETENCION = { PRACTICADA: "Practicada a proveedor", SUFRIDA: "Sufrida (nos la hizo un cliente)" } as const;
export const ESTADOS_RETENCION = {
  ACTIVA: { etiqueta: "Vigente", tono: "exito" },
  ANULADA: { etiqueta: "Anulada", tono: "error" },
} as const;
export type EstadoRetencion = keyof typeof ESTADOS_RETENCION;

export const numeroEntero = (n: number) => `ENT-${String(n).padStart(6, "0")}`;
export const ESTADOS_ENTERO = {
  ACTIVO: { etiqueta: "Vigente", tono: "exito" },
  ANULADO: { etiqueta: "Anulado", tono: "error" },
} as const;
export type EstadoEntero = keyof typeof ESTADOS_ENTERO;
