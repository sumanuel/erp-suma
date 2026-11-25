"use server";

import { tope } from "@/lib/busqueda-productos";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requerirPermisoAccion } from "@/lib/dal";
import { anularOrden, emitirOrden, guardarOrden, recibirOrden } from "@/lib/compras/servicio";

export type EstadoOrden = { error?: string; errores?: Record<string, string> };
export type ProductoBusqueda = { codigo: string; descripcion: string; ultimoCosto: number; ivaPorcentaje: number };

const Fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida").transform((s) => new Date(`${s}T00:00:00.000Z`)).refine((d) => !Number.isNaN(d.getTime()), "Fecha inválida");

const Orden = z.object({
  proveedorId: z.string().uuid("Elige un proveedor"),
  fecha: Fecha,
  fechaEsperada: z.union([Fecha, z.literal("")]).transform((v) => (v === "" ? null : v)),
  observaciones: z.string().trim().max(1000).transform((v) => v || null),
  lineas: z.array(z.object({
    productoCodigo: z.string().min(1).max(60),
    cantidad: z.number().finite(),
    costoUnitario: z.number().finite(),
    descuento: z.number().finite(),
    descuento2: z.number().finite().optional(),
    descuento3: z.number().finite().optional(),
    arancelId: z.union([z.string().uuid(), z.literal("")]).transform((v) => v || null).nullable().optional(),
  })).max(500),
  encabezado: z.object({
    condicionPagoId: z.string().uuid().nullable(),
    transporteId: z.string().uuid().nullable(),
    centroCostoId: z.string().uuid().nullable(),
    referencia: z.string().trim().max(60).nullable(),
    moneda: z.enum(["USD", "VES"]),
    valorCambio: z.number().finite().nullable(),
    descuentos: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]),
  }).optional(),
});

/** Busca productos activos por código, descripción o código de barras para armar las líneas de la orden. */
export async function buscarProductos(texto: string, limite?: number): Promise<ProductoBusqueda[]> {
  const { db } = await requerirPermisoAccion("compras", "ver");
  const q = texto.trim().slice(0, 60);
  if (q.length < 2 && !limite) return [];
  const r = await db.producto.findMany({
    where: { activo: true, OR: [{ codigo: { contains: q, mode: "insensitive" } }, { descripcion: { contains: q, mode: "insensitive" } }, { codigoBarras: q }] },
    include: { alicuotaIva: { select: { porcentajeCompra: true } } },
    orderBy: { descripcion: "asc" },
    take: tope(limite),
  });
  return r.map((p) => ({ codigo: p.codigo, descripcion: p.descripcion, ultimoCosto: Number(p.ultimoCosto), ivaPorcentaje: Number(p.alicuotaIva.porcentajeCompra) }));
}

export async function guardarOrdenCompra(id: string | null, datos: unknown): Promise<EstadoOrden> {
  const ctx = await requerirPermisoAccion("compras", id ? "editar" : "crear");
  const r = Orden.safeParse(datos);
  if (!r.success) {
    const errores: Record<string, string> = {};
    for (const i of r.error.issues) errores[String(i.path[0])] ??= i.message;
    return { errores, error: Object.values(errores)[0] };
  }
  const res = await guardarOrden(ctx.db, ctx.usuario, id, r.data);
  if (!res.ok) return { error: res.error };
  revalidatePath("/compras");
  redirect(`/compras/${res.id}`);
}

async function cambiar(id: string, accion: "editar" | "eliminar", f: typeof emitirOrden): Promise<string | null> {
  const ctx = await requerirPermisoAccion("compras", accion);
  const r = await f(ctx.db, ctx.usuario, id);
  revalidatePath("/compras");
  revalidatePath(`/compras/${id}`);
  return r.ok ? null : r.error;
}

export const emitirOrdenCompra = async (id: string) => cambiar(id, "editar", emitirOrden);
export const anularOrdenCompra = async (id: string) => cambiar(id, "eliminar", anularOrden);

const Recepcion = z.object({
  almacenId: z.string().uuid("Elige un almacén"),
  documento: z.string().trim().max(60).transform((v) => v || null),
  observaciones: z.string().trim().max(1000).transform((v) => v || null),
  lineas: z.array(z.object({ ordenLineaId: z.string().uuid(), cantidad: z.number().finite().min(0) })).max(500),
});

export async function recibirOrdenCompra(id: string, datos: unknown): Promise<EstadoOrden> {
  const ctx = await requerirPermisoAccion("compras", "editar");
  const r = Recepcion.safeParse(datos);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  const almacen = await ctx.db.almacen.findUnique({ where: { id: r.data.almacenId }, select: { activo: true } });
  if (!almacen?.activo) return { error: "El almacén no existe o está inactivo." };
  const res = await recibirOrden(ctx.db, ctx.usuario, id, r.data);
  if (!res.ok) return { error: res.error };
  revalidatePath("/compras");
  revalidatePath(`/compras/${id}`);
  revalidatePath("/existencias");
  redirect(`/compras/${id}`);
}
