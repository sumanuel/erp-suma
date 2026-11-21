import "server-only";
import type { Db } from "@/lib/tenant";
import { registrarCambio } from "@/lib/auditoria";
import type { Actor } from "@/lib/inventario/movimientos";

export type DatosEmpresa = { rif: string | null; razonSocial: string | null; nombreComercial: string | null; direccion: string | null; telefono: string | null; email: string | null; agenteRetencion: boolean };

/** Guarda los datos de la empresa (una sola fila). El RIF se normaliza a mayúsculas sin espacios; con agente de retención activo el RIF y la razón social son obligatorios. */
export async function guardarEmpresa(db: Db, actor: Actor, d: DatosEmpresa): Promise<{ ok: true } | { ok: false; error: string }> {
  const rif = d.rif ? d.rif.replace(/[\s.]/g, "").toUpperCase() : null;
  if (rif && !/^[JGVEPC]-?\d{8,9}-?\d?$/.test(rif)) return { ok: false, error: "El RIF no parece válido (ejemplo J-12345678-9)." };
  if (d.agenteRetencion && (!rif || !d.razonSocial)) return { ok: false, error: "Un agente de retención necesita el RIF y la razón social." };
  const antes = await db.empresa.findUnique({ where: { id: 1 } });
  const datos = { rif, razonSocial: d.razonSocial, nombreComercial: d.nombreComercial, direccion: d.direccion, telefono: d.telefono, email: d.email, agenteRetencion: d.agenteRetencion };
  await db.empresa.upsert({ where: { id: 1 }, create: { id: 1, ...datos }, update: datos });
  await registrarCambio(db, actor, { modulo: "contabilidad", entidad: "empresa", entidadId: "1", descripcion: "Datos de la empresa", accion: "editar", antes: antes ?? undefined, despues: datos });
  return { ok: true };
}
