"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requerirPermisoAccion, tienePermiso, tienePermisoEspecial } from "@/lib/dal";
import { facturarYCobrar } from "@/lib/facturacion/contado";
import { EncabezadoVentaZ } from "@/lib/ventas/esquemas";
import { anularFactura, emitirFactura, emitirFacturaDePedido, registrarNumerosFiscales } from "@/lib/facturacion/servicio";
import { anularNotaVenta, crearNotaVenta, registrarDatosFiscalesNota } from "@/lib/notas/servicio";
import { buscarProductosVenta, type ProductoVenta } from "@/lib/pedidos/servicio";

export type EstadoFacturaForm = { error?: string };

const Aprobacion = z.object({ motivo: z.string().trim().min(3, "Escribe el motivo de la aprobación").max(300) }).nullable().optional();

const Cobro = z.object({
  pagos: z.array(z.object({ formaPago: z.string().max(30), moneda: z.enum(["USD", "VES"]), recibido: z.number().finite(), cuentaId: z.string().uuid("Elige la caja o cuenta de cada pago"), referencia: z.string().max(60).optional() })).min(1, "Indica cómo paga el cliente").max(10),
  monedaVuelto: z.enum(["USD", "VES"]).optional(),
  cajaVueltoId: z.string().uuid().nullable().optional(),
}).nullable().optional();

const Factura = z.object({
  aprobacion: Aprobacion,
  cobro: Cobro,
  encabezado: EncabezadoVentaZ.optional(),
  clienteId: z.string().uuid("Elige un cliente"),
  almacenId: z.string().uuid("Elige un almacén"),
  observaciones: z.string().trim().max(1000).transform((v) => v || null),
  diasCredito: z.number().int("Días de crédito inválidos").min(0).max(365),
  lineas: z.array(z.object({
    productoCodigo: z.string().min(1).max(60),
    cantidad: z.number().finite(),
    precioUnitario: z.number().finite(),
    descuento: z.number().finite(),
    presentacionId: z.string().uuid().nullable().optional(),
    almacenId: z.string().uuid().nullable().optional(),
  })).max(500),
});

/** La aprobación solo vale si quien emite tiene el permiso especial: si no, se ignora y rige el control de crédito normal. */
const aprobacionDe = (ctx: Parameters<typeof tienePermisoEspecial>[0], a: { motivo: string } | null | undefined) => (a && tienePermisoEspecial(ctx, "ventas.aprobar") ? { motivo: a.motivo } : undefined);

export async function buscarProductosFactura(texto: string, lista = "A", limite?: number): Promise<ProductoVenta[]> {
  const { db } = await requerirPermisoAccion("facturacion", "crear");
  return buscarProductosVenta(db, texto, lista, limite);
}

/** Emite una factura directa o, si trae `pedidoId`, la del pedido confirmado (con sus líneas y precios). */
export async function emitirFacturaVenta(pedidoId: string | null, datos: unknown): Promise<EstadoFacturaForm> {
  const ctx = await requerirPermisoAccion("facturacion", "crear");
  const sinCobro = (dias: number, cobro: unknown) => {
    // Cobrar es un permiso aparte: quien lo tiene debe cobrar la venta de contado aquí; quien no, la deja por cobrar.
    if (cobro && !tienePermiso(ctx, "cxc", "crear")) return "No tienes permiso para registrar cobros.";
    if (cobro && dias !== 0) return "Solo la factura de contado se cobra al emitirla.";
    if (!cobro && dias === 0 && tienePermiso(ctx, "cxc", "crear")) return "La factura es de contado: registra el cobro.";
    return null;
  };
  let res;
  let cobrada = false;
  let vuelto: { moneda: string; monto: number } | null = null;
  if (pedidoId) {
    const r = z.object({ aprobacion: Aprobacion, cobro: Cobro, almacenId: z.string().uuid("Elige un almacén"), observaciones: z.string().trim().max(1000).transform((v) => v || null), diasCredito: z.number().int("Días de crédito inválidos").min(0).max(365) }).safeParse(datos);
    if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
    const falta = sinCobro(r.data.diasCredito, r.data.cobro);
    if (falta) return { error: falta };
    if (r.data.cobro) {
      const c = await facturarYCobrar(ctx.db, ctx.usuario, { pedidoId, almacenId: r.data.almacenId, observaciones: r.data.observaciones, aprobacion: aprobacionDe(ctx, r.data.aprobacion) }, r.data.cobro);
      res = c;
      if (c.ok) { cobrada = true; vuelto = c.vuelto; }
    } else res = await emitirFacturaDePedido(ctx.db, ctx.usuario, pedidoId, r.data.almacenId, r.data.observaciones, r.data.diasCredito, aprobacionDe(ctx, r.data.aprobacion));
  } else {
    const r = Factura.safeParse(datos);
    if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
    const falta = sinCobro(r.data.diasCredito, r.data.cobro);
    if (falta) return { error: falta };
    const { cobro, ...factura } = r.data;
    const doc = { ...factura, aprobacion: aprobacionDe(ctx, factura.aprobacion), sinCambiarPrecio: !tienePermisoEspecial(ctx, "ventas.cambiar_precio") };
    if (cobro) {
      const c = await facturarYCobrar(ctx.db, ctx.usuario, { pedidoId: null, datos: doc }, cobro);
      res = c;
      if (c.ok) { cobrada = true; vuelto = c.vuelto; }
    } else res = await emitirFactura(ctx.db, ctx.usuario, doc);
  }
  if (!res.ok) return { error: res.error };
  revalidatePath("/facturacion");
  revalidatePath("/pedidos");
  revalidatePath("/existencias");
  revalidatePath("/cxc", "layout");
  revalidatePath("/tesoreria", "layout");
  redirect(`/facturacion/${res.id}${cobrada ? `?cobrada=1${vuelto ? `&vuelto=${vuelto.monto}&moneda=${vuelto.moneda}` : ""}` : ""}`);
}

export async function anularFacturaVenta(id: string, motivo: string): Promise<string | null> {
  const ctx = await requerirPermisoAccion("facturacion", "eliminar");
  const r = await anularFactura(ctx.db, ctx.usuario, id, motivo);
  revalidatePath("/facturacion");
  revalidatePath(`/facturacion/${id}`);
  revalidatePath("/pedidos");
  revalidatePath("/existencias");
  return r.ok ? null : r.error;
}

const campoFiscal = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);
const Numeros = z.object({ numeroFiscal: campoFiscal(40), numeroControl: campoFiscal(40), impresoraSerial: campoFiscal(40), impresoraModelo: campoFiscal(80) });

/** Registra el número de factura fiscal y el de control de una factura emitida (una sola vez). */
export async function registrarNumerosFiscalesFactura(id: string, datos: unknown): Promise<string | null> {
  const ctx = await requerirPermisoAccion("facturacion", "editar");
  const r = Numeros.safeParse(datos);
  if (!r.success) return "Datos inválidos";
  const res = await registrarNumerosFiscales(ctx.db, ctx.usuario, id, r.data);
  revalidatePath(`/facturacion/${id}`);
  revalidatePath("/facturacion");
  return res.ok ? null : res.error;
}

const NotaVenta = z.discriminatedUnion("modo", [
  z.object({ modo: z.literal("DEVOLUCION"), tipo: z.literal("CREDITO"), facturaId: z.string().uuid(), motivo: z.string().trim().min(3, "Escribe el motivo de la nota").max(300), almacenId: z.string().uuid("Elige el almacén al que regresa la mercancía"), lineas: z.array(z.object({ facturaLineaId: z.string().uuid(), cantidad: z.number().finite() })).max(500) }),
  z.object({ modo: z.literal("AJUSTE"), tipo: z.literal("CREDITO"), facturaId: z.string().uuid(), motivo: z.string().trim().min(3, "Escribe el motivo de la nota").max(300), base: z.number().finite("Monto inválido"), ivaPorcentaje: z.number().finite("Alícuota inválida") }),
  z.object({ modo: z.literal("CARGO"), tipo: z.literal("DEBITO"), facturaId: z.string().uuid(), motivo: z.string().trim().min(3, "Escribe el motivo de la nota").max(300), base: z.number().finite("Monto inválido"), ivaPorcentaje: z.number().finite("Alícuota inválida") }),
]);

/** Registra los datos fiscales de una nota de venta (una sola vez cada uno). */
export async function registrarNumerosFiscalesNota(id: string, datos: unknown): Promise<string | null> {
  const ctx = await requerirPermisoAccion("facturacion", "editar");
  const r = Numeros.safeParse(datos);
  if (!r.success) return "Datos inválidos";
  const res = await registrarDatosFiscalesNota(ctx.db, ctx.usuario, id, r.data);
  revalidatePath(`/facturacion/notas/${id}`);
  revalidatePath("/facturacion/notas");
  return res.ok ? null : res.error;
}

export async function emitirNotaVenta(datos: unknown): Promise<{ error?: string }> {
  const ctx = await requerirPermisoAccion("facturacion", "crear");
  const r = NotaVenta.safeParse(datos);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  const res = await crearNotaVenta(ctx.db, ctx.usuario, r.data);
  if (!res.ok) return { error: res.error };
  revalidatePath("/facturacion", "layout");
  revalidatePath("/cxc", "layout");
  revalidatePath("/existencias", "layout");
  redirect(`/facturacion/notas/${res.id}`);
}

export async function anularNotaDeVenta(id: string, motivo: string): Promise<string | null> {
  const ctx = await requerirPermisoAccion("facturacion", "eliminar");
  const r = await anularNotaVenta(ctx.db, ctx.usuario, id, motivo);
  revalidatePath("/facturacion", "layout");
  revalidatePath("/cxc", "layout");
  revalidatePath("/existencias", "layout");
  return r.ok ? null : r.error;
}
