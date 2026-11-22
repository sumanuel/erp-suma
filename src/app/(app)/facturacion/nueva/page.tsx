import { notFound, redirect } from "next/navigation";
import { requerirPermiso, tienePermisoEspecial } from "@/lib/dal";
import { presentacionesVenta } from "@/lib/pedidos/servicio";
import { enUnidadDeLinea } from "@/lib/ventas/presentaciones";
import { datosVentaForm } from "@/lib/ventas/formularios";
import { numeroPedido } from "@/lib/pedidos/calculos";
import { FormularioFactura, type InicialFactura } from "../formulario-factura";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// /facturacion/nueva            factura directa
// /facturacion/nueva?pedido=ID  factura de un pedido confirmado
export default async function NuevaFactura({ searchParams }: { searchParams: Promise<{ pedido?: string }> }) {
  const ctx = await requerirPermiso("facturacion", "crear");
  const { db } = ctx;
  const { pedido: pedidoId } = await searchParams;
  const [venta, almacenes] = await Promise.all([
    datosVentaForm(db),
    db.almacen.findMany({ where: { activo: true }, orderBy: { nombre: "asc" } }),
  ]);
  const opcionesAlmacen = almacenes.map((a) => ({ valor: a.id, etiqueta: `${a.codigo} · ${a.nombre}` }));
  const almacenInicial = almacenes.length === 1 ? almacenes[0].id : "";

  let pedido: { id: string; etiqueta: string } | null = null;
  let inicial: InicialFactura = { clienteId: "", almacenId: almacenInicial, observaciones: "", diasCredito: "0", lineas: [] };
  let opcionesCliente = venta.clientes;
  if (pedidoId) {
    if (!UUID.test(pedidoId)) notFound();
    const p = await db.pedidoVenta.findUnique({ where: { id: pedidoId }, include: { cliente: true, lineas: { orderBy: { linea: "asc" } } } });
    if (!p) notFound();
    if (p.estado !== "CONFIRMADO") redirect(`/pedidos/${p.id}`);
    pedido = { id: p.id, etiqueta: numeroPedido(p.numero) };
    opcionesCliente = [{ valor: p.clienteId, etiqueta: `${p.cliente.razonSocial} (${p.cliente.documento})` }];
    const unidades = await presentacionesVenta(db, p.lineas.map((l) => l.productoCodigo), p.cliente.listaPrecio);
    inicial = {
      clienteId: p.clienteId, almacenId: almacenInicial, observaciones: p.observaciones ?? "", diasCredito: String(venta.datos.condiciones.find((c) => c.valor === p.condicionPagoId)?.dias ?? 0),
      lineas: p.lineas.map((l) => ({ productoCodigo: l.productoCodigo, descripcion: l.descripcion, ivaPorcentaje: Number(l.ivaPorcentaje), ...enUnidadDeLinea(l), presentacionId: l.presentacionId ?? "", presentaciones: unidades.get(l.productoCodigo)?.presentaciones, descuento: String(Number(l.descuento)), bonificacion: l.bonificacion })),
    };
  }
  return <FormularioFactura pedido={pedido} inicial={inicial} clientes={opcionesCliente} almacenes={opcionesAlmacen} ventas={venta.datos} puedeAprobar={tienePermisoEspecial(ctx, "ventas.aprobar")} />;
}
