"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requerirPermisoAccion, tienePermisoEspecial } from "@/lib/dal";
import { EncabezadoVentaZ } from "@/lib/ventas/esquemas";
import { anularCotizacion, convertirEnPedido, emitirCotizacion, guardarCotizacion, rechazarCotizacion, type ResultadoCotizacion } from "@/lib/cotizaciones/servicio";
import type { Actor } from "@/lib/inventario/movimientos";
import type { Db } from "@/lib/tenant";
import { buscarProductosVenta, type ProductoVenta } from "@/lib/pedidos/servicio";

export type EstadoCotizacionForm = { error?: string };

const Fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida").transform((s) => new Date(`${s}T00:00:00.000Z`)).refine((d) => !Number.isNaN(d.getTime()), "Fecha inválida");

const Cotizacion = z.object({
  encabezado: EncabezadoVentaZ.optional(),
  clienteId: z.string().uuid("Elige un cliente"),
  fecha: Fecha,
  validezDias: z.number().int("La vigencia debe ser un número entero de días").min(1, "La vigencia mínima es 1 día").max(365, "La vigencia máxima es 365 días"),
  observaciones: z.string().trim().max(1000).transform((v) => v || null),
  lineas: z.array(z.object({
    productoCodigo: z.string().min(1).max(60),
    cantidad: z.number().finite(),
    precioUnitario: z.number().finite(),
    descuento: z.number().finite(),
  })).max(500),
});

/** Busca productos activos para armar la cotización, con su precio de lista y lo disponible (informativo: no reserva). */
export async function buscarProductosCotizacion(texto: string, lista = "A"): Promise<ProductoVenta[]> {
  const { db } = await requerirPermisoAccion("cotizaciones", "ver");
  return buscarProductosVenta(db, texto, lista);
}

export async function guardarCotizacionVenta(id: string | null, datos: unknown): Promise<EstadoCotizacionForm> {
  const ctx = await requerirPermisoAccion("cotizaciones", id ? "editar" : "crear");
  const r = Cotizacion.safeParse(datos);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  const res = await guardarCotizacion(ctx.db, ctx.usuario, id, { ...r.data, sinCambiarPrecio: !tienePermisoEspecial(ctx, "ventas.cambiar_precio") });
  if (!res.ok) return { error: res.error };
  revalidatePath("/cotizaciones");
  redirect(`/cotizaciones/${res.id}`);
}

type Cambio = (db: Db, actor: Actor, id: string) => Promise<ResultadoCotizacion>;

async function cambiar(id: string, accion: "editar" | "eliminar", f: Cambio): Promise<string | null> {
  const ctx = await requerirPermisoAccion("cotizaciones", accion);
  const r = await f(ctx.db, ctx.usuario, id);
  revalidatePath("/cotizaciones");
  revalidatePath(`/cotizaciones/${id}`);
  return r.ok ? null : r.error;
}

export const emitirCotizacionVenta = async (id: string) => cambiar(id, "editar", emitirCotizacion);
export const anularCotizacionVenta = async (id: string) => cambiar(id, "eliminar", anularCotizacion);

export async function rechazarCotizacionVenta(id: string, motivo: string): Promise<string | null> {
  const ctx = await requerirPermisoAccion("cotizaciones", "editar");
  const r = await rechazarCotizacion(ctx.db, ctx.usuario, id, motivo);
  revalidatePath("/cotizaciones");
  revalidatePath(`/cotizaciones/${id}`);
  return r.ok ? null : r.error;
}

/** Convierte la cotización en un pedido en borrador: exige poder editar cotizaciones y crear pedidos. */
export async function convertirCotizacionEnPedido(id: string): Promise<{ error?: string }> {
  const ctx = await requerirPermisoAccion("cotizaciones", "editar");
  await requerirPermisoAccion("pedidos", "crear");
  const r = await convertirEnPedido(ctx.db, ctx.usuario, id);
  if (!r.ok) return { error: r.error };
  revalidatePath("/cotizaciones");
  revalidatePath("/pedidos");
  redirect(`/pedidos/${r.pedidoId}`);
}
