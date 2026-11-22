import { notFound, redirect } from "next/navigation";
import { requerirPermiso } from "@/lib/dal";
import { condicionesDe, datosVentaForm } from "@/lib/ventas/formularios";
import { FormularioPedido } from "../../formulario-pedido";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditarPedido({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { db } = await requerirPermiso("pedidos", "editar");
  const p = await db.pedidoVenta.findUnique({ where: { id }, include: { lineas: { orderBy: { linea: "asc" } } } });
  if (!p) notFound();
  if (p.estado !== "BORRADOR") redirect(`/pedidos/${id}`);
  // Se incluye el cliente del pedido aunque haya quedado inactivo, para no perderlo al editar.
  const { datos: ventas, clientes } = await datosVentaForm(db, p.clienteId);
  return (
    <FormularioPedido
      id={id}
      clientes={clientes}
      ventas={ventas}
      inicial={{
        condiciones: condicionesDe(p),
        clienteId: p.clienteId, fecha: p.fecha.toISOString().slice(0, 10), observaciones: p.observaciones ?? "",
        lineas: p.lineas.filter((l) => !l.bonificacion).map((l) => ({ productoCodigo: l.productoCodigo, descripcion: l.descripcion, ivaPorcentaje: Number(l.ivaPorcentaje), cantidad: String(Number(l.cantidad)), precioUnitario: String(Number(l.precioUnitario)), descuento: String(Number(l.descuentoLinea ?? l.descuento)) })),
      }}
    />
  );
}
