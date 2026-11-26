import { requerirPermiso } from "@/lib/dal";
import { datosCompraForm } from "@/lib/compras/formularios";
import { hoyCaracas } from "@/lib/tasas";
import { FormularioOrden } from "../formulario-orden";

export default async function NuevaOrden() {
  const { db } = await requerirPermiso("compras", "crear");
  const { datos: compras, proveedores } = await datosCompraForm(db);
  return (
    <FormularioOrden
      id={null}
      proveedores={proveedores}
      compras={compras}
      inicial={{ proveedorId: "", fecha: hoyCaracas().toISOString().slice(0, 10), fechaEsperada: hoyCaracas().toISOString().slice(0, 10), observaciones: "", lineas: [] }}
    />
  );
}
