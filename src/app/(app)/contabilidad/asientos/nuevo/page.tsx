import { requerirPermiso } from "@/lib/dal";
import { hoyCaracas } from "@/lib/tasas";
import { FormularioAsiento } from "./formulario";

export default async function NuevoAsiento() {
  const { db } = await requerirPermiso("contabilidad", "crear");
  const cuentas = await db.cuentaContable.findMany({ where: { posteable: true, activo: true }, select: { id: true, codigo: true, nombre: true } });
  const clave = (c: string) => c.split(".").map((n) => n.padStart(6, "0")).join(".");
  cuentas.sort((a, b) => clave(a.codigo).localeCompare(clave(b.codigo)));
  return <FormularioAsiento hoy={hoyCaracas().toISOString().slice(0, 10)} cuentas={cuentas.map((c) => ({ valor: c.id, etiqueta: `${c.codigo} ${c.nombre}` }))} />;
}
