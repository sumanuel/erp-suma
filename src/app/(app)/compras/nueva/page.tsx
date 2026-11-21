import { requerirPermiso } from "@/lib/dal";
import { hoyCaracas } from "@/lib/tasas";
import { FormularioOrden } from "../formulario-orden";

export default async function NuevaOrden() {
  const { db } = await requerirPermiso("compras", "crear");
  const proveedores = await db.proveedor.findMany({ where: { activo: true }, orderBy: { razonSocial: "asc" }, select: { id: true, razonSocial: true, documento: true } });
  return (
    <FormularioOrden
      id={null}
      proveedores={proveedores.map((p) => ({ valor: p.id, etiqueta: `${p.razonSocial} (${p.documento})` }))}
      inicial={{ proveedorId: "", fecha: hoyCaracas().toISOString().slice(0, 10), fechaEsperada: "", observaciones: "", lineas: [] }}
    />
  );
}
