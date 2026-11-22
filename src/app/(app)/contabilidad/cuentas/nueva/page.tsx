import { requerirPermiso } from "@/lib/dal";
import { FormularioCuenta } from "../formulario-cuenta";

export default async function NuevaCuenta() {
  const { db } = await requerirPermiso("contabilidad", "crear");
  const padres = await db.cuentaContable.findMany({ where: { posteable: false, activo: true }, orderBy: { codigo: "asc" }, select: { id: true, codigo: true, nombre: true } });
  const clave = (c: string) => c.split(".").map((n) => n.padStart(6, "0")).join(".");
  padres.sort((a, b) => clave(a.codigo).localeCompare(clave(b.codigo)));
  return <FormularioCuenta id={null} padres={padres.map((p) => ({ valor: p.id, etiqueta: `${p.codigo} ${p.nombre}` }))} inicial={{ codigo: "", nombre: "", padreId: "", tipo: "", siglas: "", imprimeBalance: true, imprimeDiario: true, posteable: true, activo: true }} />;
}
