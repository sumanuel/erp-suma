"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requerirPermisoAccion } from "@/lib/dal";
import { EncabezadoVentaZ } from "@/lib/ventas/esquemas";
import { anularPedido, buscarProductosVenta, confirmarPedido, guardarPedido, type ProductoVenta } from "@/lib/pedidos/servicio";

export type EstadoPedidoForm = { error?: string };

const Fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida").transform((s) => new Date(`${s}T00:00:00.000Z`)).refine((d) => !Number.isNaN(d.getTime()), "Fecha inválida");

const Pedido = z.object({
  encabezado: EncabezadoVentaZ.optional(),
  clienteId: z.string().uuid("Elige un cliente"),
  fecha: Fecha,
  observaciones: z.string().trim().max(1000).transform((v) => v || null),
  lineas: z.array(z.object({
    productoCodigo: z.string().min(1).max(60),
    cantidad: z.number().finite(),
    precioUnitario: z.number().finite(),
    descuento: z.number().finite(),
  })).max(500),
});

/** Busca productos activos para armar el pedido, con su precio de lista y lo disponible (existencia menos reservas). */
export async function buscarProductosPedido(texto: string, lista = "A"): Promise<ProductoVenta[]> {
  const { db } = await requerirPermisoAccion("pedidos", "ver");
  return buscarProductosVenta(db, texto, lista);
}

export async function guardarPedidoVenta(id: string | null, datos: unknown): Promise<EstadoPedidoForm> {
  const ctx = await requerirPermisoAccion("pedidos", id ? "editar" : "crear");
  const r = Pedido.safeParse(datos);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  const res = await guardarPedido(ctx.db, ctx.usuario, id, r.data);
  if (!res.ok) return { error: res.error };
  revalidatePath("/pedidos");
  redirect(`/pedidos/${res.id}`);
}

async function cambiar(id: string, accion: "editar" | "eliminar", f: typeof confirmarPedido): Promise<string | null> {
  const ctx = await requerirPermisoAccion("pedidos", accion);
  const r = await f(ctx.db, ctx.usuario, id);
  revalidatePath("/pedidos");
  revalidatePath(`/pedidos/${id}`);
  return r.ok ? null : r.error;
}

export const confirmarPedidoVenta = async (id: string) => cambiar(id, "editar", confirmarPedido);
export const anularPedidoVenta = async (id: string) => cambiar(id, "eliminar", anularPedido);
