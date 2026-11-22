import "server-only";
import type { Db } from "@/lib/tenant";
import { registrarCambio } from "@/lib/auditoria";
import type { Actor } from "@/lib/inventario/movimientos";
import { hoyCaracas } from "@/lib/tasas";
import { ContaError, crearAsientoEnTx, type ResultadoConta } from "./servicio";
import { numeroAsiento } from "./tipos";

// Cierre del ejercicio (original: frmComprobanteCierre). Un solo asiento de cierre, fechado el 31 de diciembre, pone en cero cada cuenta de ingresos, costos y gastos
// del año y lleva la utilidad (o pérdida) a la cuenta del concepto «Resultados acumulados». Luego se cierran los 12 períodos del año: ya no admite asientos.
// El saldo de las cuentas de balance sigue corrido de un año a otro. Reabrir un ejercicio (solo el último cerrado) anula el asiento de cierre y reabre los períodos.

const CIERRE = "CIERRE_EJERCICIO";
const cent = (v: unknown) => Math.round(Number(v ?? 0) * 100);

async function ejecutar<T>(trabajo: () => Promise<ResultadoConta<T>>): Promise<ResultadoConta<T>> {
  try {
    return await trabajo();
  } catch (e) {
    if (e instanceof ContaError) return { ok: false, error: e.message };
    throw e;
  }
}

export type LineaCierre = { cuentaId: string; codigo: string; nombre: string; tipo: string; /** Saldo del año en centavos (debe − haber). */ saldo: number };

/** Cuentas de resultados con movimiento en el año y el resultado neto (positivo = utilidad), todo en centavos de bolívar. */
export async function previsualizarCierre(db: Pick<Db, "asientoLinea">, anio: number) {
  const filas = await db.asientoLinea.groupBy({
    by: ["cuentaId"],
    where: { asiento: { estado: "REGISTRADO", anio, origen: { not: CIERRE } }, cuenta: { tipo: { in: ["INGRESO", "COSTO", "GASTO"] } } },
    _sum: { debe: true, haber: true },
  });
  const cuentas = await (db as unknown as Db).cuentaContable.findMany({ where: { id: { in: filas.map((f) => f.cuentaId) } }, select: { id: true, codigo: true, nombre: true, tipo: true } });
  const porId = new Map(cuentas.map((c) => [c.id, c]));
  const lineas: LineaCierre[] = filas
    .map((f) => ({ cuentaId: f.cuentaId, codigo: porId.get(f.cuentaId)!.codigo, nombre: porId.get(f.cuentaId)!.nombre, tipo: porId.get(f.cuentaId)!.tipo, saldo: cent(f._sum.debe) - cent(f._sum.haber) }))
    .filter((l) => l.saldo !== 0)
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
  const resultado = -lineas.reduce((s, l) => s + l.saldo, 0);
  return { lineas, resultado };
}

export async function cerrarEjercicio(db: Db, actor: Actor, anio: number): Promise<ResultadoConta<{ asientoId: string; resultadoBs: number }>> {
  return ejecutar(async () => {
    if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) throw new ContaError("Año inválido.");
    const fecha = new Date(Date.UTC(anio, 11, 31));
    if (fecha.getTime() > hoyCaracas().getTime()) throw new ContaError(`El ejercicio ${anio} aún no termina: se cierra a partir del 31 de diciembre.`);
    const r = await db.$transaction(async (tx) => {
      if (await tx.ejercicioContable.findUnique({ where: { anio } })) throw new ContaError(`El ejercicio ${anio} ya está cerrado.`);
      if (await tx.ejercicioContable.findFirst({ where: { anio: { gt: anio } } })) throw new ContaError("Ya hay un ejercicio posterior cerrado: no se cierra uno anterior.");
      const concepto = await tx.cuentaConcepto.findUnique({ where: { concepto: "RESULTADO_EJERCICIO" }, include: { cuenta: { select: { id: true, codigo: true, posteable: true, activo: true } } } });
      if (!concepto) throw new ContaError("Falta configurar la cuenta del concepto «Resultados acumulados (cierre del ejercicio)» en Contabilidad → Configuración.");
      if (!concepto.cuenta.posteable || !concepto.cuenta.activo) throw new ContaError(`La cuenta ${concepto.cuenta.codigo} de resultados acumulados no recibe asientos o está inactiva.`);
      const { lineas, resultado } = await previsualizarCierre(tx, anio);
      if (lineas.length === 0) throw new ContaError(`El ejercicio ${anio} no tiene movimientos de ingresos, costos o gastos que cerrar.`);
      // Diciembre debe estar abierto para registrar el asiento de cierre.
      await tx.periodoContable.upsert({ where: { anio_mes: { anio, mes: 12 } }, create: { anio, mes: 12 }, update: { estado: "ABIERTO", cerradoEn: null, cerradoPorNombre: null } });
      // La referencia es única por origen: si el ejercicio ya se cerró y reabrió antes, la nueva lleva un sufijo.
      const previos = await tx.asiento.count({ where: { origen: CIERRE, referencia: { startsWith: `CIERRE-${anio}` } } });
      const asiento = await crearAsientoEnTx(
        tx, actor,
        {
          fecha, descripcion: `Cierre del ejercicio ${anio}`, referencia: previos > 0 ? `CIERRE-${anio}-${previos + 1}` : `CIERRE-${anio}`,
          lineas: [
            ...lineas.map((l) => ({ cuentaId: l.cuentaId, descripcion: `Cierre de ${l.codigo}`, debe: l.saldo < 0 ? -l.saldo / 100 : 0, haber: l.saldo > 0 ? l.saldo / 100 : 0 })),
            { cuentaId: concepto.cuenta.id, descripcion: resultado >= 0 ? `Utilidad del ejercicio ${anio}` : `Pérdida del ejercicio ${anio}`, debe: resultado < 0 ? -resultado / 100 : 0, haber: resultado > 0 ? resultado / 100 : 0 },
          ].filter((l) => l.debe > 0 || l.haber > 0),
        },
        CIERRE,
      );
      // Se cierran los 12 períodos: el año ya no admite asientos ni anulaciones.
      for (let mes = 1; mes <= 12; mes++) {
        await tx.periodoContable.upsert({ where: { anio_mes: { anio, mes } }, create: { anio, mes, estado: "CERRADO", cerradoEn: new Date(), cerradoPorNombre: actor.nombre }, update: { estado: "CERRADO", cerradoEn: new Date(), cerradoPorNombre: actor.nombre } });
      }
      await tx.ejercicioContable.create({ data: { anio, fechaCierre: fecha, asientoId: asiento.id, resultadoBs: resultado / 100, cerradoPorId: actor.id, cerradoPorNombre: actor.nombre } });
      return { asientoId: asiento.id, numero: asiento.numero, resultado };
    });
    await registrarCambio(db, actor, { modulo: "contabilidad", entidad: "ejercicio_contable", entidadId: String(anio), descripcion: `Ejercicio ${anio}`, accion: "otro", despues: { operacion: "Cierre del ejercicio", asiento: numeroAsiento(r.numero), resultadoBs: r.resultado / 100 } });
    return { ok: true, asientoId: r.asientoId, resultadoBs: r.resultado / 100 };
  });
}

/** Reabre el último ejercicio cerrado: anula su asiento de cierre y reabre los períodos del año. */
export async function reabrirEjercicio(db: Db, actor: Actor, anio: number, motivo: string): Promise<ResultadoConta> {
  return ejecutar(async () => {
    const m = motivo.trim();
    if (m.length < 3) throw new ContaError("Indica el motivo de la reapertura.");
    await db.$transaction(async (tx) => {
      const e = await tx.ejercicioContable.findUnique({ where: { anio } });
      if (!e) throw new ContaError(`El ejercicio ${anio} no está cerrado.`);
      if (await tx.ejercicioContable.findFirst({ where: { anio: { gt: anio } } })) throw new ContaError("Solo se reabre el último ejercicio cerrado: reabre primero el posterior.");
      const u = await tx.asiento.updateMany({ where: { id: e.asientoId, estado: "REGISTRADO" }, data: { estado: "ANULADO", anuladoEn: new Date(), anuladoPorNombre: actor.nombre, motivoAnulacion: `Reapertura del ejercicio: ${m}`.slice(0, 500) } });
      if (u.count === 0) throw new ContaError("El asiento de cierre ya estaba anulado.");
      await tx.ejercicioContable.delete({ where: { anio } });
      await tx.periodoContable.updateMany({ where: { anio }, data: { estado: "ABIERTO", cerradoEn: null, cerradoPorNombre: null } });
    });
    await registrarCambio(db, actor, { modulo: "contabilidad", entidad: "ejercicio_contable", entidadId: String(anio), descripcion: `Ejercicio ${anio}`, accion: "otro", despues: { operacion: "Reapertura del ejercicio", motivo: m } });
    return { ok: true };
  });
}
