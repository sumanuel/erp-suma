"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requerirPermisoAccion, tienePermiso, tienePermisoEspecial } from "@/lib/dal";
import { abrirTurno, cerrarTurno, registrarVentaPos } from "@/lib/pos/servicio";
import { buscarProductosVenta, type ProductoVenta } from "@/lib/pedidos/servicio";

export type RespuestaVenta =
  | { error: string }
  | { ok: true; id: string; numero: number; facturaNumero: number; totalUsd: number; totalBs: number; vueltoMoneda: string | null; vueltoMonto: number };

const uuid = z.string().uuid();
const monto = z.number().finite().min(0).max(1e12);

const Apertura = z.object({ almacenId: uuid, cajaVesId: uuid, cajaUsdId: uuid, fondoVes: monto, fondoUsd: monto });

export async function abrirTurnoCaja(datos: unknown): Promise<{ error?: string }> {
  const ctx = await requerirPermisoAccion("pos", "crear");
  const r = Apertura.safeParse(datos);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  const res = await abrirTurno(ctx.db, ctx.usuario, r.data);
  if (!res.ok) return { error: res.error };
  revalidatePath("/pos");
  return {};
}

export async function buscarProductosPos(texto: string, lista = "A"): Promise<ProductoVenta[]> {
  const { db } = await requerirPermisoAccion("pos", "crear");
  return buscarProductosVenta(db, texto, lista);
}

const Venta = z.object({
  turnoId: uuid,
  clienteId: uuid.nullable(),
  monedaVuelto: z.enum(["USD", "VES"]).optional(),
  lineas: z.array(z.object({ productoCodigo: z.string().min(1).max(60), cantidad: z.number().finite(), precioUnitario: z.number().finite(), descuento: z.number().finite() })).min(1, "Agrega al menos un producto").max(200),
  pagos: z.array(z.object({ formaPago: z.string(), moneda: z.string(), recibido: z.number().finite(), cuentaId: uuid.nullable().optional(), referencia: z.string().trim().max(60).nullable().optional() })).min(1, "Indica cómo paga el cliente").max(10),
});

export async function cobrarVentaPos(datos: unknown): Promise<RespuestaVenta> {
  const ctx = await requerirPermisoAccion("pos", "crear");
  const r = Venta.safeParse(datos);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  const res = await registrarVentaPos(ctx.db, ctx.usuario, { ...r.data, sinCambiarPrecio: !tienePermisoEspecial(ctx, "ventas.cambiar_precio") });
  if (!res.ok) return { error: res.error };
  revalidatePath("/pos");
  revalidatePath("/existencias");
  revalidatePath("/facturacion");
  return { ok: true, id: res.id, numero: res.numero, facturaNumero: res.facturaNumero, totalUsd: res.totalUsd, totalBs: res.totalBs, vueltoMoneda: res.vueltoMoneda, vueltoMonto: res.vueltoMonto };
}

const Cierre = z.object({ contadoVes: monto, contadoUsd: monto, observaciones: z.string().trim().max(500).nullable() });

export async function cerrarTurnoCaja(id: string, datos: unknown): Promise<{ error?: string }> {
  const ctx = await requerirPermisoAccion("pos", "crear");
  const r = Cierre.safeParse(datos);
  if (!r.success || !uuid.safeParse(id).success) return { error: "Datos inválidos" };
  const res = await cerrarTurno(ctx.db, ctx.usuario, id, r.data, tienePermiso(ctx, "pos", "editar"));
  if (!res.ok) return { error: res.error };
  revalidatePath("/pos");
  revalidatePath(`/pos/turnos/${id}`);
  return {};
}
