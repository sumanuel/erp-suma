import "server-only";
import type { Db } from "@/lib/tenant";
import { numeroFactura } from "@/lib/facturacion/estados";
import { hoyCaracas } from "@/lib/tasas";
import { aFecha, diaCaracas, redondear2 } from "./ayudas";
import { lineasDeVenta } from "./movimientos-venta";
import type { Fila, Resultado } from "./tipos";

// Listados gerenciales de artículos (original: ListadosGerenciales): agotados, negativos, sin vender, precios cambiados y ofertas.

export const LIMITE = 5000;
const recortar = <T,>(filas: T[], notas: string[]) => {
  if (filas.length <= LIMITE) return filas;
  notas.push(`Se muestran las primeras ${LIMITE} filas de ${filas.length}: acota los filtros.`);
  return filas.slice(0, LIMITE);
};

type UltimaVenta = { fecha: Date; vendedorId: string | null };

/** Última venta (factura emitida) de cada producto. */
export async function ultimasVentas(db: Db): Promise<Map<string, UltimaVenta>> {
  const r = await db.$queryRaw<{ codigo: string; fecha: Date; vendedor: string | null }[]>`
    SELECT DISTINCT ON (l."producto_codigo") l."producto_codigo" AS codigo, f."fecha" AS fecha, f."vendedor_id"::text AS vendedor
    FROM "factura_linea" l JOIN "factura" f ON f."id" = l."factura_id" WHERE f."estado" = 'EMITIDA'
    ORDER BY l."producto_codigo", f."fecha" DESC, f."numero" DESC`;
  return new Map(r.map((x) => [x.codigo, { fecha: x.fecha, vendedorId: x.vendedor }]));
}

/** Última entrada por compra (recepción de una orden) de cada producto. */
export async function ultimasCompras(db: Db): Promise<Map<string, Date>> {
  const r = await db.$queryRaw<{ codigo: string; fecha: Date }[]>`
    SELECT l."producto_codigo" AS codigo, MAX(r."fecha") AS fecha FROM "recepcion_linea" l JOIN "recepcion" r ON r."id" = l."recepcion_id" GROUP BY l."producto_codigo"`;
  return new Map(r.map((x) => [x.codigo, diaCaracas(x.fecha)]));
}

/** Existencia total (todos los almacenes) por producto. */
export async function existenciasTotales(db: Db): Promise<Map<string, number>> {
  const r = await db.existencia.groupBy({ by: ["productoCodigo"], _sum: { cantidad: true } });
  return new Map(r.map((x) => [x.productoCodigo, Number(x._sum.cantidad ?? 0)]));
}

const dia = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/** «Artículos agotados» (existencia 0) o «negativos» (menor que 0) cuya última venta cae en el rango. */
export async function reporteSinExistencia(db: Db, v: Record<string, string>, negativos: boolean): Promise<Resultado> {
  const desde = aFecha(v.desde), hasta = aFecha(v.hasta);
  const [productos, stock, ventas, compras, vendedores] = await Promise.all([
    db.producto.findMany({ where: v.activos === "si" ? { activo: true } : {}, select: { codigo: true, descripcion: true, activo: true, proveedores: { take: 1, orderBy: { creadoEn: "asc" }, select: { proveedor: { select: { razonSocial: true } } } } } }),
    existenciasTotales(db), ultimasVentas(db), ultimasCompras(db), db.vendedor.findMany({ select: { id: true, nombre: true } }),
  ]);
  const nombreVendedor = new Map(vendedores.map((x) => [x.id, x.nombre]));
  const notas = [negativos ? "Productos con existencia menor que cero cuya última venta cae en el rango. El sistema no deja vender sin existencia, así que normalmente no habrá ninguno." : "Productos sin existencia (sumando todos los almacenes) cuya última venta cae en el rango."];
  let filas: Fila[] = productos.flatMap((p) => {
    const existencia = stock.get(p.codigo) ?? 0;
    const u = ventas.get(p.codigo);
    if (negativos ? existencia >= 0 : existencia !== 0) return [];
    if (!u || u.fecha < desde || u.fecha > hasta) return [];
    return [{ codigo: p.codigo, descripcion: p.descripcion, estado: p.activo ? "Activo" : "Inactivo", ultimaVenta: dia(u.fecha), ultimaCompra: compras.get(p.codigo) ?? null, vendedor: u.vendedorId ? nombreVendedor.get(u.vendedorId) ?? "" : "", proveedor: p.proveedores[0]?.proveedor.razonSocial ?? "", existencia, _enlace: `/gerencial/articulo?codigo=${encodeURIComponent(p.codigo)}` }];
  });
  filas.sort((a, b) => (b.ultimaVenta as Date).getTime() - (a.ultimaVenta as Date).getTime() || String(a.descripcion).localeCompare(String(b.descripcion)));
  filas = recortar(filas, notas);
  return {
    columnas: [
      { clave: "codigo", titulo: "Código", tipo: "texto" }, { clave: "descripcion", titulo: "Descripción", tipo: "texto" }, { clave: "estado", titulo: "Estado", tipo: "texto" }, { clave: "ultimaVenta", titulo: "Última venta", tipo: "fecha" },
      { clave: "ultimaCompra", titulo: "Última compra", tipo: "fecha" }, { clave: "vendedor", titulo: "Vendedor", tipo: "texto" }, { clave: "proveedor", titulo: "Proveedor", tipo: "texto" }, { clave: "existencia", titulo: "Existencia", tipo: "numero" },
    ],
    filas, notas,
  };
}

/** «Artículos sin vender»: con existencia y sin venta desde hace N días; primero los de más dinero inmovilizado. */
export async function reporteSinVender(db: Db, v: Record<string, string>): Promise<Resultado> {
  const dias = Number(v.tiempo);
  const hoy = hoyCaracas();
  const limite = new Date(hoy.getTime() - dias * 86_400_000);
  const [productos, stock, ventas] = await Promise.all([
    db.producto.findMany({ where: v.activos === "si" ? { activo: true } : {}, select: { codigo: true, descripcion: true, precioLista: true, ultimoCosto: true } }),
    existenciasTotales(db), ultimasVentas(db),
  ]);
  const notas = [`Productos con existencia cuya última venta es de hace ${dias} días o más${v.nunca === "si" ? ", y los que nunca se han vendido" : ""}.`];
  let filas: Fila[] = productos.flatMap((p) => {
    const existencia = stock.get(p.codigo) ?? 0;
    if (existencia <= 0) return [];
    const u = ventas.get(p.codigo);
    if (u ? u.fecha > limite : v.nunca !== "si") return [];
    const costo = Number(p.ultimoCosto);
    return [{ codigo: p.codigo, descripcion: p.descripcion, existencia, precio: Number(p.precioLista), costo, valorizado: redondear2(existencia * costo), ultimaVenta: u ? dia(u.fecha) : "Nunca vendido", dias: u ? Math.round((hoy.getTime() - dia(u.fecha).getTime()) / 86_400_000) : null, _enlace: `/gerencial/articulo?codigo=${encodeURIComponent(p.codigo)}` }];
  });
  filas.sort((a, b) => (b.valorizado as number) - (a.valorizado as number) || String(a.codigo).localeCompare(String(b.codigo)));
  const total = redondear2(filas.reduce((s, f) => s + (f.valorizado as number), 0));
  filas = recortar(filas, notas);
  return {
    columnas: [
      { clave: "codigo", titulo: "Código", tipo: "texto" }, { clave: "descripcion", titulo: "Descripción", tipo: "texto" }, { clave: "existencia", titulo: "Existencia", tipo: "numero" }, { clave: "precio", titulo: "Precio lista USD", tipo: "moneda" },
      { clave: "costo", titulo: "Último costo USD", tipo: "moneda" }, { clave: "valorizado", titulo: "Valor en inventario USD", tipo: "moneda" }, { clave: "ultimaVenta", titulo: "Última venta", tipo: "fecha" }, { clave: "dias", titulo: "Días", tipo: "entero" },
    ],
    filas, totales: { valorizado: total }, notas,
  };
}

/** «Precios cambiados»: líneas facturadas a un precio distinto del que proponía el sistema. */
export async function reportePreciosCambiados(db: Db, v: Record<string, string>): Promise<Resultado> {
  const lineas = await db.facturaLinea.findMany({
    where: { precioOriginal: { gt: 0 }, factura: { estado: "EMITIDA", fecha: { gte: aFecha(v.desde), lte: aFecha(v.hasta) }, ...(v.vendedor ? { vendedorId: v.vendedor } : {}) } },
    include: { factura: { select: { id: true, numero: true, fecha: true, vendedorId: true, cliente: { select: { razonSocial: true } } } }, producto: { select: { descripcion: true } } },
    orderBy: [{ factura: { fecha: "desc" } }, { factura: { numero: "desc" } }],
  });
  const vendedores = new Map((await db.vendedor.findMany({ select: { id: true, nombre: true } })).map((x) => [x.id, x.nombre]));
  const notas = ["El precio original es el que proponía el sistema (lista del cliente o promoción) al hacer la línea, por unidad base y antes de descuentos. Las líneas hechas antes de esta versión no lo tienen."];
  let filas: Fila[] = lineas.flatMap((l) => {
    const original = Number(l.precioOriginal), venta = Number(l.precioUnitario), cantidad = Number(l.cantidad);
    if (Math.abs(venta - original) <= 1e-4) return [];
    if (v.ceros !== "si" && !(venta > 0 && cantidad > 0)) return [];
    return [{ documento: numeroFactura(l.factura.numero), fecha: l.factura.fecha, codigo: l.productoCodigo, descripcion: l.producto.descripcion, vendedor: l.factura.vendedorId ? vendedores.get(l.factura.vendedorId) ?? "" : "", cliente: l.factura.cliente.razonSocial, cantidad, original: redondear2(original), venta: redondear2(venta), diferencia: redondear2(venta - original), pct: redondear2(((venta - original) / original) * 100), _enlace: `/facturacion/${l.factura.id}` }];
  });
  filas = recortar(filas, notas);
  return {
    columnas: [
      { clave: "documento", titulo: "Factura", tipo: "texto" }, { clave: "fecha", titulo: "Fecha", tipo: "fecha" }, { clave: "codigo", titulo: "Código", tipo: "texto" }, { clave: "descripcion", titulo: "Producto", tipo: "texto" }, { clave: "vendedor", titulo: "Vendedor", tipo: "texto" }, { clave: "cliente", titulo: "Cliente", tipo: "texto" },
      { clave: "cantidad", titulo: "Cantidad", tipo: "numero" }, { clave: "original", titulo: "Precio original", tipo: "moneda" }, { clave: "venta", titulo: "Precio de venta", tipo: "moneda" }, { clave: "diferencia", titulo: "Diferencia", tipo: "moneda" }, { clave: "pct", titulo: "% dif.", tipo: "numero" },
    ],
    filas, notas,
  };
}

/** «Ofertas»: promociones vigentes en una fecha, con lo vendido de cada producto mientras duraron. */
export async function reporteOfertas(db: Db, v: Record<string, string>): Promise<Resultado> {
  const al = aFecha(v.al);
  const promos = await db.promocion.findMany({
    where: v.todas === "si" ? {} : { desde: { lte: al }, hasta: { gte: al } },
    include: { producto: { select: { descripcion: true, precioLista: true } }, presentacion: { include: { unidadMedida: { select: { nombre: true } } } } },
    orderBy: [{ hasta: "desc" }, { productoCodigo: "asc" }], take: 500,
  });
  const [stock, ventas] = await Promise.all([existenciasTotales(db), ultimasVentas(db)]);
  const hoy = hoyCaracas();
  const filas: Fila[] = [];
  for (const p of promos) {
    const vendidas = await lineasDeVenta(db, dia(p.desde), dia(p.hasta), { productoCodigo: p.productoCodigo });
    const signo = (t: string) => (t === "DEV" ? -1 : 1);
    filas.push({
      codigo: p.productoCodigo, descripcion: p.producto.descripcion, lista: p.lista ?? "Todas", unidad: p.presentacion?.unidadMedida.nombre ?? "", existencia: stock.get(p.productoCodigo) ?? 0, desde: p.desde, hasta: p.hasta,
      restan: Math.max(0, Math.round((dia(p.hasta).getTime() - hoy.getTime()) / 86_400_000)), compra: Number(p.cantidadRequerida) || null, lleva: Number(p.cantidadOtorgada) || null, descuento: p.descuentoPct === null ? null : Number(p.descuentoPct),
      normal: Number(p.producto.precioLista), oferta: p.precioUsd === null ? null : Number(p.precioUsd),
      unidades: vendidas.reduce((s, l) => s + signo(l.tipo) * l.cantidad, 0), monto: redondear2(vendidas.reduce((s, l) => s + signo(l.tipo) * l.monto, 0)), ultimaVenta: ventas.get(p.productoCodigo)?.fecha ?? null,
      _enlace: `/reportes/detalle-ventas?desde=${dia(p.desde).toISOString().slice(0, 10)}&hasta=${dia(p.hasta).toISOString().slice(0, 10)}&producto=${encodeURIComponent(p.productoCodigo)}`,
    });
  }
  return {
    columnas: [
      { clave: "codigo", titulo: "Código", tipo: "texto" }, { clave: "descripcion", titulo: "Producto", tipo: "texto" }, { clave: "lista", titulo: "Lista", tipo: "texto" }, { clave: "unidad", titulo: "Unidad", tipo: "texto" }, { clave: "existencia", titulo: "Existencia", tipo: "numero" },
      { clave: "desde", titulo: "Desde", tipo: "fecha" }, { clave: "hasta", titulo: "Hasta", tipo: "fecha" }, { clave: "restan", titulo: "Días restantes", tipo: "entero" }, { clave: "compra", titulo: "Compra", tipo: "numero" }, { clave: "lleva", titulo: "Lleva", tipo: "numero" }, { clave: "descuento", titulo: "% desc.", tipo: "numero" },
      { clave: "normal", titulo: "Precio normal", tipo: "moneda" }, { clave: "oferta", titulo: "Precio oferta", tipo: "moneda" }, { clave: "unidades", titulo: "Und. vendidas en la promoción", tipo: "numero" }, { clave: "monto", titulo: "Monto neto USD", tipo: "moneda" }, { clave: "ultimaVenta", titulo: "Última venta", tipo: "fecha" },
    ],
    filas,
    notas: ["Pulsa el código para ver las ventas hechas durante la promoción. Lo vendido es neto de devoluciones. El precio normal es el de la lista A."],
  };
}
