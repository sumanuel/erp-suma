import { notFound, redirect } from "next/navigation";
import { FormularioRetencion } from "@/components/retenciones/formulario-retencion";
import { requerirPermiso } from "@/lib/dal";
import { numeroFactura } from "@/lib/facturacion/estados";
import { hoyCaracas } from "@/lib/tasas";
import { registrarRetencionCliente } from "../../acciones";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// /cxc/retenciones/nueva?factura=ID: retención que un cliente nos practicó sobre esa factura.
export default async function NuevaRetencionCliente({ searchParams }: { searchParams: Promise<{ factura?: string }> }) {
  const { db } = await requerirPermiso("cxc", "crear");
  const { factura: id } = await searchParams;
  if (!id) redirect("/cxc");
  if (!UUID.test(id)) notFound();
  const f = await db.factura.findUnique({ where: { id }, include: { cliente: { select: { razonSocial: true, documento: true } } } });
  if (!f) notFound();
  if (f.estado !== "EMITIDA") redirect(`/facturacion/${id}`);
  return (
    <FormularioRetencion
      sufrida hoy={hoyCaracas().toISOString().slice(0, 10)} volver={`/facturacion/${id}`} guardar={registrarRetencionCliente} pctInicialIva={75}
      factura={{ id, etiqueta: f.numeroFiscal ?? numeroFactura(f.numero), tercero: `${f.cliente.razonSocial} (${f.cliente.documento})`, iva: Number(f.iva), subtotal: Number(f.subtotal), saldo: Number(f.saldo) }}
    />
  );
}
