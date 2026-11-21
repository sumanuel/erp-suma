import { requerirPermiso } from "@/lib/dal";
import { formatoMonto } from "@/lib/tesoreria/tipos";
import { FormularioTransferencia } from "./formulario";

export default async function Transferir() {
  const { db } = await requerirPermiso("tesoreria", "crear");
  const cuentas = await db.cuentaTesoreria.findMany({ where: { activo: true }, orderBy: [{ moneda: "asc" }, { nombre: "asc" }] });
  return <FormularioTransferencia cuentas={cuentas.map((c) => ({ id: c.id, moneda: c.moneda, etiqueta: `${c.codigo} · ${c.nombre} (${c.moneda} ${formatoMonto(Number(c.saldo))})` }))} />;
}
