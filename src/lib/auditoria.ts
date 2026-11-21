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

/** De dos fotos de un registro, devuelve solo los campos que cambiaron (para que la auditoría muestre lo que importa). */
export function soloCambios(antes: Record<string, unknown>, despues: Record<string, unknown>) {
  const a: Record<string, unknown> = {};
  const d: Record<string, unknown> = {};
  for (const k of new Set([...Object.keys(antes), ...Object.keys(despues)])) {
    if (JSON.stringify(limpio(antes[k])) !== JSON.stringify(limpio(despues[k]))) {
      a[k] = antes[k];
      d[k] = despues[k];
    }
  }
  return { antes: a, despues: d };
}
