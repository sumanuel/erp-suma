// Cálculos de un pedido de venta. Son los mismos de una orden de compra (cantidad × precio, descuento, IVA); se reutilizan para que el
// formulario del navegador y el servidor den siempre el mismo resultado. El servidor SIEMPRE recalcula.
export { calcularLinea, calcularTotales, redondear2, redondear4 } from "@/lib/compras/calculos";

export const numeroPedido = (n: number) => `PED-${String(n).padStart(6, "0")}`;

export const ESTADOS_PEDIDO = {
  BORRADOR: { etiqueta: "Borrador", tono: "neutro" },
  POR_APROBAR: { etiqueta: "Por aprobar", tono: "aviso" },
  CONFIRMADO: { etiqueta: "Confirmado", tono: "marca" },
  FACTURADO: { etiqueta: "Facturado", tono: "exito" },
  ANULADO: { etiqueta: "Anulado", tono: "error" },
} as const;
export type EstadoPedido = keyof typeof ESTADOS_PEDIDO;

// Descuentos globales (1, 2 y 3) en cadena: 10 % y 5 % dan 14,5 %, no 15 %. El global se combina con el de cada línea y el resultado (descuento efectivo)
// es el que se guarda en la línea y con el que se calcula todo lo demás (IVA, libros, notas), así nada tiene que saber de los globales.
import { redondear4 as r4 } from "@/lib/compras/calculos";

export const descuentoGlobal = (descuentos: number[]) => r4(100 * (1 - descuentos.reduce((f, d) => f * (1 - d / 100), 1)));
export const descuentoEfectivo = (linea: number, global: number) => r4(100 * (1 - (1 - linea / 100) * (1 - global / 100)));
