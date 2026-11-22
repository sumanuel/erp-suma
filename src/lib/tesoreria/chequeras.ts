import "server-only";
import type { Db } from "@/lib/tenant";
import { registrarCambio } from "@/lib/auditoria";
import type { Actor, Tx } from "@/lib/inventario/movimientos";
import { esViolacionUnica } from "@/lib/formularios";
import { TesoreriaRechazada, type ResultadoTesoreria } from "./movimientos";

// Chequeras: rango de numeración de los talonarios de una cuenta. Una sola activa por cuenta; al pagar con cheque se toma el siguiente número de la activa.

async function ejecutar<T>(trabajo: () => Promise<ResultadoTesoreria<T>>): Promise<ResultadoTesoreria<T>> {
  try {
    return await trabajo();
  } catch (e) {
    if (e instanceof TesoreriaRechazada) return { ok: false, error: e.message };
    if (esViolacionUnica(e)) return { ok: false, error: "La cuenta ya tiene otra chequera activa: desactívala primero." };
    throw e;
  }
}
const entero = (n: number) => Number.isInteger(n) && n > 0 && n < 2_000_000_000;

export async function agregarChequera(db: Db, actor: Actor, d: { cuentaId: string; desde: number; hasta: number; ultimoCheque: number | null; activa: boolean }): Promise<ResultadoTesoreria<{ id: string }>> {
  return ejecutar(async () => {
    if (!entero(d.desde) || !entero(d.hasta) || d.hasta < d.desde) throw new TesoreriaRechazada("El rango debe ser de enteros positivos y «hasta» no puede ser menor que «desde».");
    const ultimo = d.ultimoCheque ?? d.desde - 1;
    if (!Number.isInteger(ultimo) || ultimo < d.desde - 1 || ultimo > d.hasta) throw new TesoreriaRechazada("El último cheque usado debe estar dentro del rango (o ser el anterior al primero).");
    const c = await db.$transaction(async (tx) => {
      const cuenta = await tx.cuentaTesoreria.findUnique({ where: { id: d.cuentaId }, select: { tipo: true, codigo: true } });
      if (!cuenta) throw new TesoreriaRechazada("La cuenta no existe.");
      if (cuenta.tipo !== "BANCO") throw new TesoreriaRechazada("Solo las cuentas de banco tienen chequeras.");
      // Los rangos de una misma cuenta no pueden solaparse.
      const solapa = await tx.chequera.findFirst({ where: { cuentaId: d.cuentaId, desde: { lte: d.hasta }, hasta: { gte: d.desde } }, select: { desde: true, hasta: true } });
      if (solapa) throw new TesoreriaRechazada(`El rango se cruza con la chequera ${solapa.desde}–${solapa.hasta}.`);
      return tx.chequera.create({ data: { cuentaId: d.cuentaId, desde: d.desde, hasta: d.hasta, ultimoCheque: ultimo, activa: d.activa }, select: { id: true } });
    });
    await registrarCambio(db, actor, { modulo: "tesoreria", entidad: "chequera", entidadId: c.id, descripcion: `${d.desde}–${d.hasta}`, accion: "crear", despues: { cuentaId: d.cuentaId, activa: d.activa } });
    return { ok: true, id: c.id };
  });
}

/** Activa una chequera (y desactiva la que estaba activa) o la desactiva. */
export async function cambiarActivaChequera(db: Db, actor: Actor, id: string, activa: boolean): Promise<ResultadoTesoreria> {
  return ejecutar(async () => {
    await db.$transaction(async (tx) => {
      const c = await tx.chequera.findUnique({ where: { id } });
      if (!c) throw new TesoreriaRechazada("La chequera no existe.");
      if (activa && c.ultimoCheque >= c.hasta) throw new TesoreriaRechazada("La chequera está agotada.");
      if (activa) await tx.chequera.updateMany({ where: { cuentaId: c.cuentaId, activa: true, id: { not: id } }, data: { activa: false } });
      await tx.chequera.update({ where: { id }, data: { activa } });
    });
    await registrarCambio(db, actor, { modulo: "tesoreria", entidad: "chequera", entidadId: id, descripcion: activa ? "Activada" : "Desactivada", accion: "otro", despues: { activa } });
    return { ok: true };
  });
}

/** Una chequera sin cheques usados se puede borrar; con cheques emitidos se conserva (solo se desactiva). */
export async function eliminarChequera(db: Db, actor: Actor, id: string): Promise<ResultadoTesoreria> {
  return ejecutar(async () => {
    const c = await db.chequera.findUnique({ where: { id } });
    if (!c) throw new TesoreriaRechazada("La chequera no existe.");
    if (c.ultimoCheque >= c.desde) throw new TesoreriaRechazada("Ya se usaron cheques de esta chequera: no se puede eliminar, solo desactivarla.");
    await db.chequera.delete({ where: { id } });
    await registrarCambio(db, actor, { modulo: "tesoreria", entidad: "chequera", entidadId: id, descripcion: `${c.desde}–${c.hasta}`, accion: "eliminar", antes: { cuentaId: c.cuentaId } });
    return { ok: true };
  });
}

/**
 * Toma el siguiente número de la chequera activa de la cuenta, de forma atómica (dos pagos simultáneos no obtienen el mismo número ni se pasan del rango: la condición se vuelve a evaluar sobre la fila ya actualizada).
 * Devuelve null si la cuenta no tiene chequera activa con cheques disponibles.
 */
export async function siguienteCheque(tx: Tx, cuentaId: string): Promise<{ numero: number; chequeraId: string } | null> {
  const filas = await tx.$queryRaw<{ id: string; ultimo_cheque: number }[]>`
    UPDATE chequera SET ultimo_cheque = ultimo_cheque + 1
    WHERE id = (SELECT id FROM chequera WHERE cuenta_id = ${cuentaId}::uuid AND activa AND ultimo_cheque < hasta LIMIT 1) AND ultimo_cheque < hasta
    RETURNING id, ultimo_cheque`;
  return filas[0] ? { numero: filas[0].ultimo_cheque, chequeraId: filas[0].id } : null;
}
