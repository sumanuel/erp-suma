"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requerirPermisoAccion } from "@/lib/dal";
import { aplicarCambio, calcularCambio, validarRegla, type FilaCambio, type ResultadoCambio } from "@/lib/productos/precios-masivos";

const uuid = z.union([z.string().uuid(), z.literal("")]).transform((v) => v || undefined).optional();
const Datos = z.object({
  filtros: z.object({ categoriaId: uuid, subcategoriaId: uuid, marcaId: uuid, divisionId: uuid, proveedorId: uuid, texto: z.string().trim().max(60).optional(), incluirInactivos: z.boolean().optional() }),
  regla: z.object({ lista: z.string().max(1), modo: z.enum(["PORCENTAJE", "MONTO", "MARGEN_COSTO"]), valor: z.number().finite(), decimales: z.number().int() }),
});

export type VistaPrevia = { error: string } | { ok: true; filas: FilaCambio[]; omitidos: ResultadoCambio["omitidos"]; total: number; cambian: number };

export async function previsualizarCambioPrecios(datos: unknown): Promise<VistaPrevia> {
  const { db } = await requerirPermisoAccion("productos", "editar");
  const r = Datos.safeParse(datos);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  const e = validarRegla(r.data.regla as Parameters<typeof validarRegla>[0]);
  if (e) return { error: e };
  try {
    const c = await calcularCambio(db, r.data.filtros, r.data.regla as Parameters<typeof validarRegla>[0]);
    return { ok: true, filas: c.filas.slice(0, 300), omitidos: c.omitidos, total: c.total, cambian: c.filas.length };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo calcular." };
  }
}

export async function aplicarCambioPrecios(datos: unknown): Promise<{ error: string } | { ok: true; cambiados: number }> {
  const ctx = await requerirPermisoAccion("productos", "editar");
  const r = Datos.safeParse(datos);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  const res = await aplicarCambio(ctx.db, ctx.usuario, r.data.filtros, r.data.regla as Parameters<typeof validarRegla>[0]);
  if (!res.ok) return { error: res.error };
  revalidatePath("/productos");
  return { ok: true, cambiados: res.cambiados };
}
