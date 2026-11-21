import { notFound, redirect } from "next/navigation";
import { requerirPermiso } from "@/lib/dal";
import { numeroFacturaCompra } from "@/lib/cxp/estados";
import { hoyCaracas } from "@/lib/tasas";
import { FormularioNotaCompra } from "./formulario";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// /cxp/notas/nueva?factura=ID&tipo=CREDITO|DEBITO
export default async function NuevaNotaCompra({ searchParams }: { searchParams: Promise<{ factura?: string; tipo?: string }> }) {
  const { db } = await requerirPermiso("cxp", "crear");
  const { factura: id, tipo } = await searchParams;
  if (!id) redirect("/cxp/facturas");
  if (!UUID.test(id)) notFound();
  const f = await db.facturaCompra.findUnique({ where: { id }, include: { proveedor: { select: { razonSocial: true, documento: true } } } });
  if (!f) notFound();
  if (f.estado !== "REGISTRADA") redirect(`/cxp/facturas/${id}`);
  return (
    <FormularioNotaCompra
      tipo={tipo === "DEBITO" ? "DEBITO" : "CREDITO"} hoy={hoyCaracas().toISOString().slice(0, 10)}
      factura={{ id, etiqueta: `${numeroFacturaCompra(f.numero)} · ${f.documento}`, proveedor: `${f.proveedor.razonSocial} (${f.proveedor.documento})`, saldo: Number(f.saldo) }}
    />
  );
}
