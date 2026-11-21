"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requerirPermisoAccion } from "@/lib/dal";
import { anularAsiento, cambiarEstadoPeriodo, crearCuentaContable, editarCuentaContable, eliminarCuentaContable, registrarAsiento } from "@/lib/contabilidad/servicio";

export type EstadoContaForm = { error?: string };

const Cuenta = z.object({
  codigo: z.string().trim().regex(/^[0-9]+(\.[0-9]+)*$/, "El código lleva solo números separados por punto (ejemplo 1.1.01)").max(30),
  nombre: z.string().trim().min(2, "Indica el nombre").max(120),
  tipo: z.union([z.enum(["ACTIVO", "PASIVO", "PATRIMONIO", "INGRESO", "COSTO", "GASTO"]), z.literal("")]).transform((v) => v || null),
  padreId: z.union([z.string().uuid(), z.literal("")]).transform((v) => v || null),
  posteable: z.boolean(),
  activo: z.boolean(),
});

export async function crearCuenta(datos: unknown): Promise<EstadoContaForm> {
  const ctx = await requerirPermisoAccion("contabilidad", "crear");
  const r = Cuenta.safeParse(datos);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  const res = await crearCuentaContable(ctx.db, ctx.usuario, r.data);
  if (!res.ok) return { error: res.error };
  revalidatePath("/contabilidad");
  redirect("/contabilidad");
}

export async function editarCuenta(id: string, datos: unknown): Promise<EstadoContaForm> {
  const ctx = await requerirPermisoAccion("contabilidad", "editar");
  const r = Cuenta.pick({ nombre: true, posteable: true, activo: true }).safeParse(datos);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  const res = await editarCuentaContable(ctx.db, ctx.usuario, id, r.data);
  if (!res.ok) return { error: res.error };
  revalidatePath("/contabilidad");
  redirect("/contabilidad");
}

export async function eliminarCuenta(id: string): Promise<string | null> {
  const ctx = await requerirPermisoAccion("contabilidad", "eliminar");
  const r = await eliminarCuentaContable(ctx.db, ctx.usuario, id);
  revalidatePath("/contabilidad");
  return r.ok ? null : r.error;
}

const Fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida").transform((s) => new Date(`${s}T00:00:00.000Z`)).refine((d) => !Number.isNaN(d.getTime()), "Fecha inválida");
const Asiento = z.object({
  fecha: Fecha,
  descripcion: z.string().trim().min(3, "Escribe la descripción del asiento").max(300),
  referencia: z.string().trim().max(60).transform((v) => v || null),
  lineas: z.array(z.object({ cuentaId: z.string().uuid("Elige la cuenta de cada línea"), descripcion: z.string().trim().max(200).transform((v) => v || null), debe: z.number().finite(), haber: z.number().finite() })).max(300),
});

export async function registrarAsientoManual(datos: unknown): Promise<EstadoContaForm> {
  const ctx = await requerirPermisoAccion("contabilidad", "crear");
  const r = Asiento.safeParse(datos);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  const res = await registrarAsiento(ctx.db, ctx.usuario, r.data);
  if (!res.ok) return { error: res.error };
  revalidatePath("/contabilidad/asientos");
  redirect(`/contabilidad/asientos/${res.id}`);
}

export async function anularAsientoContable(id: string, motivo: string): Promise<string | null> {
  const ctx = await requerirPermisoAccion("contabilidad", "eliminar");
  const r = await anularAsiento(ctx.db, ctx.usuario, id, motivo);
  revalidatePath("/contabilidad", "layout");
  return r.ok ? null : r.error;
}

export async function cambiarPeriodo(anio: number, mes: number, cerrar: boolean): Promise<string | null> {
  const ctx = await requerirPermisoAccion("contabilidad", "editar");
  const r = await cambiarEstadoPeriodo(ctx.db, ctx.usuario, anio, mes, cerrar);
  revalidatePath("/contabilidad/periodos");
  return r.ok ? null : r.error;
}
