import { requerirPermiso } from "@/lib/dal";
import { datosVentaForm } from "@/lib/ventas/formularios";
import { hoyCaracas } from "@/lib/tasas";
import { FormularioPedido } from "../formulario-pedido";

export default async function NuevoPedido() {
  const { db } = await requerirPermiso("pedidos", "crear");
  const { datos: ventas, clientes } = await datosVentaForm(db);
  return (
    <FormularioPedido
      id={null}
      clientes={clientes}
      ventas={ventas}
      inicial={{ clienteId: "", fecha: hoyCaracas().toISOString().slice(0, 10), observaciones: "", lineas: [] }}
    />
  );
}
