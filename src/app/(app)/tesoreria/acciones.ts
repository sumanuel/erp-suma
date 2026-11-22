"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requerirPermisoAccion } from "@/lib/dal";
import { agregarChequera, cambiarActivaChequera, eliminarChequera } from "@/lib/tesoreria/chequeras";
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
  cuentaContableId: z.union([z.string().uuid(), z.literal("")]).transform((v) => v || null),
  contrapartidaId: z.union([z.string().uuid(), z.literal("")]).transform((v) => v || null),
  permiteSobregiro: z.boolean(),
  activo: z.boolean(),
  bancoId: z.union([z.string().uuid(), z.literal("")]).transform((v) => v || null),
  titular: Texto(100),
  sucursal: Texto(60),
  descripcion: Texto(300),
  tipoCuentaBancaria: z.union([z.enum(["CORRIENTE", "AHORRO"]), z.literal("")]).transform((v) => v || null),
  aceptaDepositos: z.boolean(),
  aceptaPagos: z.boolean(),
  itfPorcentaje: z.number().finite("ITF inválido"),
  itfDesde: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"), z.literal("")]).transform((v) => (v ? new Date(`${v}T00:00:00.000Z`) : null)),
  itfHasta: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"), z.literal("")]).transform((v) => (v ? new Date(`${v}T00:00:00.000Z`) : null)),
  formatoCheque: Texto(100),
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
  const r = Cuenta.pick({ nombre: true, banco: true, numeroCuenta: true, permiteSobregiro: true, activo: true, cuentaContableId: true, bancoId: true, titular: true, sucursal: true, descripcion: true, tipoCuentaBancaria: true, aceptaDepositos: true, aceptaPagos: true, itfPorcentaje: true, itfDesde: true, itfHasta: true, formatoCheque: true }).safeParse(datos);
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
  contrapartidaId: z.union([z.string().uuid(), z.literal("")]).transform((v) => v || null),
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

const Chequera = z.object({ desde: z.number().int("Número inválido").positive(), hasta: z.number().int("Número inválido").positive(), ultimoCheque: z.number().int().nullable(), activa: z.boolean() });

export async function agregarChequeraCuenta(cuentaId: string, datos: unknown): Promise<EstadoTesoreriaForm> {
  const ctx = await requerirPermisoAccion("tesoreria", "editar");
  const r = Chequera.safeParse(datos);
  if (!z.string().uuid().safeParse(cuentaId).success || !r.success) return { error: r.success ? "Cuenta inválida" : (r.error.issues[0]?.message ?? "Datos inválidos") };
  const res = await agregarChequera(ctx.db, ctx.usuario, { cuentaId, ...r.data });
  revalidatePath(`/tesoreria/cuentas/${cuentaId}`);
  return res.ok ? {} : { error: res.error };
}

export async function cambiarChequeraCuenta(cuentaId: string, id: string, activa: boolean): Promise<string | null> {
  const ctx = await requerirPermisoAccion("tesoreria", "editar");
  const res = await cambiarActivaChequera(ctx.db, ctx.usuario, id, activa);
  revalidatePath(`/tesoreria/cuentas/${cuentaId}`);
  return res.ok ? null : res.error;
}

export async function eliminarChequeraCuenta(cuentaId: string, id: string): Promise<string | null> {
  const ctx = await requerirPermisoAccion("tesoreria", "eliminar");
  const res = await eliminarChequera(ctx.db, ctx.usuario, id);
  revalidatePath(`/tesoreria/cuentas/${cuentaId}`);
  return res.ok ? null : res.error;
}
