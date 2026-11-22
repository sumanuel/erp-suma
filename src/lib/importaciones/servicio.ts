import "server-only";
import type { Db } from "@/lib/tenant";
import { registrarCambio } from "@/lib/auditoria";
import { aplicarMovimiento, MovimientoRechazado, type Actor } from "@/lib/inventario/movimientos";
import { liquidarImportacion, numeroImportacion } from "./calculos";

// Servicio de importaciones: el expediente se arma en BORRADOR (productos con precio FOB, gastos y factores), se liquida el costo de cada producto y al PROCESAR
// la mercancía entra al almacén con ese costo (el costo promedio del producto se recalcula). Anular una procesada saca la mercancía otra vez (si ya se vendió, no procede).
// Las facturas del proveedor del exterior y de los gastos se registran en Cuentas por pagar como cualquier compra.

export class ImportacionError extends Error {}
export type ResultadoImportacion<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export type DatosImportacion = {
  proveedorId: string; documento: string; fecha: Date; almacenId: string; moneda: string; cambioUsd: number; factorCif: number; factorOtros: number; observaciones: string | null;
  lineas: { productoCodigo: string; cantidad: number; fobUnitario: number; arancelPct: number }[];
  gastos: { descripcion: string; montoUsd: number; proveedorId?: string | null; fecha?: Date | null }[];
};

async function ejecutar<T>(trabajo: () => Promise<ResultadoImportacion<T>>): Promise<ResultadoImportacion<T>> {
  try {
    return await trabajo();
  } catch (e) {
    if (e instanceof ImportacionError) return { ok: false, error: e.message };
    if (e instanceof MovimientoRechazado) return { ok: false, error: Object.values(e.errores)[0] ?? "El inventario rechazó el movimiento." };
    throw e;
  }
}

const decimales = (n: number) => (String(n).split(".")[1] ?? "").length;

export async function guardarImportacion(db: Db, actor: Actor, id: string | null, d: DatosImportacion): Promise<ResultadoImportacion<{ id: string; numero: number }>> {
  return ejecutar(async () => {
    const documento = d.documento.trim();
    if (!documento || documento.length > 40) throw new ImportacionError("Indica el documento del proveedor (máximo 40 caracteres).");
    if (!/^[A-Z]{3}$/.test(d.moneda)) throw new ImportacionError("La moneda debe ser un código de 3 letras (por ejemplo USD).");
    for (const [n, v] of [["cambio", d.cambioUsd], ["factor CIF", d.factorCif]] as const) if (!(v > 0) || v > 1e9) throw new ImportacionError(`El ${n} debe ser mayor que 0.`);
    if (!(d.factorOtros >= 0) || d.factorOtros > 1e6) throw new ImportacionError("El factor de otros no puede ser negativo.");
    if (d.lineas.length === 0) throw new ImportacionError("Agrega al menos un producto.");
    if (d.lineas.length > 300) throw new ImportacionError("Máximo 300 productos por importación.");
    if (d.gastos.length > 100) throw new ImportacionError("Máximo 100 gastos por importación.");
    const codigos = d.lineas.map((l) => l.productoCodigo);
    if (new Set(codigos).size !== codigos.length) throw new ImportacionError("Hay un producto repetido: suma sus cantidades en una sola línea.");
    d.lineas.forEach((l, i) => {
      if (!(l.cantidad > 0) || l.cantidad > 1e9 || decimales(l.cantidad) > 4) throw new ImportacionError(`Línea ${i + 1}: la cantidad debe ser mayor que 0 (máximo 4 decimales).`);
      if (!(l.fobUnitario >= 0) || l.fobUnitario > 1e9) throw new ImportacionError(`Línea ${i + 1}: precio FOB inválido.`);
      if (!(l.arancelPct >= 0) || l.arancelPct > 1000) throw new ImportacionError(`Línea ${i + 1}: el arancel debe estar entre 0 y 1000 %.`);
    });
    d.gastos.forEach((g, i) => {
      if (!g.descripcion.trim() || g.descripcion.length > 120) throw new ImportacionError(`Gasto ${i + 1}: indica la descripción (máximo 120 caracteres).`);
      if (!(g.montoUsd > 0) || g.montoUsd > 1e12) throw new ImportacionError(`Gasto ${i + 1}: el monto debe ser mayor que 0.`);
    });

    const r = await db.$transaction(async (tx) => {
      const proveedor = await tx.proveedor.findUnique({ where: { id: d.proveedorId }, select: { activo: true } });
      if (!proveedor?.activo) throw new ImportacionError("El proveedor no existe o está inactivo.");
      if (!(await tx.almacen.findFirst({ where: { id: d.almacenId, activo: true }, select: { id: true } }))) throw new ImportacionError("El almacén no existe o está inactivo.");
      const productos = await tx.producto.findMany({ where: { codigo: { in: codigos } }, select: { codigo: true, activo: true } });
      for (const c of codigos) if (!productos.find((p) => p.codigo === c)?.activo) throw new ImportacionError(`El producto ${c} no existe o está inactivo.`);
      const idsProveedorGasto = [...new Set(d.gastos.map((g) => g.proveedorId).filter((x): x is string => !!x))];
      if (idsProveedorGasto.length && (await tx.proveedor.count({ where: { id: { in: idsProveedorGasto } } })) !== idsProveedorGasto.length) throw new ImportacionError("Un proveedor de gastos no existe.");

      const gastosUsd = d.gastos.reduce((s, g) => s + g.montoUsd, 0);
      const liq = liquidarImportacion(d.lineas, { cambioUsd: d.cambioUsd, factorCif: d.factorCif, factorOtros: d.factorOtros, gastosUsd });
      const lineas = d.lineas.map((l, i) => ({ linea: i + 1, productoCodigo: l.productoCodigo, cantidad: l.cantidad, fobUnitario: l.fobUnitario, arancelPct: l.arancelPct, ...liq.filas[i] }));
      const cabecera = {
        proveedorId: d.proveedorId, documento, fecha: d.fecha, almacenId: d.almacenId, moneda: d.moneda, cambioUsd: d.cambioUsd, factorCif: d.factorCif, factorOtros: d.factorOtros, observaciones: d.observaciones?.trim() || null,
        fobUsd: liq.totales.fobUsd, cifUsd: liq.totales.cifUsd, gastosUsd: Math.round(gastosUsd * 1e4) / 1e4, arancelesUsd: liq.totales.arancelUsd, totalUsd: liq.totales.totalUsd,
      };
      const gastos = d.gastos.map((g) => ({ descripcion: g.descripcion.trim(), montoUsd: g.montoUsd, proveedorId: g.proveedorId || null, fecha: g.fecha ?? null }));
      if (id) {
        const u = await tx.importacion.updateMany({ where: { id, estado: "BORRADOR" }, data: cabecera });
        if (u.count === 0) throw new ImportacionError("Solo se edita una importación en borrador (o ya no existe).");
        await tx.importacionLinea.deleteMany({ where: { importacionId: id } });
        await tx.importacionGasto.deleteMany({ where: { importacionId: id } });
        await tx.importacionLinea.createMany({ data: lineas.map((l) => ({ ...l, importacionId: id })) });
        await tx.importacionGasto.createMany({ data: gastos.map((g) => ({ ...g, importacionId: id })) });
        const x = await tx.importacion.findUniqueOrThrow({ where: { id }, select: { id: true, numero: true } });
        return { ...x, nueva: false };
      }
      const x = await tx.importacion.create({ data: { ...cabecera, creadoPorId: actor.id, creadoPorNombre: actor.nombre, lineas: { create: lineas }, gastos: { create: gastos } }, select: { id: true, numero: true } });
      return { ...x, nueva: true };
    });
    await registrarCambio(db, actor, { modulo: "importaciones", entidad: "importacion", entidadId: r.id, descripcion: numeroImportacion(r.numero), accion: r.nueva ? "crear" : "editar", despues: { productos: d.lineas.length, gastos: d.gastos.length } });
    return { ok: true, id: r.id, numero: r.numero };
  });
}

/** Procesa el expediente: la mercancía entra al almacén con el costo liquidado de cada producto. */
export async function procesarImportacion(db: Db, actor: Actor, id: string): Promise<ResultadoImportacion> {
  return ejecutar(async () => {
    const numero = await db.$transaction(async (tx) => {
      const u = await tx.importacion.updateMany({ where: { id, estado: "BORRADOR" }, data: { estado: "PROCESADA", procesadaEn: new Date(), procesadaPorNombre: actor.nombre } });
      if (u.count === 0) throw new ImportacionError("Solo se procesa una importación en borrador. Recarga la página.");
      const imp = await tx.importacion.findUniqueOrThrow({ where: { id }, include: { lineas: { orderBy: { linea: "asc" } } } });
      if (imp.lineas.length === 0) throw new ImportacionError("La importación no tiene productos.");
      for (const l of imp.lineas) {
        await aplicarMovimiento(tx, actor, {
          tipo: "ENTRADA", almacenId: imp.almacenId, productoCodigo: l.productoCodigo, cantidad: Number(l.cantidad), costoUnitario: Number(l.costoUnitarioUsd),
          documento: numeroImportacion(imp.numero), motivo: `Importación ${imp.documento}`,
        });
      }
      return imp.numero;
    });
    await registrarCambio(db, actor, { modulo: "importaciones", entidad: "importacion", entidadId: id, descripcion: numeroImportacion(numero), accion: "otro", despues: { estado: "PROCESADA", operacion: "Procesada: mercancía al inventario" } });
    return { ok: true };
  });
}

/** Anula la importación: en borrador solo cambia el estado; procesada, además saca del almacén lo que entró (si ya se vendió no procede). */
export async function anularImportacion(db: Db, actor: Actor, id: string, motivo: string): Promise<ResultadoImportacion> {
  return ejecutar(async () => {
    const m = motivo.trim();
    if (m.length < 3) throw new ImportacionError("Indica el motivo de la anulación.");
    const numero = await db.$transaction(async (tx) => {
      const antes = await tx.importacion.findUnique({ where: { id }, include: { lineas: true } });
      if (!antes) throw new ImportacionError("La importación ya no existe.");
      const u = await tx.importacion.updateMany({ where: { id, estado: { in: ["BORRADOR", "PROCESADA"] } }, data: { estado: "ANULADA", anuladaEn: new Date(), anuladaPorNombre: actor.nombre, motivoAnulacion: m.slice(0, 500) } });
      if (u.count === 0) throw new ImportacionError("La importación ya está anulada. Recarga la página.");
      if (antes.estado === "PROCESADA") {
        for (const l of antes.lineas) {
          await aplicarMovimiento(tx, actor, { tipo: "AJUSTE_NEGATIVO", almacenId: antes.almacenId, productoCodigo: l.productoCodigo, cantidad: Number(l.cantidad), documento: numeroImportacion(antes.numero), motivo: `Anulación de importación: ${m.slice(0, 160)}` });
        }
      }
      return antes.numero;
    });
    await registrarCambio(db, actor, { modulo: "importaciones", entidad: "importacion", entidadId: id, descripcion: numeroImportacion(numero), accion: "otro", despues: { estado: "ANULADA", motivo: m } });
    return { ok: true };
  });
}
