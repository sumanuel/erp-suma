import { notFound, redirect } from "next/navigation";
import { requerirPermiso } from "@/lib/dal";
import { MONEDAS_CUENTA } from "@/lib/tesoreria/tipos";
import { FormularioMovimiento } from "./formulario";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// /tesoreria/movimientos/nuevo?cuenta=ID&tipo=INGRESO|EGRESO
export default async function NuevoMovimiento({ searchParams }: { searchParams: Promise<{ cuenta?: string; tipo?: string }> }) {
  const { db } = await requerirPermiso("tesoreria", "crear");
  const { cuenta: id, tipo } = await searchParams;
  if (!id) redirect("/tesoreria");
  if (!UUID.test(id)) notFound();
  const c = await db.cuentaTesoreria.findUnique({ where: { id } });
  if (!c) notFound();
  if (!c.activo) redirect(`/tesoreria/cuentas/${id}`);
  const [contables, cfg] = await Promise.all([
    db.cuentaContable.findMany({ where: { posteable: true, activo: true }, select: { id: true, codigo: true, nombre: true } }),
    db.configContable.findUnique({ where: { id: 1 } }),
  ]);
  const clave = (x: string) => x.split(".").map((n) => n.padStart(6, "0")).join(".");
  contables.sort((a, b) => clave(a.codigo).localeCompare(clave(b.codigo)));
  return <FormularioMovimiento cuentasContables={contables.map((x) => ({ valor: x.id, etiqueta: `${x.codigo} ${x.nombre}` }))} automatica={cfg?.automatica ?? false} cuentaId={id} cuenta={`${c.codigo} · ${c.nombre} (${MONEDAS_CUENTA[c.moneda as "USD" | "VES"].etiqueta})`} tipoInicial={tipo === "EGRESO" ? "EGRESO" : "INGRESO"} />;
}
