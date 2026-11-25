import "server-only";
import type { Db } from "@/lib/tenant";
import { calcularLinea } from "@/lib/pedidos/calculos";
import { numeroFactura } from "@/lib/facturacion/estados";
import { numeroNotaVenta } from "@/lib/notas/estados";

// Movimientos de venta para los reportes: lo facturado (FAV), lo acreditado (DEV: notas de crédito, como las «DEV» del sistema anterior) y las
// notas de débito (NDE). Cada movimiento cuenta en la fecha de su propio documento y con el vendedor de la factura. Los montos son en USD, sin
// IVA y después de descuentos. Las facturas anuladas y las notas anuladas no cuentan.

export type TipoMovimiento = "FAV" | "DEV" | "NDE";

export type DocumentoVenta = {
  tipo: TipoMovimiento; fecha: Date; id: string; documento: string; clienteId: string; clienteNombre: string; clienteDocumento: string; vendedorId: string | null;
  base: number; iva: number; total: number; totalBs: number; costo: number;
};

export type LineaVenta = {
  tipo: "FAV" | "DEV"; fecha: Date; documento: string; documentoId: string; clienteId: string; clienteNombre: string; vendedorId: string | null;
  productoCodigo: string; descripcion: string; cantidad: number; monto: number; costo: number; precio: number;
};

const neto = (cantidad: number, precio: number, descuento: number) => calcularLinea({ cantidad, costoUnitario: precio, descuento, ivaPorcentaje: 0 }).neto;
const clienteSel = { select: { razonSocial: true, documento: true } } as const;

/** Documentos de venta del rango (facturas y notas), uno por documento. Las notas por monto (ajuste y cargo) no mueven costo. */
export async function documentosDeVenta(db: Db, desde: Date, hasta: Date): Promise<DocumentoVenta[]> {
  const fecha = { gte: desde, lte: hasta };
  const [facturas, notas] = await Promise.all([
    db.factura.findMany({ where: { estado: "EMITIDA", fecha }, include: { cliente: clienteSel, lineas: { select: { cantidad: true, costoUnitario: true } } }, orderBy: [{ fecha: "asc" }, { numero: "asc" }] }),
    db.notaVenta.findMany({ where: { estado: "ACTIVA", fecha }, include: { cliente: clienteSel, factura: { select: { vendedorId: true } }, lineas: { select: { cantidad: true, costoUnitario: true } } }, orderBy: [{ fecha: "asc" }, { numero: "asc" }] }),
  ]);
  const costo = (ls: { cantidad: unknown; costoUnitario: unknown }[]) => ls.reduce((s, l) => s + Number(l.cantidad) * Number(l.costoUnitario), 0);
  return [
    ...facturas.map((f): DocumentoVenta => ({
      tipo: "FAV", fecha: f.fecha, id: f.id, documento: numeroFactura(f.numero), clienteId: f.clienteId, clienteNombre: f.cliente.razonSocial, clienteDocumento: f.cliente.documento, vendedorId: f.vendedorId,
      base: Number(f.subtotal), iva: Number(f.iva), total: Number(f.total), totalBs: Number(f.totalBs), costo: costo(f.lineas),
    })),
    ...notas.map((n): DocumentoVenta => ({
      tipo: n.tipo === "CREDITO" ? "DEV" : "NDE", fecha: n.fecha, id: n.id, documento: numeroNotaVenta(n.tipo, n.numero), clienteId: n.clienteId, clienteNombre: n.cliente.razonSocial, clienteDocumento: n.cliente.documento,
      vendedorId: n.factura.vendedorId, base: Number(n.subtotal), iva: Number(n.iva), total: Number(n.total), totalBs: Math.round(Number(n.total) * Number(n.tasaUsd) * 100) / 100, costo: costo(n.lineas),
    })),
  ];
}

export type FiltroLineas = { productoCodigo?: string; clienteId?: string; vendedorId?: string | null };

/** Líneas vendidas y devueltas del rango (las notas por monto no tienen líneas de producto). */
export async function lineasDeVenta(db: Db, desde: Date, hasta: Date, filtro: FiltroLineas = {}): Promise<LineaVenta[]> {
  const fecha = { gte: desde, lte: hasta };
  const deCliente = filtro.clienteId ? { clienteId: filtro.clienteId } : {};
  const delProducto = filtro.productoCodigo ? { productoCodigo: filtro.productoCodigo } : {};
  const [facturas, notas] = await Promise.all([
    db.facturaLinea.findMany({
      where: { ...delProducto, factura: { estado: "EMITIDA", fecha, ...deCliente, ...(filtro.vendedorId !== undefined ? { vendedorId: filtro.vendedorId } : {}) } },
      include: { factura: { include: { cliente: clienteSel } } },
    }),
    db.notaVentaLinea.findMany({
      where: { ...delProducto, nota: { estado: "ACTIVA", tipo: "CREDITO", fecha, ...deCliente, ...(filtro.vendedorId !== undefined ? { factura: { vendedorId: filtro.vendedorId } } : {}) } },
      include: { nota: { include: { cliente: clienteSel, factura: { select: { vendedorId: true } } } } },
    }),
  ]);
  return [
    ...facturas.map((l): LineaVenta => ({
      tipo: "FAV", fecha: l.factura.fecha, documento: numeroFactura(l.factura.numero), documentoId: l.facturaId, clienteId: l.factura.clienteId, clienteNombre: l.factura.cliente.razonSocial, vendedorId: l.factura.vendedorId,
      productoCodigo: l.productoCodigo, descripcion: l.descripcion, cantidad: Number(l.cantidad), monto: neto(Number(l.cantidad), Number(l.precioUnitario), Number(l.descuento)), costo: Number(l.cantidad) * Number(l.costoUnitario), precio: Number(l.precioUnitario),
    })),
    ...notas.map((l): LineaVenta => ({
      tipo: "DEV", fecha: l.nota.fecha, documento: numeroNotaVenta(l.nota.tipo, l.nota.numero), documentoId: l.notaId, clienteId: l.nota.clienteId, clienteNombre: l.nota.cliente.razonSocial, vendedorId: l.nota.factura.vendedorId,
      productoCodigo: l.productoCodigo, descripcion: l.descripcion, cantidad: Number(l.cantidad), monto: neto(Number(l.cantidad), Number(l.precioUnitario), Number(l.descuento)), costo: Number(l.cantidad) * Number(l.costoUnitario), precio: Number(l.precioUnitario),
    })),
  ];
}
