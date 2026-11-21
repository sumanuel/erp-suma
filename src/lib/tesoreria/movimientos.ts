import "server-only";
import { randomUUID } from "node:crypto";
import type { Db } from "@/lib/tenant";
import { registrarCambio } from "@/lib/auditoria";
import type { Actor, Tx } from "@/lib/inventario/movimientos";
import { TIPOS_MOVIMIENTO_TESORERIA, type TipoMovimientoTesoreria } from "./tipos";

// ÚNICO lugar que modifica el saldo de una cuenta. Cada cambio se escribe junto con su línea del libro en la misma transacción, con descuento atómico:
// un egreso solo procede si la cuenta tiene saldo (o permite sobregiro), así dos egresos simultáneos no pueden dejarla en negativo.

export class TesoreriaRechazada extends Error {}
export type ResultadoTesoreria<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const decimales = (n: number) => (String(n).split(".")[1] ?? "").length;

export function validarMonto(monto: number): string | null {
  if (!Number.isFinite(monto) || monto <= 0) return "El monto debe ser mayor que 0.";
  if (decimales(monto) > 2) return "El monto admite máximo 2 decimales.";
  if (monto > 1e12) return "El monto es demasiado grande.";
  return null;
}

/** Aplica UN movimiento a una cuenta dentro de una transacción abierta. Lanza `TesoreriaRechazada` si no procede (para revertir todo). `monto` siempre positivo. */
export async function aplicarMovimientoCuenta(
  tx: Tx,
  actor: Actor,
  m: { cuentaId: string; tipo: TipoMovimientoTesoreria; monto: number; documento?: string | null; descripcion?: string | null; grupo?: string | null },
): Promise<void> {
  const err = validarMonto(m.monto);
  if (err) throw new TesoreriaRechazada(err);
  const { signo, anulacion } = TIPOS_MOVIMIENTO_TESORERIA[m.tipo];
  const cuenta = await tx.cuentaTesoreria.findUnique({ where: { id: m.cuentaId }, select: { codigo: true, activo: true } });
  if (!cuenta) throw new TesoreriaRechazada("La cuenta no existe.");
  // Una cuenta inactiva no recibe operaciones nuevas, pero sí las anulaciones (para poder revertir lo que ya se hizo).
  if (!cuenta.activo && !anulacion && m.tipo !== "SALDO_INICIAL") throw new TesoreriaRechazada(`La cuenta ${cuenta.codigo} está inactiva.`);

  if (signo > 0) {
    await tx.cuentaTesoreria.update({ where: { id: m.cuentaId }, data: { saldo: { increment: m.monto } } });
  } else {
    const r = await tx.cuentaTesoreria.updateMany({
      where: { id: m.cuentaId, OR: [{ permiteSobregiro: true }, { saldo: { gte: m.monto } }] },
      data: { saldo: { decrement: m.monto } },
    });
    if (r.count === 0) {
      const c = await tx.cuentaTesoreria.findUniqueOrThrow({ where: { id: m.cuentaId }, select: { saldo: true } });
      throw new TesoreriaRechazada(`Saldo insuficiente en ${cuenta.codigo}: hay ${Number(c.saldo).toLocaleString("es-VE", { minimumFractionDigits: 2 })}.`);
    }
  }
  const { saldo } = await tx.cuentaTesoreria.findUniqueOrThrow({ where: { id: m.cuentaId }, select: { saldo: true } });
  await tx.movimientoTesoreria.create({
    data: {
      cuentaId: m.cuentaId, tipo: m.tipo, monto: signo * m.monto, saldoDespues: saldo, documento: m.documento ?? null, descripcion: m.descripcion ?? null,
      grupo: m.grupo ?? null, usuarioId: actor.id, usuarioNombre: actor.nombre,
    },
  });
}

async function ejecutar<T>(trabajo: () => Promise<ResultadoTesoreria<T>>): Promise<ResultadoTesoreria<T>> {
  try {
    return await trabajo();
  } catch (e) {
    if (e instanceof TesoreriaRechazada) return { ok: false, error: e.message };
    throw e;
  }
}

export type DatosCuenta = { codigo: string; nombre: string; tipo: string; moneda: string; banco: string | null; numeroCuenta: string | null; saldoInicial: number; permiteSobregiro: boolean; activo: boolean };

export async function crearCuenta(db: Db, actor: Actor, d: DatosCuenta): Promise<ResultadoTesoreria<{ id: string }>> {
  return ejecutar(async () => {
    if (d.tipo !== "CAJA" && d.tipo !== "BANCO") throw new TesoreriaRechazada("Tipo de cuenta inválido.");
    if (d.moneda !== "USD" && d.moneda !== "VES") throw new TesoreriaRechazada("Moneda inválida.");
    if (!Number.isFinite(d.saldoInicial) || d.saldoInicial < 0 || decimales(d.saldoInicial) > 2 || d.saldoInicial > 1e12) throw new TesoreriaRechazada("Saldo inicial inválido (hasta 2 decimales).");
    const id = await db.$transaction(async (tx) => {
      if (await tx.cuentaTesoreria.findUnique({ where: { codigo: d.codigo }, select: { id: true } })) throw new TesoreriaRechazada("Ya existe una cuenta con ese código.");
      const c = await tx.cuentaTesoreria.create({ data: { codigo: d.codigo, nombre: d.nombre, tipo: d.tipo, moneda: d.moneda, banco: d.banco, numeroCuenta: d.numeroCuenta, permiteSobregiro: d.permiteSobregiro, activo: d.activo }, select: { id: true } });
      if (d.saldoInicial > 0) await aplicarMovimientoCuenta(tx, actor, { cuentaId: c.id, tipo: "SALDO_INICIAL", monto: d.saldoInicial, descripcion: "Saldo inicial" });
      return c.id;
    });
    await registrarCambio(db, actor, { modulo: "tesoreria", entidad: "cuenta_tesoreria", entidadId: id, descripcion: d.codigo, accion: "crear", despues: { nombre: d.nombre, tipo: d.tipo, moneda: d.moneda, saldoInicial: d.saldoInicial } });
    return { ok: true, id };
  });
}

/** Edita los datos de la cuenta. La moneda y el saldo no se tocan: el saldo solo cambia con movimientos. */
export async function editarCuenta(db: Db, actor: Actor, id: string, d: Pick<DatosCuenta, "nombre" | "banco" | "numeroCuenta" | "permiteSobregiro" | "activo">): Promise<ResultadoTesoreria> {
  return ejecutar(async () => {
    const antes = await db.cuentaTesoreria.findUnique({ where: { id } });
    if (!antes) throw new TesoreriaRechazada("La cuenta ya no existe.");
    if (!d.permiteSobregiro && Number(antes.saldo) < 0) throw new TesoreriaRechazada("La cuenta tiene saldo negativo: no se puede quitar el sobregiro.");
    await db.cuentaTesoreria.update({ where: { id }, data: d });
    await registrarCambio(db, actor, {
      modulo: "tesoreria", entidad: "cuenta_tesoreria", entidadId: id, descripcion: antes.codigo, accion: "editar",
      antes: { nombre: antes.nombre, banco: antes.banco, numeroCuenta: antes.numeroCuenta, permiteSobregiro: antes.permiteSobregiro, activo: antes.activo }, despues: d,
    });
    return { ok: true };
  });
}

/** Ingreso o egreso manual (depósito, retiro, gasto bancario…). El motivo es obligatorio: queda en el libro. */
export async function registrarMovimientoManual(db: Db, actor: Actor, d: { cuentaId: string; tipo: string; monto: number; descripcion: string; documento: string | null }): Promise<ResultadoTesoreria> {
  return ejecutar(async () => {
    if (d.tipo !== "INGRESO" && d.tipo !== "EGRESO") throw new TesoreriaRechazada("Tipo de movimiento inválido.");
    if (d.descripcion.trim().length < 3) throw new TesoreriaRechazada("Indica el concepto del movimiento.");
    await db.$transaction((tx) => aplicarMovimientoCuenta(tx, actor, { cuentaId: d.cuentaId, tipo: d.tipo as TipoMovimientoTesoreria, monto: d.monto, descripcion: d.descripcion.trim(), documento: d.documento }));
    await registrarCambio(db, actor, { modulo: "tesoreria", entidad: "movimiento_tesoreria", entidadId: d.cuentaId, descripcion: d.descripcion.trim(), accion: "otro", despues: { operacion: d.tipo, monto: d.monto } });
    return { ok: true };
  });
}

/** Transferencia entre dos cuentas de la misma moneda: las dos líneas van en una transacción. Cambiar de moneda es otra operación (aún no incluida). */
export async function transferir(db: Db, actor: Actor, d: { origenId: string; destinoId: string; monto: number; descripcion: string | null }): Promise<ResultadoTesoreria> {
  return ejecutar(async () => {
    if (d.origenId === d.destinoId) throw new TesoreriaRechazada("El destino debe ser otra cuenta.");
    const grupo = randomUUID();
    await db.$transaction(async (tx) => {
      const [o, de] = await Promise.all([
        tx.cuentaTesoreria.findUnique({ where: { id: d.origenId }, select: { codigo: true, moneda: true } }),
        tx.cuentaTesoreria.findUnique({ where: { id: d.destinoId }, select: { codigo: true, moneda: true } }),
      ]);
      if (!o || !de) throw new TesoreriaRechazada("Una de las cuentas no existe.");
      if (o.moneda !== de.moneda) throw new TesoreriaRechazada("Las cuentas deben ser de la misma moneda (el cambio de divisas aún no está disponible).");
      const texto = d.descripcion?.trim() || "Transferencia entre cuentas";
      await aplicarMovimientoCuenta(tx, actor, { cuentaId: d.origenId, tipo: "TRANSFERENCIA_SALIDA", monto: d.monto, descripcion: `${texto} → ${de.codigo}`, grupo });
      await aplicarMovimientoCuenta(tx, actor, { cuentaId: d.destinoId, tipo: "TRANSFERENCIA_ENTRADA", monto: d.monto, descripcion: `${texto} ← ${o.codigo}`, grupo });
    });
    await registrarCambio(db, actor, { modulo: "tesoreria", entidad: "movimiento_tesoreria", entidadId: d.origenId, descripcion: "Transferencia", accion: "otro", despues: { origenId: d.origenId, destinoId: d.destinoId, monto: d.monto } });
    return { ok: true };
  });
}

/** Marca o desmarca un movimiento como conciliado con el estado de cuenta del banco. */
export async function conciliar(db: Db, actor: Actor, movimientoId: bigint, conciliado: boolean): Promise<ResultadoTesoreria> {
  return ejecutar(async () => {
    const r = await db.movimientoTesoreria.updateMany({ where: { id: movimientoId, conciliado: !conciliado }, data: { conciliado, conciliadoEn: conciliado ? new Date() : null } });
    if (r.count === 0) throw new TesoreriaRechazada("El movimiento ya estaba en ese estado. Recarga la página.");
    await registrarCambio(db, actor, { modulo: "tesoreria", entidad: "movimiento_tesoreria", entidadId: String(movimientoId), accion: "otro", despues: { conciliado } });
    return { ok: true };
  });
}
