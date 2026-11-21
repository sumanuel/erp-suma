import { notFound } from "next/navigation";
import { requerirPermiso } from "@/lib/dal";
import { FormularioCuenta } from "../../formulario-cuenta";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditarCuenta({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { db } = await requerirPermiso("tesoreria", "editar");
  const c = await db.cuentaTesoreria.findUnique({ where: { id } });
  if (!c) notFound();
  return <FormularioCuenta id={id} inicial={{ codigo: c.codigo, nombre: c.nombre, tipo: c.tipo, moneda: c.moneda, banco: c.banco ?? "", numeroCuenta: c.numeroCuenta ?? "", saldoInicial: "0", permiteSobregiro: c.permiteSobregiro, activo: c.activo }} />;
}
