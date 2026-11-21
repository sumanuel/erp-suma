import "server-only";
import type { Db } from "@/lib/tenant";
import { registrarCambio } from "@/lib/auditoria";
import type { Actor } from "@/lib/inventario/movimientos";
import { hoyCaracas } from "@/lib/tasas";
import { TIPOS_CUENTA_CONTABLE, aCentavos, nombrePeriodo, numeroAsiento } from "./tipos";

// Servicio contable. El asiento se crea completo en una transacción y solo si cuadra (además lo vigila un trigger de la base). Un asiento no se edita:
// se anula (con motivo) y se registra otro. Un período cerrado no admite asientos ni anulaciones.

export type ResultadoConta<T = object> = ({ ok: true } & T) | { ok: false; error: string };
class ContaError extends Error {}

async function ejecutar<T>(trabajo: () => Promise<ResultadoConta<T>>): Promise<ResultadoConta<T>> {
  try {
    return await trabajo();
  } catch (e) {
    if (e instanceof ContaError) return { ok: false, error: e.message };
    throw e;
  }
}

// ---------- Plan de cuentas ----------
export type DatosCuentaContable = { codigo: string; nombre: string; tipo: string | null; padreId: string | null; posteable: boolean };

export async function crearCuentaContable(db: Db, actor: Actor, d: DatosCuentaContable): Promise<ResultadoConta<{ id: string }>> {
  return ejecutar(async () => {
    if (!/^[0-9]+(\.[0-9]+)*$/.test(d.codigo)) throw new ContaError("El código lleva solo números separados por punto (ejemplo 1.1.01).");
    const id = await db.$transaction(async (tx) => {
      if (await tx.cuentaContable.findUnique({ where: { codigo: d.codigo }, select: { id: true } })) throw new ContaError("Ya existe una cuenta con ese código.");
      let tipo = d.tipo;
      let nivel = 1;
      if (d.padreId) {
        const p = await tx.cuentaContable.findUnique({ where: { id: d.padreId }, select: { codigo: true, tipo: true, nivel: true, posteable: true } });
        if (!p) throw new ContaError("La cuenta padre no existe.");
        if (p.posteable) throw new ContaError("La cuenta padre recibe asientos: elige una cuenta de agrupación.");
        if (!d.codigo.startsWith(`${p.codigo}.`)) throw new ContaError(`El código debe empezar con ${p.codigo}. (el de su cuenta padre).`);
        if (d.codigo.split(".").length !== p.nivel + 1) throw new ContaError("El código debe tener un tramo más que el de su cuenta padre.");
        tipo = p.tipo;
        nivel = p.nivel + 1;
      } else {
        if (d.codigo.includes(".")) throw new ContaError("Una cuenta sin padre es de primer nivel: su código no lleva puntos.");
        if (!tipo || !(tipo in TIPOS_CUENTA_CONTABLE)) throw new ContaError("Elige el tipo de la cuenta.");
      }
      return (await tx.cuentaContable.create({ data: { codigo: d.codigo, nombre: d.nombre, tipo: tipo as string, padreId: d.padreId, nivel, posteable: d.posteable }, select: { id: true } })).id;
    });
    await registrarCambio(db, actor, { modulo: "contabilidad", entidad: "cuenta_contable", entidadId: id, descripcion: `${d.codigo} ${d.nombre}`, accion: "crear", despues: { codigo: d.codigo, nombre: d.nombre, posteable: d.posteable } });
    return { ok: true, id };
  });
}

export async function editarCuentaContable(db: Db, actor: Actor, id: string, d: { nombre: string; posteable: boolean; activo: boolean }): Promise<ResultadoConta> {
  return ejecutar(async () => {
    const antes = await db.cuentaContable.findUnique({ where: { id }, include: { _count: { select: { hijas: true, lineas: true } } } });
    if (!antes) throw new ContaError("La cuenta ya no existe.");
    if (d.posteable && antes._count.hijas > 0) throw new ContaError("Tiene cuentas hijas: no puede recibir asientos.");
    if (!d.posteable && antes._count.lineas > 0) throw new ContaError("Ya tiene movimientos: no se puede convertir en cuenta de agrupación.");
    await db.cuentaContable.update({ where: { id }, data: d });
    await registrarCambio(db, actor, { modulo: "contabilidad", entidad: "cuenta_contable", entidadId: id, descripcion: `${antes.codigo} ${antes.nombre}`, accion: "editar", antes: { nombre: antes.nombre, posteable: antes.posteable, activo: antes.activo }, despues: d });
    return { ok: true };
  });
}

export async function eliminarCuentaContable(db: Db, actor: Actor, id: string): Promise<ResultadoConta> {
  return ejecutar(async () => {
    const c = await db.cuentaContable.findUnique({ where: { id }, include: { _count: { select: { hijas: true, lineas: true } } } });
    if (!c) return { ok: true };
    if (c._count.hijas > 0) throw new ContaError("Tiene cuentas hijas: elimínalas primero.");
    if (c._count.lineas > 0) throw new ContaError("Tiene movimientos: no se puede eliminar. Desactívala en su lugar.");
    await db.cuentaContable.delete({ where: { id } });
    await registrarCambio(db, actor, { modulo: "contabilidad", entidad: "cuenta_contable", entidadId: id, descripcion: `${c.codigo} ${c.nombre}`, accion: "eliminar", antes: { codigo: c.codigo, nombre: c.nombre } });
    return { ok: true };
  });
}

// ---------- Asientos ----------
export type DatosAsiento = { fecha: Date; descripcion: string; referencia: string | null; lineas: { cuentaId: string; descripcion: string | null; debe: number; haber: number }[] };

export async function registrarAsiento(db: Db, actor: Actor, d: DatosAsiento): Promise<ResultadoConta<{ id: string; numero: number }>> {
  return ejecutar(async () => {
    if (d.descripcion.trim().length < 3) throw new ContaError("Escribe la descripción del asiento.");
    if (d.fecha.getTime() > hoyCaracas().getTime()) throw new ContaError("La fecha del asiento no puede ser futura.");
    if (d.lineas.length < 2) throw new ContaError("Un asiento necesita al menos dos líneas.");
    if (d.lineas.length > 300) throw new ContaError("Máximo 300 líneas por asiento.");
    let debe = 0, haber = 0;
    const filas = d.lineas.map((l, i) => {
      const cd = aCentavos(l.debe), ch = aCentavos(l.haber);
      if (cd === null || ch === null) throw new ContaError(`Línea ${i + 1}: los montos admiten máximo 2 decimales.`);
      if (cd < 0 || ch < 0 || cd > 1e14 || ch > 1e14) throw new ContaError(`Línea ${i + 1}: monto inválido.`);
      if ((cd > 0) === (ch > 0)) throw new ContaError(`Línea ${i + 1}: indica el monto en el debe o en el haber (uno solo).`);
      debe += cd;
      haber += ch;
      return { linea: i + 1, cuentaId: l.cuentaId, descripcion: l.descripcion?.trim() || null, debe: cd / 100, haber: ch / 100 };
    });
    if (debe !== haber) throw new ContaError(`El asiento no cuadra: debe ${(debe / 100).toFixed(2)} y haber ${(haber / 100).toFixed(2)}.`);
    const anio = d.fecha.getUTCFullYear(), mes = d.fecha.getUTCMonth() + 1;

    const r = await db.$transaction(async (tx) => {
      const periodo = await tx.periodoContable.upsert({ where: { anio_mes: { anio, mes } }, create: { anio, mes }, update: {} });
      if (periodo.estado === "CERRADO") throw new ContaError(`El período ${nombrePeriodo(anio, mes)} está cerrado.`);
      const ids = [...new Set(filas.map((f) => f.cuentaId))];
      const cuentas = await tx.cuentaContable.findMany({ where: { id: { in: ids } }, select: { id: true, codigo: true, posteable: true, activo: true } });
      const porId = new Map(cuentas.map((c) => [c.id, c]));
      for (const f of filas) {
        const c = porId.get(f.cuentaId);
        if (!c) throw new ContaError(`Línea ${f.linea}: la cuenta no existe.`);
        if (!c.activo) throw new ContaError(`Línea ${f.linea}: la cuenta ${c.codigo} está inactiva.`);
        if (!c.posteable) throw new ContaError(`Línea ${f.linea}: la cuenta ${c.codigo} es de agrupación y no recibe asientos.`);
      }
      return tx.asiento.create({
        data: { fecha: d.fecha, anio, mes, descripcion: d.descripcion.trim(), referencia: d.referencia, creadoPorId: actor.id, creadoPorNombre: actor.nombre, lineas: { create: filas } },
        select: { id: true, numero: true },
      });
    });
    await registrarCambio(db, actor, { modulo: "contabilidad", entidad: "asiento", entidadId: r.id, descripcion: numeroAsiento(r.numero), accion: "crear", despues: { descripcion: d.descripcion.trim(), lineas: d.lineas.length, total: debe / 100 } });
    return { ok: true, id: r.id, numero: r.numero };
  });
}

export async function anularAsiento(db: Db, actor: Actor, id: string, motivo: string): Promise<ResultadoConta> {
  return ejecutar(async () => {
    const m = motivo.trim();
    if (m.length < 3) throw new ContaError("Indica el motivo de la anulación.");
    const numero = await db.$transaction(async (tx) => {
      const a = await tx.asiento.findUnique({ where: { id }, select: { numero: true, anio: true, mes: true } });
      if (!a) throw new ContaError("El asiento ya no existe.");
      const periodo = await tx.periodoContable.findUnique({ where: { anio_mes: { anio: a.anio, mes: a.mes } } });
      if (periodo?.estado === "CERRADO") throw new ContaError(`El período ${nombrePeriodo(a.anio, a.mes)} está cerrado: no se puede anular.`);
      const u = await tx.asiento.updateMany({ where: { id, estado: "REGISTRADO" }, data: { estado: "ANULADO", anuladoEn: new Date(), anuladoPorNombre: actor.nombre, motivoAnulacion: m.slice(0, 500) } });
      if (u.count === 0) throw new ContaError("El asiento ya está anulado. Recarga la página.");
      return a.numero;
    });
    await registrarCambio(db, actor, { modulo: "contabilidad", entidad: "asiento", entidadId: id, descripcion: numeroAsiento(numero), accion: "otro", despues: { estado: "ANULADO", motivo: m } });
    return { ok: true };
  });
}

// ---------- Períodos ----------
export async function cambiarEstadoPeriodo(db: Db, actor: Actor, anio: number, mes: number, cerrar: boolean): Promise<ResultadoConta> {
  return ejecutar(async () => {
    if (!Number.isInteger(anio) || !Number.isInteger(mes) || mes < 1 || mes > 12 || anio < 2000 || anio > 2100) throw new ContaError("Período inválido.");
    const desde = cerrar ? "ABIERTO" : "CERRADO";
    const p = await db.periodoContable.upsert({ where: { anio_mes: { anio, mes } }, create: { anio, mes }, update: {} });
    const u = await db.periodoContable.updateMany({
      where: { id: p.id, estado: desde },
      data: cerrar ? { estado: "CERRADO", cerradoEn: new Date(), cerradoPorNombre: actor.nombre } : { estado: "ABIERTO", cerradoEn: null, cerradoPorNombre: null },
    });
    if (u.count === 0) throw new ContaError(cerrar ? "El período ya está cerrado." : "El período ya está abierto.");
    await registrarCambio(db, actor, { modulo: "contabilidad", entidad: "periodo_contable", entidadId: p.id, descripcion: nombrePeriodo(anio, mes), accion: "otro", despues: { estado: cerrar ? "CERRADO" : "ABIERTO" } });
    return { ok: true };
  });
}
