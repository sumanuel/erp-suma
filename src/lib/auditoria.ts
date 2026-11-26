import "server-only";
import type { Db } from "./tenant";

export type Accion = "crear" | "editar" | "eliminar" | "otro";
type Actor = { id: string; nombre: string };
type Cambio = {
  modulo: string;
  entidad: string;
  entidadId: string;
  descripcion?: string | null;
  accion: Accion;
  antes?: unknown;
  despues?: unknown;
};

const limpio = (v: unknown) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

/** Deja constancia de un cambio en la base del cliente (auditoria_cambio). Nunca incluya contraseñas ni secretos en antes/despues. */
export async function registrarCambio(db: Db, actor: Actor, c: Cambio) {
  await db.auditoriaCambio.create({
    data: {
      usuarioId: actor.id,
      usuarioNombre: actor.nombre,
      modulo: c.modulo,
      entidad: c.entidad,
      entidadId: c.entidadId,
      descripcion: c.descripcion ?? null,
      accion: c.accion,
      antes: limpio(c.antes),
      despues: limpio(c.despues),
    },
  });
}

type Decimal = { equals(otro: unknown): boolean; toNumber(): number };
const esDecimal = (v: unknown): v is Decimal => typeof v === "object" && v !== null && typeof (v as Decimal).equals === "function" && typeof (v as Decimal).toNumber === "function";

/**
 * ¿Es el mismo valor? La base entrega los decimales como un objeto que se escribe como texto («0») y el formulario manda un número (0):
 * esos se comparan por su valor (con toda su precisión). Lo demás, tal como se guardaría.
 */
function igual(a: unknown, b: unknown): boolean {
  const [decimal, otro] = esDecimal(a) ? [a, b] : esDecimal(b) ? [b, a] : [null, null];
  if (decimal && (esDecimal(otro) || typeof otro === "number" || (typeof otro === "string" && otro.trim() !== "" && Number.isFinite(Number(otro))))) return decimal.equals(otro);
  return JSON.stringify(limpio(a)) === JSON.stringify(limpio(b));
}

/** De dos fotos de un registro, devuelve solo los campos que cambiaron (para que la auditoría muestre lo que importa). */
export function soloCambios(antes: Record<string, unknown>, despues: Record<string, unknown>) {
  const a: Record<string, unknown> = {};
  const d: Record<string, unknown> = {};
  for (const k of new Set([...Object.keys(antes), ...Object.keys(despues)])) {
    if (!igual(antes[k], despues[k])) {
      a[k] = antes[k];
      d[k] = despues[k];
    }
  }
  return { antes: a, despues: d };
}
