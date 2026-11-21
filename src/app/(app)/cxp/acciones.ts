"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requerirPermisoAccion } from "@/lib/dal";
import { anularNotaCompra, crearNotaCompra } from "@/lib/notas/servicio";
import { anularFacturaCompra, anularPago, registrarFacturaCompra, registrarPago } from "@/lib/cxp/servicio";

export type EstadoPagoForm = { error?: string };

const Pago = z.object({
  proveedorId: z.string().uuid("Elige un proveedor"),
  formaPago: z.string().min(1, "Elige la forma de pago").max(30),
  moneda: z.enum(["USD", "VES"]),
  cuentaId: z.string().uuid("Elige la cuenta de la que sale el dinero"),
  referencia: z.string().trim().max(100).transform((v) => v || null),
  observaciones: z.string().trim().max(1000).transform((v) => v || null),
  aplicaciones: z.array(z.object({ facturaId: z.string().uuid(), montoUsd: z.number().finite() })).max(200),
});

export async function registrarPagoProveedor(datos: unknown): Promise<EstadoPagoForm> {
  const ctx = await requerirPermisoAccion("cxp", "crear");
  const r = Pago.safeParse(datos);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  const res = await registrarPago(ctx.db, ctx.usuario, r.data);
  if (!res.ok) return { error: res.error };
  revalidatePath("/cxp");
  revalidatePath("/cxp/facturas");
  redirect(`/cxp/pagos/${res.id}`);
}

export async function anularPagoProveedor(id: string, motivo: string): Promise<string | null> {
  const ctx = await requerirPermisoAccion("cxp", "eliminar");
  const r = await anularPago(ctx.db, ctx.usuario, id, motivo);
  revalidatePath("/cxp");
  revalidatePath(`/cxp/pagos/${id}`);
  revalidatePath("/cxp/facturas");
  return r.ok ? null : r.error;
}

export type EstadoFacturaProveedorForm = { error?: string };

const Fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida").transform((v) => new Date(`${v}T00:00:00.000Z`)).refine((d) => !Number.isNaN(d.getTime()), "Fecha inválida");
const FacturaProveedor = z.object({
  proveedorId: z.string().uuid("Elige un proveedor"),
  ordenId: z.union([z.string().uuid(), z.literal("")]).transform((v) => v || null),
  documento: z.string().trim().min(1, "Indica el número de la factura").max(60),
  numeroControl: z.string().trim().max(60).transform((v) => v || null),
  fecha: Fecha,
  diasCredito: z.number().int("Días de crédito inválidos").min(0).max(365),
  subtotal: z.number().finite("Base inválida"),
  iva: z.number().finite("IVA inválido"),
  observaciones: z.string().trim().max(1000).transform((v) => v || null),
});

export async function registrarFacturaProveedor(datos: unknown): Promise<EstadoFacturaProveedorForm> {
  const ctx = await requerirPermisoAccion("cxp", "crear");
  const r = FacturaProveedor.safeParse(datos);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  const res = await registrarFacturaCompra(ctx.db, ctx.usuario, r.data);
  if (!res.ok) return { error: res.error };
  revalidatePath("/cxp");
  revalidatePath("/cxp/facturas");
  redirect(`/cxp/facturas/${res.id}`);
}

export async function anularFacturaProveedor(id: string, motivo: string): Promise<string | null> {
  const ctx = await requerirPermisoAccion("cxp", "eliminar");
  const r = await anularFacturaCompra(ctx.db, ctx.usuario, id, motivo);
  revalidatePath("/cxp");
  revalidatePath("/cxp/facturas");
  revalidatePath(`/cxp/facturas/${id}`);
  return r.ok ? null : r.error;
}

const NotaCompra = z.object({
  tipo: z.enum(["CREDITO", "DEBITO"]),
  facturaId: z.string().uuid(),
  documento: z.string().trim().min(1, "Indica el número de la nota del proveedor").max(60),
  numeroControl: z.string().trim().max(60).transform((v) => v || null),
  fecha: Fecha,
  motivo: z.string().trim().min(3, "Escribe el motivo de la nota").max(300),
  subtotal: z.number().finite("Base inválida"),
  iva: z.number().finite("IVA inválido"),
});

export async function registrarNotaProveedor(datos: unknown): Promise<{ error?: string }> {
  const ctx = await requerirPermisoAccion("cxp", "crear");
  const r = NotaCompra.safeParse(datos);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  const res = await crearNotaCompra(ctx.db, ctx.usuario, r.data);
  if (!res.ok) return { error: res.error };
  revalidatePath("/cxp", "layout");
  redirect(`/cxp/notas/${res.id}`);
}

export async function anularNotaProveedor(id: string, motivo: string): Promise<string | null> {
  const ctx = await requerirPermisoAccion("cxp", "eliminar");
  const r = await anularNotaCompra(ctx.db, ctx.usuario, id, motivo);
  revalidatePath("/cxp", "layout");
  return r.ok ? null : r.error;
}
