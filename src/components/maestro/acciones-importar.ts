"use server";

import { revalidatePath } from "next/cache";
import { requerirPermisoAccion } from "@/lib/dal";
import { camposDe } from "@/lib/maestros/nucleo";
import { importarMaestro, plantillaMaestro, type ResultadoImportacion } from "@/lib/maestros/importacion";
import { buscarMaestro } from "@/lib/maestros/registro";

const MAX_BYTES = 5 * 1024 * 1024;

async function preparar(id: string) {
  const m = buscarMaestro(id);
  if (!m || m.soloConsulta || !m.importable) throw new Error("Este listado no admite la carga desde Excel.");
  const ctx = await requerirPermisoAccion(m.modulo, "crear");
  return { m, ctx, campos: await camposDe(m, ctx.db) };
}

const sinArchivo = (error: string): ResultadoImportacion => ({ error, total: 0, validas: 0, confirmada: false, ignoradas: [], filas: [] });

/** Valida el archivo (`confirmar` = false: nada se guarda) o lo importa (`confirmar` = true: se guarda solo si todas las filas son válidas). */
export async function procesarImportacion(id: string, confirmar: boolean, form: FormData): Promise<ResultadoImportacion> {
  const archivo = form.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return sinArchivo("Elige el archivo de Excel (.xlsx).");
  if (archivo.size > MAX_BYTES) return sinArchivo("El archivo pesa más de 5 MB.");
  const { m, ctx, campos } = await preparar(id);
  const r = await importarMaestro(m, ctx.db, ctx.usuario, campos, Buffer.from(await archivo.arrayBuffer()), confirmar);
  if (r.confirmada) {
    revalidatePath(m.ruta);
    revalidatePath(m.ruta, "layout");
  }
  return r;
}

/** Plantilla de Excel del maestro, en base64 para que el navegador la descargue. */
export async function descargarPlantilla(id: string): Promise<{ nombre: string; base64: string }> {
  const { m, campos } = await preparar(id);
  const buf = await plantillaMaestro(m, campos);
  return { nombre: `plantilla-${m.plural.replace(/\s+/g, "-")}.xlsx`, base64: buf.toString("base64") };
}
