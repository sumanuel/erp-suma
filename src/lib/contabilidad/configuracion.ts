import "server-only";
import type { Db } from "@/lib/tenant";
import { registrarCambio } from "@/lib/auditoria";
import type { Actor } from "@/lib/inventario/movimientos";
import { CONCEPTOS, LISTA_CONCEPTOS } from "./conceptos";
import type { ResultadoConta } from "./servicio";

export type DatosConfiguracion = {
  automatica: boolean;
  /** concepto → cuenta contable (id). */
  conceptos: Record<string, string>;
  /** cuenta de tesorería (id) → cuenta contable (id) o "" si no tiene. */
  tesoreria: Record<string, string>;
};

/** Guarda la configuración contable. Para activar la contabilización automática deben estar todos los conceptos y todas las cajas/bancos activos asignados. */
export async function guardarConfiguracion(db: Db, actor: Actor, d: DatosConfiguracion): Promise<ResultadoConta> {
  const cuentas = await db.cuentaContable.findMany({ select: { id: true, codigo: true, posteable: true, activo: true } });
  const porId = new Map(cuentas.map((c) => [c.id, c]));
  const valida = (id: string) => {
    const c = porId.get(id);
    return c && c.posteable && c.activo ? null : c ? `La cuenta ${c.codigo} no recibe asientos o está inactiva.` : "Una cuenta elegida no existe.";
  };
  for (const [k, id] of Object.entries(d.conceptos)) {
    if (!(k in CONCEPTOS)) return { ok: false, error: "Concepto desconocido." };
    if (id) { const e = valida(id); if (e) return { ok: false, error: e }; }
  }
  for (const id of Object.values(d.tesoreria)) if (id) { const e = valida(id); if (e) return { ok: false, error: e }; }

  const tes = await db.cuentaTesoreria.findMany({ select: { id: true, codigo: true, activo: true } });
  if (d.automatica) {
    const faltan = LISTA_CONCEPTOS.filter((k) => !d.conceptos[k]).map((k) => CONCEPTOS[k].etiqueta);
    if (faltan.length) return { ok: false, error: `Para activar la contabilización automática asigna una cuenta a: ${faltan.join(", ")}.` };
    const sin = tes.filter((t) => t.activo && !d.tesoreria[t.id]).map((t) => t.codigo);
    if (sin.length) return { ok: false, error: `Asigna una cuenta contable a las cuentas de tesorería: ${sin.join(", ")}.` };
  }
  const antes = await db.configContable.findUnique({ where: { id: 1 } });
  await db.$transaction(async (tx) => {
    await tx.configContable.upsert({ where: { id: 1 }, create: { id: 1, automatica: d.automatica }, update: { automatica: d.automatica } });
    for (const k of LISTA_CONCEPTOS) {
      const id = d.conceptos[k];
      if (id) await tx.cuentaConcepto.upsert({ where: { concepto: k }, create: { concepto: k, cuentaId: id }, update: { cuentaId: id } });
      else await tx.cuentaConcepto.deleteMany({ where: { concepto: k } });
    }
    for (const t of tes) await tx.cuentaTesoreria.update({ where: { id: t.id }, data: { cuentaContableId: d.tesoreria[t.id] || null } });
  });
  await registrarCambio(db, actor, {
    modulo: "contabilidad", entidad: "config_contable", entidadId: "1", descripcion: "Configuración contable", accion: "editar",
    antes: { automatica: antes?.automatica ?? false }, despues: { automatica: d.automatica },
  });
  return { ok: true };
}
