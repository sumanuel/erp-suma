import "server-only";
import type { Db } from "@/lib/tenant";
import { hoyCaracas } from "@/lib/tasas";

// Precio de venta de un producto para una lista de precios (A, B, C…): la promoción vigente manda; si no, el precio de la lista (vigente, activo);
// si la lista no tiene precio para el producto, el precio de lista A del producto (`precioLista`). Todo en USD.

export type PrecioResuelto = {
  precioUsd: number;
  /// Descuento que se propone en la línea (el de la lista o el de una promoción de descuento).
  descuentoSugeridoPct: number;
  /// Lo máximo que un vendedor puede rebajar en la línea (0 = sin tope declarado).
  descuentoMaxPct: number;
  origen: "BASE" | "LISTA" | "PROMOCION";
};

type Lector = Pick<Db, "producto" | "productoPrecio" | "promocion">;

export type PromoLleve = { requerida: number; otorgada: number; multiplo: number };

/**
 * Cantidad regalada por una promoción «compra N, llévate M» (la más reciente vigente del producto y la lista). Si lo comprado alcanza la cantidad
 * requerida se regala `otorgada` por cada múltiplo comprado (múltiplo 0 = una sola vez).
 */
export const cantidadBonificada = (p: PromoLleve, comprado: number) => {
  if (!(p.requerida > 0) || !(p.otorgada > 0) || comprado + 1e-9 < p.requerida) return 0;
  const veces = p.multiplo > 0 ? Math.floor((comprado + 1e-9) / p.multiplo) : 1;
  return veces * p.otorgada;
};

export async function promocionesLleve(db: Pick<Db, "promocion">, codigos: string[], lista: string, hoy: Date = hoyCaracas()): Promise<Map<string, PromoLleve>> {
  const r = new Map<string, PromoLleve>();
  if (codigos.length === 0) return r;
  const filas = await db.promocion.findMany({
    where: { productoCodigo: { in: codigos }, presentacionId: null, activo: true, desde: { lte: hoy }, hasta: { gte: hoy }, cantidadRequerida: { gt: 0 }, cantidadOtorgada: { gt: 0 }, OR: [{ lista: null }, { lista }] },
    orderBy: { creadoEn: "desc" },
  });
  for (const f of filas) if (!r.has(f.productoCodigo)) r.set(f.productoCodigo, { requerida: Number(f.cantidadRequerida), otorgada: Number(f.cantidadOtorgada), multiplo: Number(f.multiplo) });
  return r;
}

export async function resolverPrecios(db: Lector, codigos: string[], lista: string, hoy: Date = hoyCaracas()): Promise<Map<string, PrecioResuelto>> {
  const resultado = new Map<string, PrecioResuelto>();
  if (codigos.length === 0) return resultado;
  const [productos, filas, promos] = await Promise.all([
    db.producto.findMany({ where: { codigo: { in: codigos } }, select: { codigo: true, precioLista: true } }),
    db.productoPrecio.findMany({ where: { productoCodigo: { in: codigos }, presentacionId: null, lista, activo: true, OR: [{ venceEn: null }, { venceEn: { gte: hoy } }] } }),
    db.promocion.findMany({
      where: { productoCodigo: { in: codigos }, presentacionId: null, activo: true, desde: { lte: hoy }, hasta: { gte: hoy }, OR: [{ lista: null }, { lista }] },
      orderBy: { creadoEn: "desc" },
    }),
  ]);
  const porProducto = new Map(filas.map((f) => [f.productoCodigo, f]));
  for (const p of productos) {
    const fila = porProducto.get(p.codigo);
    let r: PrecioResuelto = fila
      ? { precioUsd: Number(fila.precioUsd), descuentoSugeridoPct: Number(fila.descuentoPct), descuentoMaxPct: Number(fila.descuentoMaxPct), origen: "LISTA" }
      : { precioUsd: Number(p.precioLista), descuentoSugeridoPct: 0, descuentoMaxPct: 0, origen: "BASE" };
    // Promociones de precio o de descuento (las de «compra N y llévate M» no cambian el precio de la línea).
    const delPrecio = promos.find((x) => x.productoCodigo === p.codigo && x.precioUsd !== null);
    const delDescuento = promos.find((x) => x.productoCodigo === p.codigo && x.precioUsd === null && x.descuentoPct !== null);
    if (delPrecio) r = { ...r, precioUsd: Number(delPrecio.precioUsd), origen: "PROMOCION" };
    else if (delDescuento) r = { ...r, descuentoSugeridoPct: Math.max(r.descuentoSugeridoPct, Number(delDescuento.descuentoPct)), origen: "PROMOCION" };
    resultado.set(p.codigo, r);
  }
  return resultado;
}
