// Cálculos de una orden de compra. Puros (sin acceso a datos) para que los use igual el formulario del navegador y el servidor:
// el servidor SIEMPRE recalcula; lo que muestre el navegador es solo una vista previa.

export const redondear4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;
export const redondear2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type EntradaLinea = { cantidad: number; costoUnitario: number; descuento: number; ivaPorcentaje: number };

export function calcularLinea(l: EntradaLinea) {
  const bruto = redondear4(l.cantidad * l.costoUnitario);
  const neto = redondear4(bruto * (1 - l.descuento / 100));
  const iva = redondear4(neto * (l.ivaPorcentaje / 100));
  return { bruto, neto, iva, total: redondear4(neto + iva), costoNetoUnitario: l.cantidad > 0 ? redondear4(neto / l.cantidad) : 0 };
}

export function calcularTotales(lineas: EntradaLinea[]) {
  let subtotal = 0, descuento = 0, iva = 0, total = 0;
  for (const l of lineas) {
    const c = calcularLinea(l);
    subtotal += c.neto;
    descuento += c.bruto - c.neto;
    iva += c.iva;
    total += c.total;
  }
  return { subtotal: redondear4(subtotal), descuento: redondear4(descuento), iva: redondear4(iva), total: redondear4(total) };
}

export const numeroOrden = (n: number) => `OC-${String(n).padStart(6, "0")}`;
export const numeroRecepcion = (n: number) => `REC-${String(n).padStart(6, "0")}`;

export const ESTADOS_ORDEN = {
  BORRADOR: { etiqueta: "Borrador", tono: "neutro" },
  EMITIDA: { etiqueta: "Emitida", tono: "marca" },
  RECIBIDA_PARCIAL: { etiqueta: "Recibida parcial", tono: "aviso" },
  RECIBIDA: { etiqueta: "Recibida", tono: "exito" },
  ANULADA: { etiqueta: "Anulada", tono: "error" },
} as const;
export type EstadoOrden = keyof typeof ESTADOS_ORDEN;
