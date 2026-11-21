"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requerirPermisoAccion } from "@/lib/dal";
import { anularCobro, registrarCobro } from "@/lib/cxc/servicio";

export type EstadoCobroForm = { error?: string };

const Cobro = z.object({
  clienteId: z.string().uuid("Elige un cliente"),
  formaPago: z.string().min(1, "Elige la forma de pago").max(30),
  moneda: z.enum(["USD", "VES"]),
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
