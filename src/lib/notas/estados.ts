// Constantes de notas de crédito y débito sin acceso a datos (las usan servidor y navegador).
export { calcularLinea } from "@/lib/pedidos/calculos";

export const numeroNotaVenta = (tipo: string, n: number) => `${tipo === "CREDITO" ? "NC" : "ND"}-${String(n).padStart(6, "0")}`;
/** Las notas del proveedor llevan P para no confundirlas con las propias: NCP-… (crédito) y NDP-… (débito). */
export const numeroNotaCompra = (tipo: string, n: number) => `${tipo === "CREDITO" ? "NCP" : "NDP"}-${String(n).padStart(6, "0")}`;

export const TIPOS_NOTA = { CREDITO: "Nota de crédito", DEBITO: "Nota de débito" } as const;
export const MODOS_NOTA_VENTA = {
  DEVOLUCION: "Devolución de mercancía",
  AJUSTE: "Ajuste de monto (descuento o corrección)",
  CARGO: "Cargo adicional",
} as const;
export const ESTADOS_NOTA = {
  ACTIVA: { etiqueta: "Activa", tono: "exito" },
  ANULADA: { etiqueta: "Anulada", tono: "error" },
} as const;
export type EstadoNota = keyof typeof ESTADOS_NOTA;
