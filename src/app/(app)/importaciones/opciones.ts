import "server-only";
import type { Db } from "@/lib/tenant";

/** Proveedores y almacenes activos para el expediente de importación. */
export async function opcionesImportacion(db: Db, incluirProveedor?: string) {
  const [proveedores, almacenes] = await Promise.all([
    db.proveedor.findMany({ where: { OR: [{ activo: true }, ...(incluirProveedor ? [{ id: incluirProveedor }] : [])] }, orderBy: { razonSocial: "asc" }, select: { id: true, razonSocial: true, documento: true } }),
    db.almacen.findMany({ where: { activo: true }, orderBy: { nombre: "asc" }, select: { id: true, codigo: true, nombre: true } }),
  ]);
  return {
    proveedores: proveedores.map((p) => ({ valor: p.id, etiqueta: `${p.razonSocial} (${p.documento})` })),
    almacenes: almacenes.map((a) => ({ valor: a.id, etiqueta: `${a.codigo} · ${a.nombre}` })),
  };
}
