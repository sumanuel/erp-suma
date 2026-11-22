import { requerirPermiso } from "@/lib/dal";
import { datosVentaForm } from "@/lib/ventas/formularios";
import { hoyCaracas } from "@/lib/tasas";
import { FormularioCotizacion } from "../formulario-cotizacion";

export default async function NuevaCotizacion() {
  const { db } = await requerirPermiso("cotizaciones", "crear");
  const { datos: ventas, clientes } = await datosVentaForm(db);
  return (
    <FormularioCotizacion
      id={null}
      clientes={clientes}
      ventas={ventas}
      inicial={{ clienteId: "", fecha: hoyCaracas().toISOString().slice(0, 10), validezDias: "15", observaciones: "", lineas: [] }}
    />
  );
}
