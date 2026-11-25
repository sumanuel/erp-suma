import "server-only";
import type { Db } from "@/lib/tenant";
import { hoyCaracas } from "@/lib/tasas";
import { numeroFactura } from "@/lib/facturacion/estados";
import { numeroCobro } from "@/lib/cxc/estados";
import { numeroFacturaCompra, numeroPago } from "@/lib/cxp/estados";
import { numeroNotaCompra, numeroNotaVenta } from "@/lib/notas/estados";
import { redondear2 } from "./ayudas";

// «Consulta cliente» y «Consulta proveedor» (original: ConsultasTerceros): ficha, documentos pendientes e historial.

const LIMITE = 500;
const anulado = (estado: string) => (estado.startsWith("ANULAD") ? "Anulado" : "Vigente");
const reciente = <T extends { fecha: Date; documento: string }>(a: T, b: T) => b.fecha.getTime() - a.fecha.getTime() || b.documento.localeCompare(a.documento);

export async function consultaCliente(db: Db, id: string, hoy: Date = hoyCaracas()) {
  const c = await db.cliente.findUnique({ where: { id }, include: { vendedor: { select: { nombre: true } }, condicionPago: { select: { nombre: true } } } });
  if (!c) return null;
  const [facturas, notas, cobros] = await Promise.all([
    db.factura.findMany({ where: { clienteId: id }, select: { id: true, numero: true, fecha: true, fechaVencimiento: true, numeroFiscal: true, total: true, saldo: true, estado: true }, orderBy: [{ fecha: "desc" }, { numero: "desc" }] }),
    db.notaVenta.findMany({ where: { clienteId: id }, select: { id: true, numero: true, tipo: true, fecha: true, numeroFiscal: true, total: true, estado: true, factura: { select: { numero: true } } } }),
    db.cobro.findMany({ where: { clienteId: id }, select: { numero: true, fecha: true, montoUsd: true, estado: true, formaPago: true } }),
  ]);
  const pendientes = facturas.filter((f) => f.estado === "EMITIDA" && Number(f.saldo) > 0.00001).map((f) => ({
    documento: numeroFactura(f.numero), href: `/facturacion/${f.id}`, emision: f.fecha, vencimiento: f.fechaVencimiento, numeroFiscal: f.numeroFiscal, monto: Number(f.total), saldo: Number(f.saldo),
    diasVencido: f.fechaVencimiento ? Math.max(0, Math.round((hoy.getTime() - f.fechaVencimiento.getTime()) / 86_400_000)) : 0,
  })).sort((a, b) => (a.vencimiento?.getTime() ?? 0) - (b.vencimiento?.getTime() ?? 0));
  const todo = [
    ...facturas.map((f) => ({ documento: numeroFactura(f.numero), href: `/facturacion/${f.id}`, fecha: f.fecha, tipo: "Factura", aplica: null as string | null, numeroFiscal: f.numeroFiscal, estado: anulado(f.estado), monto: Number(f.total) })),
    ...notas.map((n) => ({ documento: numeroNotaVenta(n.tipo, n.numero), href: `/facturacion/notas/${n.id}`, fecha: n.fecha, tipo: n.tipo === "CREDITO" ? "Nota de crédito" : "Nota de débito", aplica: numeroFactura(n.factura.numero), numeroFiscal: n.numeroFiscal, estado: anulado(n.estado), monto: Number(n.total) })),
    ...cobros.map((x) => ({ documento: numeroCobro(x.numero), href: null as string | null, fecha: x.fecha, tipo: `Cobro (${x.formaPago.toLowerCase().replaceAll("_", " ")})`, aplica: null as string | null, numeroFiscal: null as string | null, estado: anulado(x.estado), monto: Number(x.montoUsd) })),
  ].sort(reciente);
  return {
    c, pendientes, historial: todo.slice(0, LIMITE), recortado: todo.length > LIMITE,
    saldo: redondear2(pendientes.reduce((s, x) => s + x.saldo, 0)), vencido: redondear2(pendientes.filter((x) => x.diasVencido > 0).reduce((s, x) => s + x.saldo, 0)),
  };
}

export async function consultaProveedor(db: Db, id: string) {
  const p = await db.proveedor.findUnique({ where: { id }, include: { pais: { select: { nombre: true } }, condicionPago: { select: { nombre: true } } } });
  if (!p) return null;
  const [facturas, notas, pagos] = await Promise.all([
    db.facturaCompra.findMany({ where: { proveedorId: id }, select: { id: true, numero: true, documento: true, tipoDocumento: true, fecha: true, fechaVencimiento: true, total: true, saldo: true, estado: true, observaciones: true } }),
    db.notaCompra.findMany({ where: { proveedorId: id }, select: { id: true, numero: true, tipo: true, documento: true, fecha: true, total: true, estado: true, motivo: true } }),
    db.pagoProveedor.findMany({ where: { proveedorId: id }, select: { numero: true, fecha: true, montoUsd: true, estado: true, formaPago: true, referencia: true, observaciones: true } }),
  ]);
  const tipoDe = (t: string) => ({ FACTURA: "Factura", PAGARE: "Pagaré" })[t] ?? "Otro";
  const pendientes = facturas.filter((f) => f.estado === "REGISTRADA" && Number(f.saldo) > 0.00001).map((f) => ({ documento: `${numeroFacturaCompra(f.numero)} · ${f.documento}`, href: `/cxp/facturas/${f.id}`, tipo: tipoDe(f.tipoDocumento), emision: f.fecha, vencimiento: f.fechaVencimiento, descripcion: f.observaciones, monto: Number(f.total), saldo: Number(f.saldo) }))
    .sort((a, b) => (a.vencimiento?.getTime() ?? 0) - (b.vencimiento?.getTime() ?? 0));
  const todo = [
    ...facturas.map((f) => ({ documento: `${numeroFacturaCompra(f.numero)} · ${f.documento}`, href: `/cxp/facturas/${f.id}` as string | null, fecha: f.fecha, operacion: `Registro de ${tipoDe(f.tipoDocumento).toLowerCase()}`, descripcion: f.observaciones, estado: anulado(f.estado), monto: Number(f.total) })),
    ...notas.map((n) => ({ documento: `${numeroNotaCompra(n.tipo, n.numero)} · ${n.documento}`, href: `/cxp/notas/${n.id}` as string | null, fecha: n.fecha, operacion: n.tipo === "CREDITO" ? "Nota de crédito" : "Nota de débito", descripcion: n.motivo as string | null, estado: anulado(n.estado), monto: Number(n.total) })),
    ...pagos.map((x) => ({ documento: numeroPago(x.numero), href: null as string | null, fecha: x.fecha, operacion: `Pago (${x.formaPago.toLowerCase().replaceAll("_", " ")})`, descripcion: x.observaciones ?? x.referencia, estado: anulado(x.estado), monto: Number(x.montoUsd) })),
  ].sort(reciente);
  return { p, pendientes, historial: todo.slice(0, LIMITE), recortado: todo.length > LIMITE, saldo: redondear2(pendientes.reduce((s, x) => s + x.saldo, 0)) };
}
