import "server-only";
import type { Db } from "@/lib/tenant";
import { numeroFactura } from "@/lib/facturacion/estados";
import { numeroNotaVenta } from "@/lib/notas/estados";
import { numeroAplicacionAnticipo, numeroCobro } from "./estados";

// Estado de cuenta de un cliente (original: lbxEstadoCuentas): todos los movimientos que suben o bajan lo que debe, en USD, con saldo corrido.
// Cargos: facturas y notas de débito. Abonos: cobros, anticipos recibidos, notas de crédito y retenciones que el cliente nos hizo.
// Aplicar un anticipo a una factura no cambia lo que debe en total (baja la factura y el anticipo a la vez): sale como una línea informativa.

export type MovimientoCuenta = { fecha: Date; orden: number; tipo: string; documento: string; detalle: string; cargo: number; abono: number; saldo: number; info?: boolean };

const r4 = (n: number) => Math.round(n * 1e4) / 1e4;

export async function estadoDeCuenta(db: Db, clienteId: string, desde?: Date, hasta?: Date) {
  const [facturas, notas, cobros, retenciones, aplicaciones] = await Promise.all([
    db.factura.findMany({ where: { clienteId, estado: "EMITIDA" }, select: { id: true, numero: true, fecha: true, total: true } }),
    db.notaVenta.findMany({ where: { clienteId, estado: "ACTIVA" }, select: { tipo: true, modo: true, numero: true, fecha: true, total: true, factura: { select: { numero: true } } } }),
    db.cobro.findMany({ where: { clienteId, estado: "REGISTRADO" }, select: { numero: true, fecha: true, formaPago: true, montoUsd: true, anticipoUsd: true } }),
    db.retencion.findMany({ where: { clienteId, sentido: "SUFRIDA", estado: "ACTIVA" }, select: { tipo: true, comprobante: true, fecha: true, montoUsd: true, factura: { select: { numero: true } } } }),
    db.anticipoAplicacion.findMany({ where: { cobro: { clienteId }, estado: "ACTIVA" }, select: { numero: true, fecha: true, montoUsd: true, cobro: { select: { numero: true } }, factura: { select: { numero: true } } } }),
  ]);
  const filas: Omit<MovimientoCuenta, "saldo">[] = [
    ...facturas.map((f) => ({ fecha: f.fecha, orden: 1, tipo: "Factura", documento: numeroFactura(f.numero), detalle: "", cargo: Number(f.total), abono: 0 })),
    ...notas.map((n) => ({ fecha: n.fecha, orden: 2, tipo: n.tipo === "CREDITO" ? "Nota de crédito" : "Nota de débito", documento: numeroNotaVenta(n.tipo, n.numero), detalle: `sobre ${numeroFactura(n.factura.numero)}`, cargo: n.tipo === "DEBITO" ? Number(n.total) : 0, abono: n.tipo === "CREDITO" ? Number(n.total) : 0 })),
    ...cobros.flatMap((c) => [
      ...(Number(c.montoUsd) > 0 ? [{ fecha: c.fecha, orden: 3, tipo: "Cobro", documento: numeroCobro(c.numero), detalle: c.formaPago, cargo: 0, abono: Number(c.montoUsd) }] : []),
      ...(Number(c.anticipoUsd) > 0 ? [{ fecha: c.fecha, orden: 3, tipo: "Anticipo", documento: numeroCobro(c.numero), detalle: "saldo a favor", cargo: 0, abono: Number(c.anticipoUsd) }] : []),
    ]),
    ...retenciones.map((r) => ({ fecha: r.fecha, orden: 4, tipo: `Retención ${r.tipo}`, documento: r.comprobante, detalle: r.factura ? `sobre ${numeroFactura(r.factura.numero)}` : "", cargo: 0, abono: Number(r.montoUsd) })),
    ...aplicaciones.map((a) => ({ fecha: a.fecha, orden: 5, tipo: "Anticipo aplicado", documento: numeroAplicacionAnticipo(a.numero), detalle: `${numeroCobro(a.cobro.numero)} → ${numeroFactura(a.factura.numero)} (${Number(a.montoUsd)} USD)`, cargo: 0, abono: 0, info: true })),
  ].sort((a, b) => a.fecha.getTime() - b.fecha.getTime() || a.orden - b.orden);

  let saldo = 0;
  let anterior = 0;
  const movimientos: MovimientoCuenta[] = [];
  for (const f of filas) {
    saldo = r4(saldo + f.cargo - f.abono);
    if (desde && f.fecha < desde) {
      anterior = saldo;
      continue;
    }
    if (hasta && f.fecha > hasta) continue;
    movimientos.push({ ...f, saldo });
  }
  return { movimientos, saldoAnterior: anterior, saldoFinal: movimientos.length ? movimientos[movimientos.length - 1].saldo : anterior, saldoTotal: saldo };
}
