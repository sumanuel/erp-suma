import "server-only";
import { randomUUID } from "node:crypto";
import type { Db } from "@/lib/tenant";

// ÚNICO lugar que modifica `existencia`. Cada cambio de saldo se escribe junto con su línea de kardex en una misma transacción;
// el saldo nunca queda negativo (descuento atómico + restricción en la base). Lo usarán Compras, Facturación y los ajustes.

export const TIPOS_MOVIMIENTO = {
  ENTRADA: { etiqueta: "Entrada", signo: 1 },
  SALIDA: { etiqueta: "Salida", signo: -1 },
  AJUSTE_POSITIVO: { etiqueta: "Ajuste (sobrante)", signo: 1 },
  AJUSTE_NEGATIVO: { etiqueta: "Ajuste (faltante)", signo: -1 },
  TRASLADO_ENTRADA: { etiqueta: "Traslado (entrada)", signo: 1 },
  TRASLADO_SALIDA: { etiqueta: "Traslado (salida)", signo: -1 },
} as const;
export type TipoMovimiento = keyof typeof TIPOS_MOVIMIENTO;

export type Actor = { id: string; nombre: string };
export type Errores = Record<string, string>;
type Resultado = { ok: true } | { ok: false; errores: Errores };

/** Se lanza dentro de una transacción para revertirla entera y devolver los errores al formulario. */
export class MovimientoRechazado extends Error {
  constructor(readonly errores: Errores) {
    super("Movimiento rechazado");
  }
}

async function enTransaccion(db: Db, trabajo: (tx: Tx) => Promise<void>): Promise<Resultado> {
  try {
    await db.$transaction(trabajo);
    return { ok: true };
  } catch (e) {
    if (e instanceof MovimientoRechazado) return { ok: false, errores: e.errores };
    throw e;
  }
}

export type Tx = Parameters<Parameters<Db["$transaction"]>[0]>[0];
const redondear = (n: number) => Math.round(n * 10000) / 10000;
const decimales = (n: number) => (String(n).split(".")[1] ?? "").length;

export type EntradaMovimiento = {
  tipo: Exclude<TipoMovimiento, "TRASLADO_ENTRADA" | "TRASLADO_SALIDA">;
  almacenId: string;
  productoCodigo: string;
  /// Siempre positiva: el signo lo da el tipo.
  cantidad: number;
  /// Solo para entradas: costo unitario en USD. Si falta, se usa el costo promedio actual.
  costoUnitario?: number | null;
  documento?: string | null;
  motivo?: string | null;
};

function validarCantidad(cantidad: number): string | null {
  if (!Number.isFinite(cantidad) || cantidad <= 0) return "La cantidad debe ser mayor que 0.";
  if (decimales(cantidad) > 4) return "Máximo 4 decimales.";
  if (cantidad > 1e12) return "La cantidad es demasiado grande.";
  return null;
}

/** Aplica UN movimiento dentro de una transacción ya abierta. Devuelve errores por campo si no procede (sin tocar nada). */
async function aplicar(
  tx: Tx,
  actor: Actor,
  m: { tipo: TipoMovimiento; almacenId: string; productoCodigo: string; cantidad: number; costoUnitario?: number | null; documento?: string | null; motivo?: string | null; grupo?: string },
): Promise<Errores | null> {
  const { signo } = TIPOS_MOVIMIENTO[m.tipo];
  const producto = await tx.producto.findUnique({ where: { codigo: m.productoCodigo }, select: { activo: true, costoPromedio: true, metodoCosto: true } });
  if (!producto) return { productoCodigo: "No existe un producto con este código." };
  if (!producto.activo) return { productoCodigo: "El producto está inactivo." };
  const almacen = await tx.almacen.findUnique({ where: { id: m.almacenId }, select: { activo: true } });
  if (!almacen || !almacen.activo) return { almacenId: "El almacén no existe o está inactivo." };

  const promedio = Number(producto.costoPromedio);
  const llave = { almacenId_productoCodigo: { almacenId: m.almacenId, productoCodigo: m.productoCodigo } };
  let costo = promedio;

  if (signo > 0) {
    // Costo promedio ponderado con el saldo total de todos los almacenes, antes de sumar esta entrada.
    if (m.tipo === "ENTRADA" && m.costoUnitario != null && m.costoUnitario > 0) {
      const total = Number((await tx.existencia.aggregate({ where: { productoCodigo: m.productoCodigo }, _sum: { cantidad: true } }))._sum.cantidad ?? 0);
      // Con el método «último costo» el costo del producto es el de esta compra; con «promedio», el ponderado con lo que ya había.
      const ponderado = total + m.cantidad > 0 ? (total * promedio + m.cantidad * m.costoUnitario) / (total + m.cantidad) : m.costoUnitario;
      const nuevo = producto.metodoCosto === "ULTIMO" ? m.costoUnitario : ponderado;
      await tx.producto.update({ where: { codigo: m.productoCodigo }, data: { ultimoCosto: m.costoUnitario, costoPromedio: redondear(nuevo) } });
      costo = m.costoUnitario;
    }
    await tx.existencia.upsert({ where: llave, create: { almacenId: m.almacenId, productoCodigo: m.productoCodigo, cantidad: m.cantidad }, update: { cantidad: { increment: m.cantidad } } });
  } else {
    // Descuento atómico: solo si alcanza. Dos salidas simultáneas no pueden dejar el saldo en negativo.
    const r = await tx.existencia.updateMany({
      where: { almacenId: m.almacenId, productoCodigo: m.productoCodigo, cantidad: { gte: m.cantidad } },
      data: { cantidad: { decrement: m.cantidad } },
    });
    if (r.count === 0) {
      const actual = await tx.existencia.findUnique({ where: llave, select: { cantidad: true } });
      return { cantidad: `Existencia insuficiente: hay ${Number(actual?.cantidad ?? 0)} en ese almacén.` };
    }
  }

  const saldo = await tx.existencia.findUniqueOrThrow({ where: llave, select: { cantidad: true } });
  await tx.movimientoInventario.create({
    data: {
      tipo: m.tipo, almacenId: m.almacenId, productoCodigo: m.productoCodigo, cantidad: signo * m.cantidad, costoUnitario: costo,
      saldoDespues: saldo.cantidad, documento: m.documento ?? null, motivo: m.motivo ?? null, grupo: m.grupo ?? null, usuarioId: actor.id, usuarioNombre: actor.nombre,
    },
  });
  return null;
}

export async function registrarMovimiento(db: Db, actor: Actor, m: EntradaMovimiento): Promise<Resultado> {
  const err = validarCantidad(m.cantidad);
  if (err) return { ok: false, errores: { cantidad: err } };
  if (m.costoUnitario != null && (m.costoUnitario < 0 || decimales(m.costoUnitario) > 4)) return { ok: false, errores: { costoUnitario: "Costo inválido (máximo 4 decimales)." } };
  if ((m.tipo === "AJUSTE_POSITIVO" || m.tipo === "AJUSTE_NEGATIVO") && !m.motivo?.trim()) return { ok: false, errores: { motivo: "Todo ajuste necesita un motivo." } };
  return enTransaccion(db, async (tx) => {
    const errores = await aplicar(tx, actor, m);
    if (errores) throw new MovimientoRechazado(errores);
  });
}

export async function trasladar(
  db: Db,
  actor: Actor,
  t: { origenId: string; destinoId: string; productoCodigo: string; cantidad: number; documento?: string | null; motivo?: string | null },
): Promise<Resultado> {
  const err = validarCantidad(t.cantidad);
  if (err) return { ok: false, errores: { cantidad: err } };
  if (t.origenId === t.destinoId) return { ok: false, errores: { almacenDestinoId: "El destino debe ser otro almacén." } };
  const grupo = randomUUID();
  // Las dos líneas van en la misma transacción: o se hace el traslado completo o no se hace nada.
  return enTransaccion(db, async (tx) => {
    const sal = await aplicar(tx, actor, { tipo: "TRASLADO_SALIDA", almacenId: t.origenId, productoCodigo: t.productoCodigo, cantidad: t.cantidad, documento: t.documento, motivo: t.motivo, grupo });
    if (sal) throw new MovimientoRechazado(sal);
    const ent = await aplicar(tx, actor, { tipo: "TRASLADO_ENTRADA", almacenId: t.destinoId, productoCodigo: t.productoCodigo, cantidad: t.cantidad, documento: t.documento, motivo: t.motivo, grupo });
    if (ent) throw new MovimientoRechazado({ almacenDestinoId: Object.values(ent)[0] });
  });
}

/**
 * Para quien ya tiene una transacción abierta (por ejemplo, la recepción de una compra): aplica una entrada o salida dentro de ella.
 * Si no procede lanza `MovimientoRechazado` para que el llamador revierta todo.
 */
export async function aplicarMovimiento(tx: Tx, actor: Actor, m: EntradaMovimiento): Promise<void> {
  const err = validarCantidad(m.cantidad);
  if (err) throw new MovimientoRechazado({ cantidad: err });
  const errores = await aplicar(tx, actor, m);
  if (errores) throw new MovimientoRechazado(errores);
}
