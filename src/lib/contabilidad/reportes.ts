import "server-only";
import type { Db } from "@/lib/tenant";
import { TIPOS_CUENTA_CONTABLE, type TipoCuentaContable } from "./tipos";

// Reportes contables. Solo cuentan los asientos REGISTRADOS (los anulados quedan en el historial pero no suman). Los montos se llevan en centavos
// enteros para que las sumas cuadren exactamente.
const cent = (n: unknown) => Math.round(Number(n ?? 0) * 100);

export type FilaBalance = {
  id: string; codigo: string; nombre: string; tipo: TipoCuentaContable; nivel: number; posteable: boolean;
  /** Todo en centavos. saldoInicial/saldoFinal = debe − haber (positivo = deudor). */
  saldoInicial: number; debe: number; haber: number; saldoFinal: number;
};

/** Balance de comprobación del rango [desde, hasta]. Las cuentas de agrupación suman a sus hijas. */
export async function balanceComprobacion(db: Db, desde: Date, hasta: Date) {
  const [cuentas, previos, periodo] = await Promise.all([
    db.cuentaContable.findMany({ orderBy: { codigo: "asc" } }),
    db.asientoLinea.groupBy({ by: ["cuentaId"], where: { asiento: { estado: "REGISTRADO", fecha: { lt: desde } } }, _sum: { debe: true, haber: true } }),
    db.asientoLinea.groupBy({ by: ["cuentaId"], where: { asiento: { estado: "REGISTRADO", fecha: { gte: desde, lte: hasta } } }, _sum: { debe: true, haber: true } }),
  ]);
  const ini = new Map(previos.map((p) => [p.cuentaId, cent(p._sum.debe) - cent(p._sum.haber)]));
  const mov = new Map(periodo.map((p) => [p.cuentaId, { debe: cent(p._sum.debe), haber: cent(p._sum.haber) }]));
  const filas = new Map<string, FilaBalance>(cuentas.map((c) => [c.id, { id: c.id, codigo: c.codigo, nombre: c.nombre, tipo: c.tipo as TipoCuentaContable, nivel: c.nivel, posteable: c.posteable, saldoInicial: 0, debe: 0, haber: 0, saldoFinal: 0 }]));
  const padre = new Map(cuentas.map((c) => [c.id, c.padreId]));
  for (const c of cuentas) {
    const m = mov.get(c.id) ?? { debe: 0, haber: 0 };
    const i = ini.get(c.id) ?? 0;
    if (i === 0 && m.debe === 0 && m.haber === 0) continue;
    // El movimiento de una cuenta suma a ella y a todos sus ascendientes.
    for (let id: string | null | undefined = c.id; id; id = padre.get(id)) {
      const f = filas.get(id);
      if (!f) break;
      f.saldoInicial += i;
      f.debe += m.debe;
      f.haber += m.haber;
    }
  }
  for (const f of filas.values()) f.saldoFinal = f.saldoInicial + f.debe - f.haber;
  const lista = [...filas.values()];
  // Los totales se toman solo de las cuentas de movimiento (si no, las de agrupación contarían doble).
  const hojas = lista.filter((f) => f.posteable);
  const totales = {
    debe: hojas.reduce((s, f) => s + f.debe, 0),
    haber: hojas.reduce((s, f) => s + f.haber, 0),
    saldoInicial: hojas.reduce((s, f) => s + f.saldoInicial, 0),
    saldoFinal: hojas.reduce((s, f) => s + f.saldoFinal, 0),
    deudor: hojas.reduce((s, f) => s + Math.max(f.saldoFinal, 0), 0),
    acreedor: hojas.reduce((s, f) => s + Math.max(-f.saldoFinal, 0), 0),
  };
  return { filas: lista, totales };
}

export type MovimientoMayor = { fecha: Date; asientoId: string; numero: number; descripcion: string; detalle: string | null; debe: number; haber: number; saldo: number };

/** Libro mayor de una cuenta (incluye a sus hijas si es de agrupación): saldo inicial, movimientos y saldo corrido. Montos en centavos. */
export async function libroMayor(db: Db, cuentaId: string, desde: Date, hasta: Date) {
  const todas = await db.cuentaContable.findMany({ select: { id: true, padreId: true } });
  const hijos = new Map<string, string[]>();
  for (const c of todas) if (c.padreId) hijos.set(c.padreId, [...(hijos.get(c.padreId) ?? []), c.id]);
  const ids: string[] = [];
  const pila = [cuentaId];
  while (pila.length) {
    const id = pila.pop() as string;
    ids.push(id);
    pila.push(...(hijos.get(id) ?? []));
  }
  const [previo, lineas] = await Promise.all([
    db.asientoLinea.aggregate({ where: { cuentaId: { in: ids }, asiento: { estado: "REGISTRADO", fecha: { lt: desde } } }, _sum: { debe: true, haber: true } }),
    db.asientoLinea.findMany({
      where: { cuentaId: { in: ids }, asiento: { estado: "REGISTRADO", fecha: { gte: desde, lte: hasta } } },
      include: { asiento: { select: { id: true, numero: true, fecha: true, descripcion: true } } },
      orderBy: [{ asiento: { fecha: "asc" } }, { asiento: { numero: "asc" } }, { linea: "asc" }],
      take: 2000,
    }),
  ]);
  const saldoInicial = cent(previo._sum.debe) - cent(previo._sum.haber);
  let saldo = saldoInicial;
  const movimientos: MovimientoMayor[] = lineas.map((l) => {
    const debe = cent(l.debe), haber = cent(l.haber);
    saldo += debe - haber;
    return { fecha: l.asiento.fecha, asientoId: l.asiento.id, numero: l.asiento.numero, descripcion: l.asiento.descripcion, detalle: l.descripcion, debe, haber, saldo };
  });
  return { saldoInicial, movimientos, saldoFinal: saldo, truncado: lineas.length === 2000 };
}

export const naturalezaDe = (tipo: TipoCuentaContable) => TIPOS_CUENTA_CONTABLE[tipo].naturaleza;
