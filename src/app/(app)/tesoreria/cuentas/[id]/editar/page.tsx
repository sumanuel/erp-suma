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
  const [contables, cfg] = await Promise.all([
    db.cuentaContable.findMany({ where: { posteable: true, activo: true }, select: { id: true, codigo: true, nombre: true } }),
    db.configContable.findUnique({ where: { id: 1 } }),
  ]);
  const bancos = (await db.banco.findMany({ where: { activo: true }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true } })).map((b) => ({ valor: b.id, etiqueta: b.nombre }));
  const clave = (x: string) => x.split(".").map((n) => n.padStart(6, "0")).join(".");
  contables.sort((a, b) => clave(a.codigo).localeCompare(clave(b.codigo)));
  return <FormularioCuenta cuentasContables={contables.map((x) => ({ valor: x.id, etiqueta: `${x.codigo} ${x.nombre}` }))} automatica={cfg?.automatica ?? false} bancos={bancos} id={id} inicial={{ cuentaContableId: c.cuentaContableId ?? "", contrapartidaId: "", codigo: c.codigo, nombre: c.nombre, tipo: c.tipo, moneda: c.moneda, banco: c.banco ?? "", numeroCuenta: c.numeroCuenta ?? "", saldoInicial: "0", permiteSobregiro: c.permiteSobregiro, activo: c.activo, bancoId: c.bancoId ?? "", titular: c.titular ?? "", sucursal: c.sucursal ?? "", descripcion: c.descripcion ?? "", tipoCuentaBancaria: c.tipoCuentaBancaria ?? "", aceptaDepositos: c.aceptaDepositos, aceptaPagos: c.aceptaPagos, itfPorcentaje: String(Number(c.itfPorcentaje)), itfDesde: c.itfDesde?.toISOString().slice(0, 10) ?? "", itfHasta: c.itfHasta?.toISOString().slice(0, 10) ?? "", formatoCheque: c.formatoCheque ?? "" }} />;
}
