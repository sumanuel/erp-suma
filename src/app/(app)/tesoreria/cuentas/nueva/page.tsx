import { requerirPermiso } from "@/lib/dal";
import { FormularioCuenta } from "../formulario-cuenta";

export default async function NuevaCuenta() {
  const { db } = await requerirPermiso("tesoreria", "crear");
  const [contables, cfg] = await Promise.all([
    db.cuentaContable.findMany({ where: { posteable: true, activo: true }, select: { id: true, codigo: true, nombre: true } }),
    db.configContable.findUnique({ where: { id: 1 } }),
  ]);
  const clave = (x: string) => x.split(".").map((n) => n.padStart(6, "0")).join(".");
  contables.sort((a, b) => clave(a.codigo).localeCompare(clave(b.codigo)));
  return <FormularioCuenta cuentasContables={contables.map((x) => ({ valor: x.id, etiqueta: `${x.codigo} ${x.nombre}` }))} automatica={cfg?.automatica ?? false} id={null} inicial={{ cuentaContableId: "", contrapartidaId: "", codigo: "", nombre: "", tipo: "BANCO", moneda: "VES", banco: "", numeroCuenta: "", saldoInicial: "0", permiteSobregiro: false, activo: true }} />;
}
