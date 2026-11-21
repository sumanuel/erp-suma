import type { Tono } from "@/components/ui";
import type { Fila } from "./tipos";

export const etiquetaActivo = (v: unknown): { texto: string; tono: Tono } =>
  v === false ? { texto: "Inactivo", tono: "neutro" } : { texto: "Activo", tono: "exito" };

export const filtroActivo = {
  id: "estado",
  etiqueta: "Estado",
  todos: "Activos e inactivos",
  opciones: [
    { valor: "activos", etiqueta: "Solo activos", donde: { activo: true } },
    { valor: "inactivos", etiqueta: "Solo inactivos", donde: { activo: false } },
  ],
};

/** Valida que cada campo numérico listado esté entre 0 y el máximo (porcentajes: 100). */
export function rangoPorcentaje(datos: Fila, campos: string[], max = 100): Record<string, string> {
  const errores: Record<string, string> = {};
  for (const c of campos) {
    const v = datos[c];
    if (typeof v === "number" && (v < 0 || v > max)) errores[c] = `Debe estar entre 0 y ${max}.`;
  }
  return errores;
}

export function noNegativos(datos: Fila, campos: string[]): Record<string, string> {
  const errores: Record<string, string> = {};
  for (const c of campos) {
    const v = datos[c];
    if (typeof v === "number" && v < 0) errores[c] = "No puede ser negativo.";
  }
  return errores;
}

export const conErrores = (...grupos: Record<string, string>[]) => {
  const todos = Object.assign({}, ...grupos) as Record<string, string>;
  return Object.keys(todos).length ? todos : null;
};
