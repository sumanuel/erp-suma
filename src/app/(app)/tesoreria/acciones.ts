"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requerirPermisoAccion } from "@/lib/dal";
import { conciliar, crearCuenta, editarCuenta, registrarMovimientoManual, transferir } from "@/lib/tesoreria/movimientos";

export type EstadoTesoreriaForm = { error?: string };

const Texto = (max: number) => z.string().trim().max(max).transform((v) => v || null);
const Cuenta = z.object({
  codigo: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,20}$/, "Código de 2 a 20 letras, números, guion o guion bajo"),
  nombre: z.string().trim().min(2, "Indica el nombre").max(100),
  tipo: z.enum(["CAJA", "BANCO"]),
  moneda: z.enum(["USD", "VES"]),
  banco: Texto(80),
  numeroCuenta: Texto(40),
  saldoInicial: z.number().finite("Saldo inicial inválido"),
  permiteSobregiro: z.boolean(),
  activo: z.boolean(),
});

export async function crearCuentaTesoreria(datos: unknown): Promise<EstadoTesoreriaForm> {
  const ctx = await requerirPermisoAccion("tesoreria", "crear");
  const r = Cuenta.safeParse(datos);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  const res = await crearCuenta(ctx.db, ctx.usuario, r.data);
  if (!res.ok) return { error: res.error };
  revalidatePath("/tesoreria");
  redirect(`/tesoreria/cuentas/${res.id}`);
}

export async function editarCuentaTesoreria(id: string, datos: unknown): Promise<EstadoTesoreriaForm> {
  const ctx = await requerirPermisoAccion("tesoreria", "editar");
  const r = Cuenta.pick({ nombre: true, banco: true, numeroCuenta: true, permiteSobregiro: true, activo: true }).safeParse(datos);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  const res = await editarCuenta(ctx.db, ctx.usuario, id, r.data);
  if (!res.ok) return { error: res.error };
  revalidatePath("/tesoreria");
  redirect(`/tesoreria/cuentas/${id}`);
}

const Manual = z.object({
  cuentaId: z.string().uuid("Elige la cuenta"),
  tipo: z.enum(["INGRESO", "EGRESO"]),
  monto: z.number().finite("Monto inválido"),
  descripcion: z.string().trim().min(3, "Indica el concepto").max(200),
  documento: Texto(60),
});

export async function registrarMovimientoCuenta(datos: unknown): Promise<EstadoTesoreriaForm> {
  const ctx = await requerirPermisoAccion("tesoreria", "crear");
  const r = Manual.safeParse(datos);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  const res = await registrarMovimientoManual(ctx.db, ctx.usuario, r.data);
  if (!res.ok) return { error: res.error };
  revalidatePath("/tesoreria");
  redirect(`/tesoreria/cuentas/${r.data.cuentaId}`);
}

const Transferencia = z.object({
  origenId: z.string().uuid("Elige la cuenta de origen"),
  destinoId: z.string().uuid("Elige la cuenta de destino"),
  monto: z.number().finite("Monto inválido"),
  descripcion: Texto(200),
});

export async function transferirEntreCuentas(datos: unknown): Promise<EstadoTesoreriaForm> {
  const ctx = await requerirPermisoAccion("tesoreria", "crear");
  const r = Transferencia.safeParse(datos);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  const res = await transferir(ctx.db, ctx.usuario, r.data);
  if (!res.ok) return { error: res.error };
  revalidatePath("/tesoreria");
  redirect(`/tesoreria/cuentas/${r.data.origenId}`);
}

export async function conciliarMovimiento(cuentaId: string, movimientoId: string, valor: boolean): Promise<string | null> {
  const ctx = await requerirPermisoAccion("tesoreria", "editar");
  if (!/^\d{1,18}$/.test(movimientoId)) return "Movimiento inválido.";
  const r = await conciliar(ctx.db, ctx.usuario, BigInt(movimientoId), valor);
  revalidatePath(`/tesoreria/cuentas/${cuentaId}`);
  return r.ok ? null : r.error;
}
