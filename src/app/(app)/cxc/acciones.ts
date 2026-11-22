"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requerirPermisoAccion } from "@/lib/dal";
import { anularRetencion, registrarRetencionSufrida } from "@/lib/retenciones/servicio";
import { anularCobro, registrarCobro, registrarRecibo } from "@/lib/cxc/servicio";

export type EstadoCobroForm = { error?: string };

const Cobro = z.object({
  clienteId: z.string().uuid("Elige un cliente"),
  formaPago: z.string().min(1, "Elige la forma de pago").max(30),
  moneda: z.enum(["USD", "VES"]),
  cuentaId: z.string().uuid("Elige la cuenta donde entra el dinero"),
  referencia: z.string().trim().max(100).transform((v) => v || null),
  observaciones: z.string().trim().max(1000).transform((v) => v || null),
  aplicaciones: z.array(z.object({ facturaId: z.string().uuid(), montoUsd: z.number().finite() })).max(200),
});

export async function registrarCobroCliente(datos: unknown): Promise<EstadoCobroForm> {
  const ctx = await requerirPermisoAccion("cxc", "crear");
  const r = Cobro.safeParse(datos);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  const res = await registrarCobro(ctx.db, ctx.usuario, r.data);
  if (!res.ok) return { error: res.error };
  revalidatePath("/cxc");
  revalidatePath("/facturacion");
  redirect(`/cxc/cobros/${res.id}`);
}

export async function anularCobroCliente(id: string, motivo: string): Promise<string | null> {
  const ctx = await requerirPermisoAccion("cxc", "eliminar");
  const r = await anularCobro(ctx.db, ctx.usuario, id, motivo);
  revalidatePath("/cxc");
  revalidatePath(`/cxc/cobros/${id}`);
  revalidatePath("/facturacion");
  return r.ok ? null : r.error;
}

const RetencionSufrida = z.object({
  facturaId: z.string().uuid(),
  tipo: z.enum(["IVA", "ISLR"]),
  porcentaje: z.number().finite("Porcentaje inválido"),
  base: z.number().finite().nullable().optional(),
  concepto: z.string().trim().max(120).nullable().optional(),
  comprobante: z.string().trim().min(1, "Indica el número del comprobante de retención").max(40),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida").transform((s) => new Date(`${s}T00:00:00.000Z`)).refine((d) => !Number.isNaN(d.getTime()), "Fecha inválida"),
});

export async function registrarRetencionCliente(datos: unknown): Promise<{ error?: string }> {
  const ctx = await requerirPermisoAccion("cxc", "crear");
  const r = RetencionSufrida.safeParse(datos);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  const res = await registrarRetencionSufrida(ctx.db, ctx.usuario, r.data);
  if (!res.ok) return { error: res.error };
  revalidatePath("/cxc", "layout");
  revalidatePath("/facturacion", "layout");
  redirect(`/cxc/retenciones/${res.id}`);
}

export async function anularRetencionCliente(id: string, motivo: string): Promise<string | null> {
  const ctx = await requerirPermisoAccion("cxc", "eliminar");
  const r = await anularRetencion(ctx.db, ctx.usuario, id, motivo);
  revalidatePath("/cxc", "layout");
  revalidatePath("/facturacion", "layout");
  return r.ok ? null : r.error;
}

const FechaOpcional = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"), z.literal("")]).transform((v) => (v ? new Date(`${v}T00:00:00.000Z`) : undefined));
const FechaCheque = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha del cheque inválida"), z.literal("")]).transform((v) => (v ? new Date(`${v}T00:00:00.000Z`) : null));
const Recibo = z.object({
  clienteId: z.string().uuid("Elige un cliente"),
  fecha: FechaOpcional,
  cobradorId: z.union([z.string().uuid(), z.literal("")]).transform((v) => v || null),
  numeroComprobante: z.string().trim().max(50).transform((v) => v || null),
  observaciones: z.string().trim().max(1000).transform((v) => v || null),
  pagos: z.array(z.object({
    formaPago: z.string().min(1, "Elige la forma de pago").max(30),
    moneda: z.enum(["USD", "VES"]),
    monto: z.number().finite("Monto inválido"),
    cuentaId: z.string().uuid("Elige la cuenta donde entra el dinero"),
    referencia: z.string().trim().max(100).transform((v) => v || null),
    bancoChequeId: z.union([z.string().uuid(), z.literal("")]).transform((v) => v || null),
    numeroCheque: z.string().trim().max(30).transform((v) => v || null),
    fechaCheque: FechaCheque,
  })).min(1, "Indica al menos una forma de pago").max(10),
  aplicaciones: z.array(z.object({ facturaId: z.string().uuid(), montoUsd: z.number().finite() })).max(200),
});

/** Recibo de ingreso con una o varias formas de pago. */
export async function registrarReciboCliente(datos: unknown): Promise<EstadoCobroForm> {
  const ctx = await requerirPermisoAccion("cxc", "crear");
  const r = Recibo.safeParse(datos);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  const res = await registrarRecibo(ctx.db, ctx.usuario, r.data);
  if (!res.ok) return { error: res.error };
  revalidatePath("/cxc");
  revalidatePath("/facturacion");
  redirect(res.cobros.length === 1 ? `/cxc/cobros/${res.cobros[0].id}` : `/cxc/recibos/${res.id}`);
}
