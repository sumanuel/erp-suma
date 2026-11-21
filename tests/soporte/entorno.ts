import { randomUUID } from "node:crypto";
import { clientePorSlug } from "../../src/lib/nucleo/control";
import { abrirDb, type Db } from "../../src/lib/tenant";
import { registrarMovimiento, type Actor } from "../../src/lib/inventario/movimientos";

// Ayudantes comunes. Los archivos de prueba corren uno tras otro sobre el mismo cliente temporal, así que cada uno crea sus propios datos
// con códigos únicos y no depende de lo que dejó otro. Las invariantes globales (balance cuadrado, saldos = libros) valen sobre todo lo acumulado.

export const redondear2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const unico = (p: string) => `${p}${randomUUID().slice(0, 8).toUpperCase()}`;

export type Entorno = { db: Db; actor: Actor; almacenId: string };

export async function abrirEntorno(): Promise<Entorno> {
  const slug = process.env.PRUEBAS_SLUG;
  if (!slug) throw new Error("Corra la suite con `npm test` (crea el cliente temporal de pruebas).");
  const cliente = await clientePorSlug(slug);
  if (!cliente) throw new Error(`No existe el cliente ${slug}.`);
  const db = await abrirDb(cliente);
  const u = await db.usuario.findFirstOrThrow({ where: { perfil: { esAdministrador: true } } });
  const alm = await db.almacen.findFirstOrThrow();
  return { db, actor: { id: u.id, nombre: u.nombre }, almacenId: alm.id };
}

export async function fijarTasa(db: Db, valor: number, moneda = "USD") {
  const m = await db.moneda.findUniqueOrThrow({ where: { codigo: moneda } });
  await db.tasaCambio.create({ data: { monedaId: m.id, fecha: new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(new Date())}T00:00:00.000Z`), valor } });
}

export async function automatica(db: Db, activa: boolean) {
  await db.configContable.update({ where: { id: 1 }, data: { automatica: activa } });
}

export async function crearCliente(db: Db) {
  return db.cliente.create({ data: { documento: unico("J"), razonSocial: "Cliente de prueba", tipo: "Privado" } });
}
export async function crearProveedor(db: Db, extra: { retencionIvaPct?: number } = {}) {
  return db.proveedor.create({ data: { documento: unico("P"), razonSocial: "Proveedor de prueba", ...extra } });
}

/** Producto con IVA general (16 %) y, si se pide, existencia inicial por una entrada de inventario real. */
export async function crearProducto(e: Entorno, o: { precio?: number; costo?: number; existencia?: number; exento?: boolean } = {}) {
  const { db } = e;
  const cat = (await db.categoria.findFirst()) ?? (await db.categoria.create({ data: { codigo: "PRUEBA", nombre: "Pruebas" } }));
  const iva = await db.alicuotaIva.findFirstOrThrow({ where: { nombre: o.exento ? "Exento" : "General" } });
  const p = await db.producto.create({
    data: { codigo: unico("PR"), descripcion: "Producto de prueba", categoriaId: cat.id, alicuotaIvaId: iva.id, precioLista: o.precio ?? 10, costoPromedio: o.costo ?? 0, ultimoCosto: o.costo ?? 0 },
  });
  if (o.existencia) {
    const r = await registrarMovimiento(db, e.actor, { tipo: "ENTRADA", almacenId: e.almacenId, productoCodigo: p.codigo, cantidad: o.existencia, costoUnitario: o.costo ?? 1 });
    if (!r.ok) throw new Error(`No se pudo cargar la existencia: ${JSON.stringify(r)}`);
  }
  return p;
}

export async function crearCajaTesoreria(e: Entorno, moneda: "VES" | "USD", saldo = 0) {
  const { db } = e;
  const c = await db.cuentaContable.findFirstOrThrow({ where: { codigo: "1.1.01" } });
  return db.cuentaTesoreria.create({ data: { codigo: unico("C"), nombre: "Caja de prueba", tipo: "CAJA", moneda, saldo, cuentaContableId: c.id } });
}

/** Suma de debe y haber de TODOS los asientos no anulados. */
export async function descuadreContable(db: Db) {
  const r = await db.$queryRawUnsafe<{ debe: string; haber: string }[]>(
    "SELECT COALESCE(SUM(l.debe),0)::text AS debe, COALESCE(SUM(l.haber),0)::text AS haber FROM asiento_linea l JOIN asiento a ON a.id = l.asiento_id",
  );
  return redondear2(Number(r[0].debe) - Number(r[0].haber));
}

/** Hoy en Caracas a medianoche UTC (como se guardan las fechas de día completo). */
export const hoy = () => new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(new Date())}T00:00:00.000Z`);
