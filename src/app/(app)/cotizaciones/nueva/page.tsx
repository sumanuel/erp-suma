import { requerirPermiso, tienePermisoEspecial } from "@/lib/dal";
import { datosVentaForm } from "@/lib/ventas/formularios";
import { hoyCaracas } from "@/lib/tasas";
import { FormularioCotizacion } from "../formulario-cotizacion";

export default async function NuevaCotizacion() {
  const ctx = await requerirPermiso("cotizaciones", "crear");
  const { db } = ctx;
  const { datos: ventas, clientes } = await datosVentaForm(db);
  return (
    <FormularioCotizacion
      puedeCambiarPrecio={tienePermisoEspecial(ctx, "ventas.cambiar_precio")}
      id={null}
      clientes={clientes}
      ventas={ventas}
      inicial={{ clienteId: "", fecha: hoyCaracas().toISOString().slice(0, 10), validezDias: "15", observaciones: "", lineas: [] }}
    />
  );
}
