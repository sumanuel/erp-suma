import { requerirPermiso } from "@/lib/dal";
import { hoyCaracas } from "@/lib/tasas";
import { FormularioPedido } from "../formulario-pedido";

export default async function NuevoPedido() {
  const { db } = await requerirPermiso("pedidos", "crear");
  const clientes = await db.cliente.findMany({ where: { activo: true }, orderBy: { razonSocial: "asc" }, select: { id: true, razonSocial: true, documento: true } });
  return (
    <FormularioPedido
      id={null}
      clientes={clientes.map((c) => ({ valor: c.id, etiqueta: `${c.razonSocial} (${c.documento})` }))}
      inicial={{ clienteId: "", fecha: hoyCaracas().toISOString().slice(0, 10), observaciones: "", lineas: [] }}
    />
  );
}
