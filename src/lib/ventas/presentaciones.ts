// Unidad de venta por línea (presentaciones del producto: caja, bulto, docena…). Sin dependencias de servidor: lo usan los formularios.
// En la base las líneas quedan en unidades base (cantidad y precio_unitario) con la presentación y su `factor`; en pantalla se muestran en la unidad elegida.

export type PresentacionVenta = { id: string; nombre: string; factor: number; precio: number };
export type OpcionesUnidad = { precioUnidad: number; presentaciones: PresentacionVenta[] };

const redondear = (n: number) => Math.round(n * 1e4) / 1e4;

/** Cantidad y precio de una línea guardada, en la unidad en que se vendió (para volver a mostrarla o editarla). */
export const enUnidadDeLinea = (l: { cantidad: unknown; precioUnitario: unknown; factor: unknown }) => ({
  cantidad: String(redondear(Number(l.cantidad) / Number(l.factor))),
  precioUnitario: String(redondear(Number(l.precioUnitario) * Number(l.factor))),
});

type ConUnidad = { precioUnitario: string; presentacionId?: string; precioUnidad?: number; presentaciones?: PresentacionVenta[] };

/** Cambia la unidad de una línea y le pone el precio de lista de esa unidad. */
export function conUnidad<T extends ConUnidad>(l: T, presentacionId: string): T {
  const p = l.presentaciones?.find((x) => x.id === presentacionId);
  const precio = p ? p.precio : l.precioUnidad;
  return { ...l, presentacionId, precioUnitario: precio === undefined ? l.precioUnitario : String(redondear(precio)) };
}
