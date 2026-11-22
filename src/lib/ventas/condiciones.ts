import "server-only";
import type { Db } from "@/lib/tenant";
import { hoyCaracas } from "@/lib/tasas";

// Reglas comerciales compartidas por cotizaciones, pedidos y facturas: condiciones del documento (vendedor, condición de pago, transporte,
// entrega, descuentos globales) y control de crédito del cliente. Se llaman dentro de la transacción del documento.

export class VentaError extends Error {}
export type TxVenta = Parameters<Parameters<Db["$transaction"]>[0]>[0];

export type EncabezadoVenta = {
  vendedorId: string | null;
  condicionPagoId: string | null;
  transporteId: string | null;
  direccionEntrega: string | null;
  /// Descuentos globales 1, 2 y 3 (%), en cadena.
  descuentos: [number, number, number];
};
export const ENCABEZADO_VACIO: EncabezadoVenta = { vendedorId: null, condicionPagoId: null, transporteId: null, direccionEntrega: null, descuentos: [0, 0, 0] };

/** Valida el encabezado y lo deja en las columnas del documento. */
export async function validarEncabezado(tx: TxVenta, enc: EncabezadoVenta | undefined) {
  const e = enc ?? ENCABEZADO_VACIO;
  for (const [i, d] of e.descuentos.entries()) {
    if (!Number.isFinite(d) || d < 0 || d > 100) throw new VentaError(`El descuento global ${i + 1} debe estar entre 0 y 100.`);
  }
  if (e.vendedorId) {
    const v = await tx.vendedor.findUnique({ where: { id: e.vendedorId }, select: { activo: true, esVendedor: true } });
    if (!v || !v.activo || !v.esVendedor) throw new VentaError("El vendedor no existe, está inactivo o no es vendedor.");
  }
  if (e.condicionPagoId && !(await tx.condicionPago.findUnique({ where: { id: e.condicionPagoId }, select: { activo: true } }))?.activo) throw new VentaError("La condición de pago no existe o está inactiva.");
  if (e.transporteId && !(await tx.transporte.findUnique({ where: { id: e.transporteId }, select: { activo: true } }))?.activo) throw new VentaError("El transporte no existe o está inactivo.");
  const entrega = e.direccionEntrega?.trim() || null;
  if (entrega && entrega.length > 300) throw new VentaError("La dirección de entrega admite máximo 300 caracteres.");
  return {
    descuentos: e.descuentos,
    columnas: {
      vendedorId: e.vendedorId, condicionPagoId: e.condicionPagoId, transporteId: e.transporteId, direccionEntrega: entrega,
      descuentoGlobal1: e.descuentos[0], descuentoGlobal2: e.descuentos[1], descuentoGlobal3: e.descuentos[2],
    },
  };
}

/** Encabezado de un documento ya guardado, para copiarlo al siguiente (cotización → pedido → factura). */
export const encabezadoDe = (x: { vendedorId: string | null; condicionPagoId: string | null; transporteId: string | null; direccionEntrega: string | null; descuentoGlobal1: unknown; descuentoGlobal2: unknown; descuentoGlobal3: unknown }): EncabezadoVenta => ({
  vendedorId: x.vendedorId, condicionPagoId: x.condicionPagoId, transporteId: x.transporteId, direccionEntrega: x.direccionEntrega,
  descuentos: [Number(x.descuentoGlobal1), Number(x.descuentoGlobal2), Number(x.descuentoGlobal3)],
});

/**
 * Control de crédito al vender. Un cliente bloqueado no compra; a crédito (días > 0) solo compra quien tiene crédito, no es moroso, no se pasa
 * de su límite (lo que ya debe más esta venta) y no tiene facturas vencidas por más de sus días máximos. Al contado solo importa el bloqueo.
 */
export async function verificarCredito(tx: TxVenta, clienteId: string, totalUsd: number, diasCredito: number) {
  const c = await tx.cliente.findUnique({ where: { id: clienteId }, select: { razonSocial: true, situacion: true, tieneCredito: true, limiteCredito: true, diasMaxVencimiento: true } });
  if (!c) throw new VentaError("El cliente no existe.");
  if (c.situacion === "BLOQUEADO") throw new VentaError(`${c.razonSocial} está bloqueado: no se le puede vender.`);
  if (diasCredito <= 0) return;
  if (c.situacion === "MOROSO") throw new VentaError(`${c.razonSocial} es moroso: solo se le vende de contado.`);
  if (!c.tieneCredito) throw new VentaError(`${c.razonSocial} no tiene crédito: pon 0 días de crédito (contado) o habilítaselo en su ficha.`);
  const abiertas = await tx.factura.findMany({ where: { clienteId, estado: "EMITIDA", saldo: { gt: 0 } }, select: { saldo: true, fechaVencimiento: true } });
  const debe = abiertas.reduce((s, f) => s + Number(f.saldo), 0);
  const limite = Number(c.limiteCredito);
  if (limite > 0 && debe + totalUsd > limite + 1e-9) {
    throw new VentaError(`Supera el límite de crédito de ${c.razonSocial}: debe ${debe.toFixed(2)} USD y esta venta suma ${totalUsd.toFixed(2)} sobre un límite de ${limite.toFixed(2)} USD.`);
  }
  if (c.diasMaxVencimiento > 0) {
    const hoy = hoyCaracas().getTime();
    const peor = Math.max(0, ...abiertas.map((f) => Math.floor((hoy - f.fechaVencimiento.getTime()) / 86_400_000)));
    if (peor > c.diasMaxVencimiento) throw new VentaError(`${c.razonSocial} tiene facturas vencidas hace ${peor} días (máximo permitido ${c.diasMaxVencimiento}): debe ponerse al día para comprar a crédito.`);
  }
}
