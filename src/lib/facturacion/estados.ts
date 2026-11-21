// Constantes de facturación sin acceso a datos: las puede importar tanto el servidor como el navegador.
export const numeroFactura = (n: number) => `FAC-${String(n).padStart(6, "0")}`;
export const ESTADOS_FACTURA = {
  EMITIDA: { etiqueta: "Emitida", tono: "exito" },
  ANULADA: { etiqueta: "Anulada", tono: "error" },
} as const;
export type EstadoFactura = keyof typeof ESTADOS_FACTURA;
