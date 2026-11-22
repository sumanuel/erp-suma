import { requerirPermiso } from "@/lib/dal";
import { hoyCaracas } from "@/lib/tasas";
import { FormularioAsiento } from "./formulario";

export default async function NuevoAsiento() {
  const { db } = await requerirPermiso("contabilidad", "crear");
  const [cuentas, auxiliares] = await Promise.all([
    db.cuentaContable.findMany({ where: { posteable: true, activo: true }, select: { id: true, codigo: true, nombre: true } }),
    db.auxiliarContable.findMany({ where: { activo: true, cuenta: { activo: true } }, orderBy: { nombre: "asc" }, select: { id: true, cuentaId: true, codigo: true, nombre: true } }),
  ]);
  const clave = (c: string) => c.split(".").map((n) => n.padStart(6, "0")).join(".");
  cuentas.sort((a, b) => clave(a.codigo).localeCompare(clave(b.codigo)));
  return <FormularioAsiento hoy={hoyCaracas().toISOString().slice(0, 10)} cuentas={cuentas.map((c) => ({ valor: c.id, etiqueta: `${c.codigo} ${c.nombre}` }))} auxiliares={auxiliares.map((a) => ({ valor: a.id, cuentaId: a.cuentaId, etiqueta: `${a.codigo} · ${a.nombre}` }))} />;
}
