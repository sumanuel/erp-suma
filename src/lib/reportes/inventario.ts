import "server-only";
import type { Db } from "@/lib/tenant";
import { redondear2 } from "./ayudas";
import type { Fila, Resultado } from "./tipos";

/** Existencias valoradas a costo promedio (USD), por producto o por categoría, de un almacén o de todos. Solo productos con saldo. */
export async function reporteInventarioValorado(db: Db, v: Record<string, string>): Promise<Resultado> {
  const filas = await db.existencia.findMany({
    where: { cantidad: { gt: 0 }, ...(v.almacen ? { almacenId: v.almacen } : {}) },
    include: { producto: { select: { descripcion: true, costoPromedio: true, categoria: { select: { nombre: true } } } } },
  });
  const m = new Map<string, { codigo: string; descripcion: string; categoria: string; cantidad: number; costo: number }>();
  for (const e of filas) {
    const clave = v.agrupar === "categoria" ? e.producto.categoria.nombre : e.productoCodigo;
    const x = m.get(clave) ?? { codigo: e.productoCodigo, descripcion: v.agrupar === "categoria" ? e.producto.categoria.nombre : e.producto.descripcion, categoria: e.producto.categoria.nombre, cantidad: 0, costo: Number(e.producto.costoPromedio) };
    x.cantidad += Number(e.cantidad);
    m.set(clave, x);
  }
  const valor = (x: { cantidad: number; costo: number }) => redondear2(x.cantidad * x.costo);
  if (v.agrupar === "categoria") {
    // El valor de una categoría es la suma de sus productos (no cantidad × un costo único).
    const v2 = new Map<string, number>();
    const unidades = new Map<string, number>();
    for (const e of filas) {
      const c = e.producto.categoria.nombre;
      v2.set(c, (v2.get(c) ?? 0) + Number(e.cantidad) * Number(e.producto.costoPromedio));
      unidades.set(c, (unidades.get(c) ?? 0) + 1);
    }
    const lista: Fila[] = [...v2.entries()].sort((a, b) => b[1] - a[1]).map(([c, val]) => ({ categoria: c, lineas: unidades.get(c) ?? 0, valor: redondear2(val) }));
    return { columnas: [{ clave: "categoria", titulo: "Categoría", tipo: "texto" }, { clave: "lineas", titulo: "Líneas de existencia", tipo: "entero" }, { clave: "valor", titulo: "Valor USD", tipo: "moneda" }], filas: lista, totales: { lineas: lista.reduce((s, f) => s + (f.lineas as number), 0), valor: redondear2(lista.reduce((s, f) => s + (f.valor as number), 0)) }, notas: ["Valorado a costo promedio ponderado."] };
  }
  const lista: Fila[] = [...m.values()].sort((a, b) => valor(b) - valor(a)).map((x) => ({ codigo: x.codigo, descripcion: x.descripcion, categoria: x.categoria, cantidad: x.cantidad, costo: x.costo, valor: valor(x) }));
  return {
    columnas: [
      { clave: "codigo", titulo: "Código", tipo: "texto" }, { clave: "descripcion", titulo: "Producto", tipo: "texto" }, { clave: "categoria", titulo: "Categoría", tipo: "texto" },
      { clave: "cantidad", titulo: "Cantidad", tipo: "numero" }, { clave: "costo", titulo: "Costo promedio USD", tipo: "moneda" }, { clave: "valor", titulo: "Valor USD", tipo: "moneda" },
    ],
    filas: lista,
    totales: { cantidad: lista.reduce((s, f) => s + (f.cantidad as number), 0), valor: redondear2(lista.reduce((s, f) => s + (f.valor as number), 0)) },
    notas: ["Valorado a costo promedio ponderado. Con «Todos los almacenes» las cantidades se suman."],
  };
}
