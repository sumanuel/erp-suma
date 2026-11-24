"use server";

import { crearMaestroRapido } from "@/lib/maestros/nucleo";

export type TerceroCreado = { valor: string; etiqueta: string };
export type ResultadoTercero = { error?: string; errores?: Record<string, string>; creado?: TerceroCreado };

const Basicos = ["razonSocial", "documento", "telefono", "direccion"] as const;

/** Crea un cliente o proveedor con lo básico desde la pantalla de un documento. El resto toma los valores iniciales del maestro. */
export async function crearTerceroRapido(tipo: "cliente" | "proveedor", datos: Partial<Record<(typeof Basicos)[number], string>>): Promise<ResultadoTercero> {
  const basicos: Record<string, string> = {};
  for (const k of Basicos) basicos[k] = String(datos[k] ?? "").trim();
  try {
    const r = await crearMaestroRapido(tipo === "cliente" ? "clientes" : "proveedores", basicos);
    if (!r.fila) return { error: r.error, errores: r.errores };
    return { creado: { valor: String(r.fila.id), etiqueta: `${r.fila.razonSocial} (${r.fila.documento})` } };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo crear." };
  }
}

/** Crea un vendedor o un cobrador con lo básico (código, nombre y cédula). */
export async function crearPersonalRapido(rol: "vendedor" | "cobrador", datos: { codigo?: string; nombre?: string; cedula?: string }): Promise<ResultadoTercero> {
  const basicos: Record<string, string> = {
    codigo: String(datos.codigo ?? "").trim(), nombre: String(datos.nombre ?? "").trim(), cedula: String(datos.cedula ?? "").trim(),
    esVendedor: rol === "vendedor" ? "on" : "", esCobrador: rol === "cobrador" ? "on" : "",
  };
  try {
    const r = await crearMaestroRapido("vendedores", basicos);
    if (!r.fila) return { error: r.error, errores: r.errores };
    return { creado: { valor: String(r.fila.id), etiqueta: `${r.fila.nombre} (${r.fila.codigo})` } };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo crear." };
  }
}
