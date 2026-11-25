"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requerirPermisoAccion, tienePermisoEspecial } from "@/lib/dal";
import { EncabezadoVentaZ } from "@/lib/ventas/esquemas";
import { asignarBultos, anularPedido, buscarProductosVenta, confirmarPedido, guardarPedido, resolverAprobacion, type ProductoVenta } from "@/lib/pedidos/servicio";

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
    presentacionId: z.string().uuid().nullable().optional(),
  })).max(500),
});

/** Busca productos activos para armar el pedido, con su precio de lista y lo disponible (existencia menos reservas). */
export async function buscarProductosPedido(texto: string, lista = "A", limite?: number): Promise<ProductoVenta[]> {
  const { db } = await requerirPermisoAccion("pedidos", "ver");
  return buscarProductosVenta(db, texto, lista, limite);
}

export async function guardarPedidoVenta(id: string | null, datos: unknown): Promise<EstadoPedidoForm> {
  const ctx = await requerirPermisoAccion("pedidos", id ? "editar" : "crear");
  const r = Pedido.safeParse(datos);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  const res = await guardarPedido(ctx.db, ctx.usuario, id, { ...r.data, sinCambiarPrecio: !tienePermisoEspecial(ctx, "ventas.cambiar_precio") });
  if (!res.ok) return { error: res.error };
  revalidatePath("/pedidos");
  redirect(`/pedidos/${res.id}`);
}

/** Resultado de una acción sobre el pedido: error, o un aviso (el pedido quedó por aprobar por gerencia). */
export type ResultadoAccionPedido = { error?: string; aviso?: string };

function refrescar(id: string) {
  revalidatePath("/pedidos");
  revalidatePath(`/pedidos/${id}`);
}

export async function confirmarPedidoVenta(id: string): Promise<ResultadoAccionPedido> {
  const ctx = await requerirPermisoAccion("pedidos", "editar");
  const r = await confirmarPedido(ctx.db, ctx.usuario, id);
  refrescar(id);
  return r.ok ? { aviso: r.porAprobar } : { error: r.error };
}

export async function anularPedidoVenta(id: string): Promise<ResultadoAccionPedido> {
  const ctx = await requerirPermisoAccion("pedidos", "eliminar");
  const r = await anularPedido(ctx.db, ctx.usuario, id);
  refrescar(id);
  return r.ok ? {} : { error: r.error };
}

export async function asignarBultosPedido(id: string, asignaciones: { lineaId: string; bulto: number | null }[]): Promise<string | null> {
  const ctx = await requerirPermisoAccion("pedidos", "editar");
  const r = z.array(z.object({ lineaId: z.string().uuid(), bulto: z.number().int().nullable() })).max(500).safeParse(asignaciones);
  if (!r.success) return "Datos inválidos";
  const res = await asignarBultos(ctx.db, ctx.usuario, id, r.data);
  refrescar(id);
  return res.ok ? null : res.error;
}

/** Aprobar o rechazar un pedido por aprobar: solo quien tiene el permiso especial «ventas.aprobar». */
export async function decidirPedidoVenta(id: string, decision: "APROBADO" | "RECHAZADO", motivo: string): Promise<ResultadoAccionPedido> {
  const ctx = await requerirPermisoAccion("pedidos", "editar");
  if (!tienePermisoEspecial(ctx, "ventas.aprobar")) return { error: "No tienes permiso para aprobar pedidos." };
  const r = await resolverAprobacion(ctx.db, ctx.usuario, id, decision, motivo);
  refrescar(id);
  return r.ok ? {} : { error: r.error };
}
