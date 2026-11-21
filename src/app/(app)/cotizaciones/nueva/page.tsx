import { requerirPermiso } from "@/lib/dal";
import { hoyCaracas } from "@/lib/tasas";
import { FormularioCotizacion } from "../formulario-cotizacion";

export default async function NuevaCotizacion() {
  const { db } = await requerirPermiso("cotizaciones", "crear");
  const clientes = await db.cliente.findMany({ where: { activo: true }, orderBy: { razonSocial: "asc" }, select: { id: true, razonSocial: true, documento: true } });
  return (
    <FormularioCotizacion
      id={null}
      clientes={clientes.map((c) => ({ valor: c.id, etiqueta: `${c.razonSocial} (${c.documento})` }))}
      inicial={{ clienteId: "", fecha: hoyCaracas().toISOString().slice(0, 10), validezDias: "15", observaciones: "", lineas: [] }}
    />
  );
}
