// Cálculos de un pedido de venta. Son los mismos de una orden de compra (cantidad × precio, descuento, IVA); se reutilizan para que el
// formulario del navegador y el servidor den siempre el mismo resultado. El servidor SIEMPRE recalcula.
export { calcularLinea, calcularTotales, redondear2, redondear4 } from "@/lib/compras/calculos";

export const numeroPedido = (n: number) => `PED-${String(n).padStart(6, "0")}`;

export const ESTADOS_PEDIDO = {
  BORRADOR: { etiqueta: "Borrador", tono: "neutro" },
  CONFIRMADO: { etiqueta: "Confirmado", tono: "marca" },
  FACTURADO: { etiqueta: "Facturado", tono: "exito" },
  ANULADO: { etiqueta: "Anulado", tono: "error" },
} as const;
export type EstadoPedido = keyof typeof ESTADOS_PEDIDO;
