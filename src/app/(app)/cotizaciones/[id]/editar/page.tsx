import { notFound, redirect } from "next/navigation";
import { requerirPermiso, tienePermisoEspecial } from "@/lib/dal";
import { presentacionesVenta } from "@/lib/pedidos/servicio";
import { enUnidadDeLinea } from "@/lib/ventas/presentaciones";
import { condicionesDe, datosVentaForm } from "@/lib/ventas/formularios";
import { FormularioCotizacion } from "../../formulario-cotizacion";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditarCotizacion({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const ctx = await requerirPermiso("cotizaciones", "editar");
  const { db } = ctx;
  const p = await db.cotizacion.findUnique({ where: { id }, include: { lineas: { orderBy: { linea: "asc" } } } });
  if (!p) notFound();
  if (p.estado !== "BORRADOR") redirect(`/cotizaciones/${id}`);
  // Se incluye el cliente del cotización aunque haya quedado inactivo, para no perderlo al editar.
  const { datos: ventas, clientes } = await datosVentaForm(db, p.clienteId);
  const lista = (await db.cliente.findUnique({ where: { id: p.clienteId }, select: { listaPrecio: true } }))?.listaPrecio ?? "A";
  const unidades = await presentacionesVenta(db, p.lineas.map((l) => l.productoCodigo), lista);
  return (
    <FormularioCotizacion
      puedeCambiarPrecio={tienePermisoEspecial(ctx, "ventas.cambiar_precio")}
      id={id}
      clientes={clientes}
      ventas={ventas}
      inicial={{
        condiciones: condicionesDe(p),
        clienteId: p.clienteId, fecha: p.fecha.toISOString().slice(0, 10), validezDias: String(p.validezDias), observaciones: p.observaciones ?? "",
        lineas: p.lineas.filter((l) => !l.bonificacion).map((l) => ({ productoCodigo: l.productoCodigo, descripcion: l.descripcion, ivaPorcentaje: Number(l.ivaPorcentaje), ...enUnidadDeLinea(l), presentacionId: l.presentacionId ?? "", presentaciones: unidades.get(l.productoCodigo)?.presentaciones, precioUnidad: unidades.get(l.productoCodigo)?.precioUnidad, descuento: String(Number(l.descuentoLinea ?? l.descuento)) })),
      }}
    />
  );
}
