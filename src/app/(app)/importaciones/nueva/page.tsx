import { requerirPermiso } from "@/lib/dal";
import { hoyCaracas } from "@/lib/tasas";
import { FormularioImportacion } from "../formulario-importacion";
import { opcionesImportacion } from "../opciones";

export default async function NuevaImportacion() {
  const { db } = await requerirPermiso("importaciones", "crear");
  const { proveedores, almacenes } = await opcionesImportacion(db);
  return (
    <FormularioImportacion
      id={null}
      proveedores={proveedores}
      almacenes={almacenes}
      inicial={{ proveedorId: "", documento: "", fecha: hoyCaracas().toISOString().slice(0, 10), almacenId: almacenes.length === 1 ? almacenes[0].valor : "", moneda: "USD", cambioUsd: "1", factorCif: "1", factorOtros: "0", observaciones: "", lineas: [], gastos: [] }}
    />
  );
}
