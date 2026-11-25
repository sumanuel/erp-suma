import { notFound, redirect } from "next/navigation";
import { requerirPermiso, tienePermiso, tienePermisoEspecial } from "@/lib/dal";
import { nombreFormaCobro, numeroCobro, numeroAplicacionAnticipo } from "@/lib/cxc/estados";
import { pagadoSinDevolver } from "@/lib/notas/servicio";
import { numeroFactura } from "@/lib/facturacion/estados";
import { FormularioNotaVenta } from "./formulario";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// /facturacion/notas/nueva?factura=ID&tipo=CREDITO|DEBITO&modo=DEVOLUCION|AJUSTE
export default async function NuevaNotaVenta({ searchParams }: { searchParams: Promise<{ factura?: string; tipo?: string; modo?: string }> }) {
  const ctx = await requerirPermiso("facturacion", "crear");
  const { db } = ctx;
  const { factura: id, tipo, modo } = await searchParams;
  if (!id) redirect("/facturacion");
  if (!UUID.test(id)) notFound();
  const f = await db.factura.findUnique({ where: { id }, include: { cliente: { select: { razonSocial: true, documento: true } }, aplicaciones: { where: { cobro: { estado: "REGISTRADO" } }, include: { cobro: { select: { numero: true, formaPago: true, moneda: true } } } }, anticiposAplicados: { where: { estado: "ACTIVA" }, select: { numero: true, montoUsd: true } }, lineas: { orderBy: { linea: "asc" } } } });
  if (!f) notFound();
  if (f.estado !== "EMITIDA") redirect(`/facturacion/${id}`);
  const [devueltas, almacenes, alicuotas, cuentas, pagado] = await Promise.all([
    db.notaVentaLinea.groupBy({ by: ["facturaLineaId"], where: { nota: { facturaId: id, estado: "ACTIVA" } }, _sum: { cantidad: true } }),
    db.almacen.findMany({ where: { activo: true }, orderBy: { nombre: "asc" } }),
    db.alicuotaIva.findMany({ where: { activo: true }, select: { porcentajeVenta: true }, orderBy: { porcentajeVenta: "desc" } }),
    db.cuentaTesoreria.findMany({ where: { activo: true, aceptaPagos: true }, orderBy: { codigo: "asc" }, select: { id: true, codigo: true, nombre: true, moneda: true, tipo: true } }),
    pagadoSinDevolver(db, id),
  ]);
  const usd = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  const pagos = [
    ...f.aplicaciones.map((a) => `${nombreFormaCobro(a.cobro.formaPago)} ${usd(Number(a.montoUsd))} USD (${numeroCobro(a.cobro.numero)}${a.cobro.moneda === "VES" ? ", en Bs." : ""})`),
    ...f.anticiposAplicados.map((a) => `saldo a favor ${usd(Number(a.montoUsd))} USD (${numeroAplicacionAnticipo(a.numero)})`),
  ];
  const previa = new Map(devueltas.map((d) => [d.facturaLineaId, Number(d._sum.cantidad ?? 0)]));
  const porcentajes = [...new Set([...alicuotas.map((a) => Number(a.porcentajeVenta)), 0])].sort((a, b) => b - a);
  return (
    <FormularioNotaVenta
      tipo={tipo === "DEBITO" ? "DEBITO" : "CREDITO"}
      modoInicial={modo === "AJUSTE" ? "AJUSTE" : "DEVOLUCION"}
      factura={{ id, numero: numeroFactura(f.numero), cliente: `${f.cliente.razonSocial} (${f.cliente.documento})`, saldo: Number(f.saldo), total: Number(f.total), tasa: Number(f.tasaUsd), almacenId: f.almacenId, numeroFiscal: f.numeroFiscal, consumidorFinal: f.cliente.documento === "CONTADO", pagado, pagos, monedaPago: f.aplicaciones[0]?.cobro.moneda === "USD" ? "USD" : "VES" }}
      cuentas={cuentas.map((c) => ({ id: c.id, etiqueta: `${c.codigo} · ${c.nombre}`, moneda: c.moneda, tipo: c.tipo }))}
      puedeTotal={tienePermisoEspecial(ctx, "ventas.aprobar")}
      puedeReintegrar={tienePermiso(ctx, "cxc", "crear")}
      lineas={f.lineas.map((l) => ({ id: l.id, codigo: l.productoCodigo, descripcion: l.descripcion, vendida: Number(l.cantidad), devolvible: Math.max(Number(l.cantidad) - (previa.get(l.id) ?? 0), 0), precio: Number(l.precioUnitario), descuento: Number(l.descuento), iva: Number(l.ivaPorcentaje) }))}
      almacenes={almacenes.map((a) => ({ valor: a.id, etiqueta: `${a.codigo} · ${a.nombre}` }))}
      alicuotas={porcentajes}
    />
  );
}
