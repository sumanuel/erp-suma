"use server";

import { tope } from "@/lib/busqueda-productos";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requerirPermisoAccion } from "@/lib/dal";
import { anularImportacion, guardarImportacion, procesarImportacion } from "@/lib/importaciones/servicio";

export type EstadoImportacionForm = { error?: string };

const Fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida").transform((s) => new Date(`${s}T00:00:00.000Z`)).refine((d) => !Number.isNaN(d.getTime()), "Fecha inválida");

const Importacion = z.object({
  proveedorId: z.string().uuid("Elige el proveedor"),
  documento: z.string().trim().min(1, "Indica el documento del proveedor").max(40),
  fecha: Fecha,
  almacenId: z.string().uuid("Elige el almacén de ingreso"),
  moneda: z.string().trim().toUpperCase(),
  cambioUsd: z.number().finite(),
  factorCif: z.number().finite(),
  factorOtros: z.number().finite(),
  observaciones: z.string().trim().max(1000).transform((v) => v || null),
  lineas: z.array(z.object({ productoCodigo: z.string().min(1).max(60), cantidad: z.number().finite(), fobUnitario: z.number().finite(), arancelPct: z.number().finite() })).max(300),
  gastos: z.array(z.object({ descripcion: z.string().trim().max(120), montoUsd: z.number().finite(), proveedorId: z.union([z.string().uuid(), z.literal("")]).transform((v) => v || null) })).max(100),
});

export type ProductoImportacion = { codigo: string; descripcion: string; arancelPct: number };

/** Busca productos para el expediente, con el arancel de su ficha. */
export async function buscarProductosImportacion(texto: string, limite?: number): Promise<ProductoImportacion[]> {
  const { db } = await requerirPermisoAccion("importaciones", "ver");
  const q = texto.trim().slice(0, 60);
  if (q.length < 2 && !limite) return [];
  const r = await db.producto.findMany({
    where: { activo: true, OR: [{ codigo: { contains: q, mode: "insensitive" } }, { descripcion: { contains: q, mode: "insensitive" } }, { codigoBarras: q }] },
    include: { arancel: { select: { porcentaje: true } } },
    orderBy: { descripcion: "asc" },
    take: tope(limite),
  });
  return r.map((p) => ({ codigo: p.codigo, descripcion: p.descripcion, arancelPct: Number(p.arancel?.porcentaje ?? 0) }));
}

export async function guardarImportacionForm(id: string | null, datos: unknown): Promise<EstadoImportacionForm> {
  const ctx = await requerirPermisoAccion("importaciones", id ? "editar" : "crear");
  const r = Importacion.safeParse(datos);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  const res = await guardarImportacion(ctx.db, ctx.usuario, id, r.data);
  if (!res.ok) return { error: res.error };
  revalidatePath("/importaciones");
  redirect(`/importaciones/${res.id}`);
}

export async function procesarImportacionForm(id: string): Promise<string | null> {
  const ctx = await requerirPermisoAccion("importaciones", "editar");
  const r = await procesarImportacion(ctx.db, ctx.usuario, id);
  revalidatePath("/importaciones");
  revalidatePath(`/importaciones/${id}`);
  revalidatePath("/existencias");
  return r.ok ? null : r.error;
}

export async function anularImportacionForm(id: string, motivo: string): Promise<string | null> {
  const ctx = await requerirPermisoAccion("importaciones", "eliminar");
  const r = await anularImportacion(ctx.db, ctx.usuario, id, motivo);
  revalidatePath("/importaciones");
  revalidatePath(`/importaciones/${id}`);
  revalidatePath("/existencias");
  return r.ok ? null : r.error;
}
