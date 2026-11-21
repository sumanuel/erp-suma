import { notFound } from "next/navigation";
import { requerirPermiso } from "@/lib/dal";
import { FormularioCuenta } from "../../formulario-cuenta";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditarCuenta({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { db } = await requerirPermiso("contabilidad", "editar");
  const c = await db.cuentaContable.findUnique({ where: { id } });
  if (!c) notFound();
  return <FormularioCuenta id={id} padres={[]} inicial={{ codigo: c.codigo, nombre: c.nombre, padreId: c.padreId ?? "", tipo: c.tipo, posteable: c.posteable, activo: c.activo }} />;
}
