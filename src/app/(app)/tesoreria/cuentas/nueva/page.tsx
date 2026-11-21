import { requerirPermiso } from "@/lib/dal";
import { FormularioCuenta } from "../formulario-cuenta";

export default async function NuevaCuenta() {
  await requerirPermiso("tesoreria", "crear");
  return <FormularioCuenta id={null} inicial={{ codigo: "", nombre: "", tipo: "BANCO", moneda: "VES", banco: "", numeroCuenta: "", saldoInicial: "0", permiteSobregiro: false, activo: true }} />;
}
