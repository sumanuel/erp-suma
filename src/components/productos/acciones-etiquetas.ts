"use server";

import { requerirPermisoAccion } from "@/lib/dal";
import { resolverPrecios } from "@/lib/ventas/precios";

export type ProductoEtiqueta = { codigo: string; descripcion: string; codigoBarras: string | null; unidad: string; precioUsd: number };

/** Productos para imprimir etiquetas: con su precio de la lista elegida, el código de barras y la unidad principal. */
export async function buscarProductosEtiqueta(texto: string, lista: string): Promise<ProductoEtiqueta[]> {
  const { db } = await requerirPermisoAccion("productos", "ver");
  const q = texto.trim().slice(0, 60);
  if (q.length < 2) return [];
  const r = await db.producto.findMany({
    where: { activo: true, OR: [{ codigo: { contains: q, mode: "insensitive" } }, { descripcion: { contains: q, mode: "insensitive" } }, { codigoBarras: q }] },
    include: { presentaciones: { orderBy: [{ principal: "desc" }, { cantidad: "asc" }], take: 1, include: { unidadMedida: { select: { nombre: true } } } } },
    orderBy: { descripcion: "asc" },
    take: 12,
  });
  const precios = await resolverPrecios(db, r.map((p) => p.codigo), /^[A-Z]$/.test(lista) ? lista : "A");
  return r.map((p) => ({ codigo: p.codigo, descripcion: p.descripcion, codigoBarras: p.codigoBarras, unidad: p.presentaciones[0]?.unidadMedida.nombre ?? "", precioUsd: precios.get(p.codigo)?.precioUsd ?? Number(p.precioLista) }));
}
