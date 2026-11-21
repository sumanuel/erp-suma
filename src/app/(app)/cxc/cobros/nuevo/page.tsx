import { notFound, redirect } from "next/navigation";
import { requerirPermiso } from "@/lib/dal";
import { numeroFactura } from "@/lib/facturacion/estados";
import { tasaVigente } from "@/lib/tasas";
import { FormularioCobro } from "./formulario-cobro";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// /cxc/cobros/nuevo?cliente=ID: cobro a las facturas con saldo de ese cliente.
export default async function NuevoCobro({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  const { db } = await requerirPermiso("cxc", "crear");
  const { cliente: id } = await searchParams;
  if (!id) redirect("/cxc");
  if (!UUID.test(id)) notFound();
  const cliente = await db.cliente.findUnique({ where: { id }, select: { razonSocial: true, documento: true } });
  if (!cliente) notFound();
  const [facturas, tasa, cuentas] = await Promise.all([
    db.factura.findMany({ where: { clienteId: id, estado: "EMITIDA", saldo: { gt: 0 } }, orderBy: { fechaVencimiento: "asc" } }),
    tasaVigente(db, "USD"),
    db.cuentaTesoreria.findMany({ where: { activo: true }, orderBy: [{ moneda: "asc" }, { nombre: "asc" }], select: { id: true, codigo: true, nombre: true, moneda: true, saldo: true } }),
  ]);
  if (facturas.length === 0) redirect(`/cxc/cliente/${id}`);
  return (
    <FormularioCobro
      clienteId={id}
      clienteNombre={`${cliente.razonSocial} (${cliente.documento})`}
      tasa={tasa?.valor ?? null}
      cuentas={cuentas.map((c) => ({ id: c.id, moneda: c.moneda as "USD" | "VES", etiqueta: `${c.codigo} · ${c.nombre}` }))}
      facturas={facturas.map((f) => ({ id: f.id, numero: numeroFactura(f.numero), vence: f.fechaVencimiento.toISOString().slice(0, 10), saldo: Number(f.saldo) }))}
    />
  );
}
