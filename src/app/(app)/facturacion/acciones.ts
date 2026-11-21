"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requerirPermisoAccion } from "@/lib/dal";
import { anularFactura, emitirFactura, emitirFacturaDePedido } from "@/lib/facturacion/servicio";
import { buscarProductosVenta, type ProductoVenta } from "@/lib/pedidos/servicio";

export type EstadoFacturaForm = { error?: string };

const Factura = z.object({
  clienteId: z.string().uuid("Elige un cliente"),
  almacenId: z.string().uuid("Elige un almacén"),
  observaciones: z.string().trim().max(1000).transform((v) => v || null),
  lineas: z.array(z.object({
    productoCodigo: z.string().min(1).max(60),
    cantidad: z.number().finite(),
    precioUnitario: z.number().finite(),
    descuento: z.number().finite(),
  })).max(500),
});

export async function buscarProductosFactura(texto: string): Promise<ProductoVenta[]> {
  const { db } = await requerirPermisoAccion("facturacion", "crear");
  return buscarProductosVenta(db, texto);
}

/** Emite una factura directa o, si trae `pedidoId`, la del pedido confirmado (con sus líneas y precios). */
export async function emitirFacturaVenta(pedidoId: string | null, datos: unknown): Promise<EstadoFacturaForm> {
  const ctx = await requerirPermisoAccion("facturacion", "crear");
  let res;
  if (pedidoId) {
    const r = z.object({ almacenId: z.string().uuid("Elige un almacén"), observaciones: z.string().trim().max(1000).transform((v) => v || null) }).safeParse(datos);
    if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
    res = await emitirFacturaDePedido(ctx.db, ctx.usuario, pedidoId, r.data.almacenId, r.data.observaciones);
  } else {
    const r = Factura.safeParse(datos);
    if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
    res = await emitirFactura(ctx.db, ctx.usuario, r.data);
  }
  if (!res.ok) return { error: res.error };
  revalidatePath("/facturacion");
  revalidatePath("/pedidos");
  revalidatePath("/existencias");
  redirect(`/facturacion/${res.id}`);
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
