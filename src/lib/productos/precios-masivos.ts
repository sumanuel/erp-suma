import "server-only";
import type { Db } from "@/lib/tenant";
import { registrarCambio } from "@/lib/auditoria";

// Cambio masivo de precios: se eligen los productos (categoría, subcategoría, marca, división, proveedor o texto), una lista de precios (A–F) y una regla
// (subir/bajar un porcentaje, sumar o restar un monto, o fijar el precio con un margen sobre el costo). Primero se ve la vista previa; al aplicar se
// recalcula dentro de la transacción, así que lo que se guarda es siempre lo que la regla da en ese momento. Todo en USD.

export const LISTAS_PRECIO = ["A", "B", "C", "D", "E", "F"] as const;
export const MODOS_CAMBIO = {
  PORCENTAJE: "Subir o bajar un porcentaje del precio actual",
  MONTO: "Sumar o restar un monto al precio actual",
  MARGEN_COSTO: "Fijar el precio con un margen sobre el costo",
} as const;
export type ModoCambio = keyof typeof MODOS_CAMBIO;

export type FiltrosCambio = { categoriaId?: string; subcategoriaId?: string; marcaId?: string; divisionId?: string; proveedorId?: string; texto?: string; incluirInactivos?: boolean };
export type ReglaCambio = { lista: string; modo: ModoCambio; valor: number; decimales: number };
export type FilaCambio = { codigo: string; descripcion: string; costo: number; anterior: number; nuevo: number; limitado: boolean };
export type ResultadoCambio = { filas: FilaCambio[]; omitidos: { sinCosto: number; negativos: number; sinCambio: number }; total: number };

export const MAX_PRODUCTOS_CAMBIO = 20000;

const redondear = (n: number, d: number) => Math.round((n + Number.EPSILON) * 10 ** d) / 10 ** d;

type Lector = Pick<Db, "producto" | "productoPrecio">;

export function validarRegla(r: ReglaCambio): string | null {
  if (!(LISTAS_PRECIO as readonly string[]).includes(r.lista)) return "Elige la lista de precios.";
  if (!(r.modo in MODOS_CAMBIO)) return "Elige el tipo de cambio.";
  if (!Number.isFinite(r.valor)) return "Escribe el valor del cambio.";
  if (!Number.isInteger(r.decimales) || r.decimales < 0 || r.decimales > 4) return "Los decimales van de 0 a 4.";
  if (r.modo === "PORCENTAJE" && (r.valor < -99.99 || r.valor > 1000)) return "El porcentaje debe estar entre -99,99 y 1000.";
  if (r.modo === "MARGEN_COSTO" && (r.valor < 0 || r.valor > 10000)) return "El margen debe estar entre 0 y 10000.";
  if (r.modo === "MONTO" && Math.abs(r.valor) > 1e9) return "Monto demasiado grande.";
  return null;
}

function donde(f: FiltrosCambio) {
  const texto = f.texto?.trim();
  return {
    ...(f.incluirInactivos ? {} : { activo: true }),
    ...(f.categoriaId ? { categoriaId: f.categoriaId } : {}),
    ...(f.subcategoriaId ? { subcategoriaId: f.subcategoriaId } : {}),
    ...(f.marcaId ? { marcaId: f.marcaId } : {}),
    ...(f.divisionId ? { divisionId: f.divisionId } : {}),
    ...(f.proveedorId ? { proveedores: { some: { proveedorId: f.proveedorId } } } : {}),
    ...(texto ? { OR: [{ codigo: { contains: texto, mode: "insensitive" as const } }, { descripcion: { contains: texto, mode: "insensitive" as const } }] } : {}),
  };
}

/** Calcula, sin guardar nada, el precio nuevo de cada producto que cumple los filtros. */
export async function calcularCambio(db: Lector, filtros: FiltrosCambio, regla: ReglaCambio): Promise<ResultadoCambio> {
  const productos = await db.producto.findMany({
    where: donde(filtros),
    orderBy: { codigo: "asc" },
    take: MAX_PRODUCTOS_CAMBIO + 1,
    select: { codigo: true, descripcion: true, precioLista: true, precioMaximoPublico: true, metodoCosto: true, ultimoCosto: true, costoPromedio: true },
  });
  if (productos.length > MAX_PRODUCTOS_CAMBIO) throw new Error(`Son más de ${MAX_PRODUCTOS_CAMBIO} productos: afina los filtros.`);
  const precios = await db.productoPrecio.findMany({ where: { productoCodigo: { in: productos.map((p) => p.codigo) }, presentacionId: null, lista: regla.lista }, select: { productoCodigo: true, precioUsd: true } });
  const actual = new Map(precios.map((p) => [p.productoCodigo, Number(p.precioUsd)]));
  const filas: FilaCambio[] = [];
  const omitidos = { sinCosto: 0, negativos: 0, sinCambio: 0 };
  for (const p of productos) {
    const costo = Number(p.metodoCosto === "ULTIMO" ? p.ultimoCosto : p.costoPromedio);
    const anterior = actual.get(p.codigo) ?? Number(p.precioLista);
    let nuevo: number;
    if (regla.modo === "PORCENTAJE") nuevo = anterior * (1 + regla.valor / 100);
    else if (regla.modo === "MONTO") nuevo = anterior + regla.valor;
    else {
      if (costo <= 0) { omitidos.sinCosto++; continue; }
      nuevo = costo * (1 + regla.valor / 100);
    }
    nuevo = redondear(nuevo, regla.decimales);
    if (nuevo < 0) { omitidos.negativos++; continue; }
    const tope = Number(p.precioMaximoPublico);
    const limitado = tope > 0 && nuevo > tope;
    if (limitado) nuevo = tope;
    if (nuevo === redondear(anterior, 4)) { omitidos.sinCambio++; continue; }
    filas.push({ codigo: p.codigo, descripcion: p.descripcion, costo, anterior, nuevo, limitado });
  }
  return { filas, omitidos, total: productos.length };
}

/** Aplica el cambio y deja constancia en la auditoría. Devuelve cuántos productos cambiaron. */
export async function aplicarCambio(db: Db, actor: { id: string; nombre: string }, filtros: FiltrosCambio, regla: ReglaCambio): Promise<{ ok: true; cambiados: number; omitidos: ResultadoCambio["omitidos"] } | { ok: false; error: string }> {
  const e = validarRegla(regla);
  if (e) return { ok: false, error: e };
  let r: ResultadoCambio;
  try {
    r = await db.$transaction(async (tx) => {
      const calculo = await calcularCambio(tx, filtros, regla);
      for (const f of calculo.filas) {
        const utilidad = f.costo > 0 ? Math.min(99999, redondear((f.nuevo / f.costo - 1) * 100, 4)) : 0;
        const act = await tx.productoPrecio.updateMany({ where: { productoCodigo: f.codigo, presentacionId: null, lista: regla.lista }, data: { precioUsd: f.nuevo, ...(f.costo > 0 ? { utilidadPct: utilidad } : {}) } });
        if (act.count === 0) await tx.productoPrecio.create({ data: { productoCodigo: f.codigo, lista: regla.lista, precioUsd: f.nuevo, utilidadPct: utilidad } });
        // La lista A es también el precio de lista del producto.
        if (regla.lista === "A") await tx.producto.update({ where: { codigo: f.codigo }, data: { precioLista: f.nuevo } });
      }
      return calculo;
    }, { timeout: 120_000, maxWait: 10_000 });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "No se pudo aplicar el cambio." };
  }
  if (r.filas.length > 0) {
    await registrarCambio(db, actor, {
      modulo: "productos", entidad: "cambio_precios", entidadId: `lista-${regla.lista}-${Date.now()}`, accion: "otro",
      descripcion: `Cambio masivo de precios (lista ${regla.lista}): ${MODOS_CAMBIO[regla.modo].toLowerCase()} ${regla.valor}, ${r.filas.length} producto(s)`,
      despues: { filtros, regla, productos: r.filas.length, muestra: r.filas.slice(0, 100).map((f) => ({ codigo: f.codigo, anterior: f.anterior, nuevo: f.nuevo })) },
    });
  }
  return { ok: true, cambiados: r.filas.length, omitidos: r.omitidos };
}
