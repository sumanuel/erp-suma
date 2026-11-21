import { notFound, redirect } from "next/navigation";
import { requerirPermiso } from "@/lib/dal";
import { numeroFactura } from "@/lib/facturacion/estados";
import { FormularioNotaVenta } from "./formulario";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// /facturacion/notas/nueva?factura=ID&tipo=CREDITO|DEBITO
export default async function NuevaNotaVenta({ searchParams }: { searchParams: Promise<{ factura?: string; tipo?: string }> }) {
  const { db } = await requerirPermiso("facturacion", "crear");
  const { factura: id, tipo } = await searchParams;
  if (!id) redirect("/facturacion");
  if (!UUID.test(id)) notFound();
  const f = await db.factura.findUnique({ where: { id }, include: { cliente: { select: { razonSocial: true, documento: true } }, lineas: { orderBy: { linea: "asc" } } } });
  if (!f) notFound();
  if (f.estado !== "EMITIDA") redirect(`/facturacion/${id}`);
  const [devueltas, almacenes, alicuotas] = await Promise.all([
    db.notaVentaLinea.groupBy({ by: ["facturaLineaId"], where: { nota: { facturaId: id, estado: "ACTIVA" } }, _sum: { cantidad: true } }),
    db.almacen.findMany({ where: { activo: true }, orderBy: { nombre: "asc" } }),
    db.alicuotaIva.findMany({ where: { activo: true }, select: { porcentajeVenta: true }, orderBy: { porcentajeVenta: "desc" } }),
  ]);
  const previa = new Map(devueltas.map((d) => [d.facturaLineaId, Number(d._sum.cantidad ?? 0)]));
  const porcentajes = [...new Set([...alicuotas.map((a) => Number(a.porcentajeVenta)), 0])].sort((a, b) => b - a);
  return (
    <FormularioNotaVenta
      tipo={tipo === "DEBITO" ? "DEBITO" : "CREDITO"}
      factura={{ id, numero: numeroFactura(f.numero), cliente: `${f.cliente.razonSocial} (${f.cliente.documento})`, saldo: Number(f.saldo) }}
      lineas={f.lineas.map((l) => ({ id: l.id, codigo: l.productoCodigo, descripcion: l.descripcion, vendida: Number(l.cantidad), devolvible: Math.max(Number(l.cantidad) - (previa.get(l.id) ?? 0), 0), precio: Number(l.precioUnitario), descuento: Number(l.descuento), iva: Number(l.ivaPorcentaje) }))}
      almacenes={almacenes.map((a) => ({ valor: a.id, etiqueta: `${a.codigo} · ${a.nombre}` }))}
      alicuotas={porcentajes}
    />
  );
}
