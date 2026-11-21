import { notFound, redirect } from "next/navigation";
import { FormularioRetencion } from "@/components/retenciones/formulario-retencion";
import { requerirPermiso } from "@/lib/dal";
import { numeroFacturaCompra } from "@/lib/cxp/estados";
import { hoyCaracas } from "@/lib/tasas";
import { aplicarRetencionProveedor } from "../../acciones";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// /cxp/retenciones/nueva?factura=ID: retención que practicamos al proveedor de esa factura.
export default async function NuevaRetencionProveedor({ searchParams }: { searchParams: Promise<{ factura?: string }> }) {
  const { db } = await requerirPermiso("cxp", "crear");
  const { factura: id } = await searchParams;
  if (!id) redirect("/cxp/facturas");
  if (!UUID.test(id)) notFound();
  const f = await db.facturaCompra.findUnique({ where: { id }, include: { proveedor: { select: { razonSocial: true, documento: true, retencionIvaPct: true } } } });
  if (!f) notFound();
  if (f.estado !== "REGISTRADA") redirect(`/cxp/facturas/${id}`);
  return (
    <FormularioRetencion
      sufrida={false} hoy={hoyCaracas().toISOString().slice(0, 10)} volver={`/cxp/facturas/${id}`} guardar={aplicarRetencionProveedor}
      pctInicialIva={Number(f.proveedor.retencionIvaPct)}
      factura={{ id, etiqueta: `${numeroFacturaCompra(f.numero)} · ${f.documento}`, tercero: `${f.proveedor.razonSocial} (${f.proveedor.documento})`, iva: Number(f.iva), subtotal: Number(f.subtotal), saldo: Number(f.saldo) }}
    />
  );
}
