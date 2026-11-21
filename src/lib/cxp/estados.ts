// Constantes de cuentas por pagar sin acceso a datos. Los tramos de antigüedad y las formas de pago son los mismos de Cuentas por cobrar.
export { FORMAS_PAGO, TRAMOS, diasMora, tramoDeMora, type FormaPago, type TramoId } from "@/lib/cxc/estados";

export const numeroFacturaCompra = (n: number) => `FC-${String(n).padStart(6, "0")}`;
export const numeroPago = (n: number) => `PAG-${String(n).padStart(6, "0")}`;

export const ESTADOS_FACTURA_COMPRA = {
  REGISTRADA: { etiqueta: "Registrada", tono: "marca" },
  ANULADA: { etiqueta: "Anulada", tono: "error" },
} as const;
export type EstadoFacturaCompra = keyof typeof ESTADOS_FACTURA_COMPRA;

export const ESTADOS_PAGO = {
  REGISTRADO: { etiqueta: "Registrado", tono: "exito" },
  ANULADO: { etiqueta: "Anulado", tono: "error" },
} as const;
export type EstadoPago = keyof typeof ESTADOS_PAGO;
