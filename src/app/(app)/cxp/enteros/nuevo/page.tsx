import { redirect } from "next/navigation";
import { requerirPermiso } from "@/lib/dal";
import { formatoMonto } from "@/lib/tesoreria/tipos";
import { FormularioEntero } from "./formulario";

// /cxp/enteros/nuevo?tipo=IVA|ISLR: retenciones practicadas vigentes que aún no se han pagado al fisco.
export default async function NuevoEntero({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const { db } = await requerirPermiso("cxp", "crear");
  const { tipo } = await searchParams;
  if (tipo !== "IVA" && tipo !== "ISLR") redirect("/cxp/enteros");
  const [pendientes, cuentas] = await Promise.all([
    db.retencion.findMany({ where: { sentido: "PRACTICADA", tipo, estado: "ACTIVA", enteroId: null }, include: { proveedor: { select: { razonSocial: true } }, facturaCompra: { select: { documento: true } } }, orderBy: { numero: "asc" } }),
    db.cuentaTesoreria.findMany({ where: { activo: true, moneda: "VES" }, orderBy: { nombre: "asc" } }),
  ]);
  if (pendientes.length === 0) redirect("/cxp/enteros");
  return (
    <FormularioEntero
      tipo={tipo}
      cuentas={cuentas.map((c) => ({ valor: c.id, etiqueta: `${c.codigo} · ${c.nombre} (Bs. ${formatoMonto(Number(c.saldo))})` }))}
      retenciones={pendientes.map((r) => ({ id: r.id, comprobante: r.comprobante, fecha: r.fecha.toISOString().slice(0, 10), proveedor: r.proveedor?.razonSocial ?? "", factura: r.facturaCompra?.documento ?? "", montoBs: Number(r.montoBs) }))}
    />
  );
}
