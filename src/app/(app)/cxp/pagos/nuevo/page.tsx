import { notFound, redirect } from "next/navigation";
import { requerirPermiso } from "@/lib/dal";
import { numeroFacturaCompra } from "@/lib/cxp/estados";
import { tasaVigente } from "@/lib/tasas";
import { FormularioPago } from "./formulario-pago";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// /cxp/pagos/nuevo?proveedor=ID: pago a las facturas con saldo de ese proveedor.
export default async function NuevoPago({ searchParams }: { searchParams: Promise<{ proveedor?: string }> }) {
  const { db } = await requerirPermiso("cxp", "crear");
  const { proveedor: id } = await searchParams;
  if (!id) redirect("/cxp");
  if (!UUID.test(id)) notFound();
  const proveedor = await db.proveedor.findUnique({ where: { id }, select: { razonSocial: true, documento: true } });
  if (!proveedor) notFound();
  const [facturas, tasa] = await Promise.all([
    db.facturaCompra.findMany({ where: { proveedorId: id, estado: "REGISTRADA", saldo: { gt: 0 } }, orderBy: { fechaVencimiento: "asc" } }),
    tasaVigente(db, "USD"),
  ]);
  if (facturas.length === 0) redirect(`/cxp/proveedor/${id}`);
  return (
    <FormularioPago
      proveedorId={id}
      proveedorNombre={`${proveedor.razonSocial} (${proveedor.documento})`}
      tasa={tasa?.valor ?? null}
      facturas={facturas.map((f) => ({ id: f.id, numero: numeroFacturaCompra(f.numero), vence: f.fechaVencimiento.toISOString().slice(0, 10), saldo: Number(f.saldo) }))}
    />
  );
}
