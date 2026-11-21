import { notFound, redirect } from "next/navigation";
import { requerirPermiso } from "@/lib/dal";
import { FormularioOrden } from "../../formulario-orden";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditarOrden({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { db } = await requerirPermiso("compras", "editar");
  const o = await db.ordenCompra.findUnique({ where: { id }, include: { lineas: { orderBy: { linea: "asc" } } } });
  if (!o) notFound();
  if (o.estado !== "BORRADOR") redirect(`/compras/${id}`);
  // Se incluye el proveedor de la orden aunque haya quedado inactivo, para no perderlo al editar.
  const proveedores = await db.proveedor.findMany({ where: { OR: [{ activo: true }, { id: o.proveedorId }] }, orderBy: { razonSocial: "asc" }, select: { id: true, razonSocial: true, documento: true } });
  return (
    <FormularioOrden
      id={id}
      proveedores={proveedores.map((p) => ({ valor: p.id, etiqueta: `${p.razonSocial} (${p.documento})` }))}
      inicial={{
        proveedorId: o.proveedorId, fecha: o.fecha.toISOString().slice(0, 10), fechaEsperada: o.fechaEsperada?.toISOString().slice(0, 10) ?? "", observaciones: o.observaciones ?? "",
        lineas: o.lineas.map((l) => ({ productoCodigo: l.productoCodigo, descripcion: l.descripcion, ivaPorcentaje: Number(l.ivaPorcentaje), cantidad: String(Number(l.cantidad)), costoUnitario: String(Number(l.costoUnitario)), descuento: String(Number(l.descuento)) })),
      }}
    />
  );
}
