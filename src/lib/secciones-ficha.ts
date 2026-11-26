// Cómo se reparten los campos de una ficha en secciones. La primera es la básica y está siempre a la vista; las demás se abren y se cierran.
import type { CampoForm, Valores } from "@/lib/formularios";

export type Bloque = {
  /// Null en los campos sueltos que van antes del primer título.
  titulo: string | null;
  campos: CampoForm[];
};

/** Un campo con `seccion` distinta a la anterior abre un bloque; los que no la traen siguen en el bloque en curso. */
export function bloquesDe(campos: CampoForm[]): Bloque[] {
  const bloques: Bloque[] = [];
  for (const c of campos) {
    const actual = bloques[bloques.length - 1];
    if (!actual || (c.seccion && c.seccion !== actual.titulo)) bloques.push({ titulo: c.seccion ?? null, campos: [c] });
    else actual.campos.push(c);
  }
  return bloques;
}

const vacio = (v: Valores[string] | undefined) => v === undefined || v === null || v === "" || v === false || v === "0";

/** Para el rótulo de una sección cerrada: cuántos campos tienen algo escrito y cuántos obligatorios siguen vacíos. */
export function resumenBloque(campos: CampoForm[], valores: Valores) {
  return {
    conDatos: campos.filter((c) => !vacio(valores[c.nombre])).length,
    faltan: campos.filter((c) => c.requerido && c.tipo !== "booleano" && String(valores[c.nombre] ?? "") === "").length,
  };
}
