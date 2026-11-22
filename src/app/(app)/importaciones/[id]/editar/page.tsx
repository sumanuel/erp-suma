import { notFound, redirect } from "next/navigation";
import { requerirPermiso } from "@/lib/dal";
import { FormularioImportacion } from "../../formulario-importacion";
import { opcionesImportacion } from "../../opciones";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditarImportacion({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { db } = await requerirPermiso("importaciones", "editar");
  const i = await db.importacion.findUnique({ where: { id }, include: { lineas: { orderBy: { linea: "asc" }, include: { producto: { select: { descripcion: true } } } }, gastos: true } });
  if (!i) notFound();
  if (i.estado !== "BORRADOR") redirect(`/importaciones/${id}`);
  const { proveedores, almacenes } = await opcionesImportacion(db, i.proveedorId);
  return (
    <FormularioImportacion
      id={id}
      proveedores={proveedores}
      almacenes={almacenes}
      inicial={{
        proveedorId: i.proveedorId, documento: i.documento, fecha: i.fecha.toISOString().slice(0, 10), almacenId: i.almacenId, moneda: i.moneda, cambioUsd: String(Number(i.cambioUsd)), factorCif: String(Number(i.factorCif)), factorOtros: String(Number(i.factorOtros)), observaciones: i.observaciones ?? "",
        lineas: i.lineas.map((l) => ({ productoCodigo: l.productoCodigo, descripcion: l.producto.descripcion, cantidad: String(Number(l.cantidad)), fobUnitario: String(Number(l.fobUnitario)), arancelPct: String(Number(l.arancelPct)) })),
        gastos: i.gastos.map((g) => ({ descripcion: g.descripcion, montoUsd: String(Number(g.montoUsd)), proveedorId: g.proveedorId ?? "" })),
      }}
    />
  );
}
