import { Aviso } from "@/components/ui";
import { requerirSesion, tienePermiso } from "@/lib/dal";
import { CambioPrecios } from "./cambio-precios";

/** Pantalla «Cambio de precios» del módulo Productos: carga los catálogos para los filtros. */
export async function PaginaCambioPrecios() {
  const ctx = await requerirSesion();
  if (!tienePermiso(ctx, "productos", "editar")) return <Aviso tono="aviso">No tienes permiso para cambiar precios.</Aviso>;
  const { db } = ctx;
  const [categorias, subcategorias, marcas, divisiones, proveedores] = await Promise.all([
    db.categoria.findMany({ where: { activo: true }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true } }),
    db.subcategoria.findMany({ where: { activo: true }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true, categoriaId: true } }),
    db.marca.findMany({ where: { activo: true }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true } }),
    db.division.findMany({ where: { activo: true }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true } }),
    db.proveedor.findMany({ where: { activo: true }, orderBy: { razonSocial: "asc" }, take: 2000, select: { id: true, razonSocial: true } }),
  ]);
  return (
    <CambioPrecios
      categorias={categorias.map((c) => ({ valor: c.id, etiqueta: c.nombre }))}
      subcategorias={subcategorias.map((s) => ({ valor: s.id, etiqueta: s.nombre, padre: s.categoriaId }))}
      marcas={marcas.map((m) => ({ valor: m.id, etiqueta: m.nombre }))}
      divisiones={divisiones.map((d) => ({ valor: d.id, etiqueta: d.nombre }))}
      proveedores={proveedores.map((p) => ({ valor: p.id, etiqueta: p.razonSocial }))}
    />
  );
}
