// Constantes de contabilidad sin acceso a datos (las usan servidor y navegador).
export const TIPOS_CUENTA_CONTABLE = {
  ACTIVO: { etiqueta: "Activo", naturaleza: "DEUDORA" },
  PASIVO: { etiqueta: "Pasivo", naturaleza: "ACREEDORA" },
  PATRIMONIO: { etiqueta: "Patrimonio", naturaleza: "ACREEDORA" },
  INGRESO: { etiqueta: "Ingreso", naturaleza: "ACREEDORA" },
  COSTO: { etiqueta: "Costo", naturaleza: "DEUDORA" },
  GASTO: { etiqueta: "Gasto", naturaleza: "DEUDORA" },
} as const;
export type TipoCuentaContable = keyof typeof TIPOS_CUENTA_CONTABLE;

export const numeroAsiento = (n: number) => `AS-${String(n).padStart(6, "0")}`;
export const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const nombrePeriodo = (anio: number, mes: number) => `${MESES[mes - 1]} ${anio}`;

/** Pasa un monto a centavos enteros; null si trae más de 2 decimales o no es un número finito. */
export function aCentavos(n: number): number | null {
  if (!Number.isFinite(n)) return null;
  const c = Math.round(n * 100);
  return Math.abs(n * 100 - c) < 1e-6 ? c : null;
}

export const ESTADOS_ASIENTO = {
  REGISTRADO: { etiqueta: "Registrado", tono: "exito" },
  ANULADO: { etiqueta: "Anulado", tono: "error" },
} as const;
export type EstadoAsiento = keyof typeof ESTADOS_ASIENTO;
