import "server-only";
import type { Db } from "@/lib/tenant";
import { hoyCaracas } from "@/lib/tasas";
import { reporteOfertas, reportePreciosCambiados, reporteSinExistencia, reporteSinVender } from "./gerencial-articulos";
import { BASES_COMPRA, reporteComprasPorProveedor, reporteComprasSugeridas, reporteDetalleVentas, reporteDocumentosVenta, reporteMovimientoPeriodo, reporteMovimientos, reporteVentasPorVendedorPeriodos } from "./gerencial-movimientos";
import type { DefReporte } from "./registro";
import type { Opcion, Parametro } from "./tipos";

// Catálogo del módulo Gerencial (original: menú «Gerencial» del sistema anterior). Usan el mismo motor que los demás reportes.

const fechas = (desde: "inicioMes" | "inicioAnio" = "inicioMes"): Parametro[] => [{ id: "desde", etiqueta: "Desde", tipo: "fecha", defecto: desde }, { id: "hasta", etiqueta: "Hasta", tipo: "fecha", defecto: "hoy" }];
const opciones = (id: string, etiqueta: string, lista: Opcion[], defecto = lista[0]?.valor ?? ""): Parametro => ({ id, etiqueta, tipo: "opciones", opciones: lista, defecto });
const siNo = (id: string, etiqueta: string, defecto: "si" | "no") => opciones(id, etiqueta, [{ valor: "si", etiqueta: "Sí" }, { valor: "no", etiqueta: "No" }], defecto);
const texto = (id: string, etiqueta: string, ayuda?: string): Parametro => ({ id, etiqueta, tipo: "texto", ayuda });
const producto = () => texto("producto", "Producto (opcional)", "Código del producto");

const periodo = (): Parametro[] => {
  const anio = hoyCaracas().getUTCFullYear();
  const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  return [
    opciones("anio", "Año", Array.from({ length: 6 }, (_x, k) => ({ valor: String(anio - k), etiqueta: String(anio - k) }))),
    opciones("mes", "Mes", [{ valor: "", etiqueta: "Todo el año, mes por mes" }, ...meses.map((m, k) => ({ valor: String(k + 1), etiqueta: m }))], ""),
    opciones("vista", "Vista", [{ valor: "comparar", etiqueta: "Comparar clientes y filial" }, { valor: "CLI", etiqueta: "Solo clientes" }, { valor: "FIL", etiqueta: "Solo filial" }, { valor: "GEN", etiqueta: "General (todos)" }]),
  ];
};

async function vendedores(db: Db): Promise<Parametro> {
  const r = await db.vendedor.findMany({ where: { esVendedor: true }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true, codigo: true } });
  return opciones("vendedor", "Vendedor", [{ valor: "", etiqueta: "Todos" }, ...r.map((x) => ({ valor: x.id, etiqueta: `${x.nombre} (${x.codigo})` }))], "");
}

const G = "Gerencial" as const;

export const REPORTES_GERENCIALES: DefReporte[] = [
  { id: "articulos-agotados", grupo: G, titulo: "Artículos agotados", descripcion: "Productos sin existencia cuya última venta cae en el rango de fechas.", parametros: () => [...fechas("inicioAnio"), siNo("activos", "Solo productos activos", "si")], consultar: (db, v) => reporteSinExistencia(db, v, false) },
  { id: "articulos-negativos", grupo: G, titulo: "Artículos negativos", descripcion: "Productos con existencia menor que cero cuya última venta cae en el rango de fechas.", parametros: () => [...fechas("inicioAnio"), siNo("activos", "Solo productos activos", "si")], consultar: (db, v) => reporteSinExistencia(db, v, true) },
  {
    id: "articulos-sin-vender", grupo: G, titulo: "Artículos sin vender", descripcion: "Productos con existencia que no se venden desde hace un tiempo.",
    parametros: () => [opciones("tiempo", "Sin vender desde hace", [{ valor: "15", etiqueta: "15 días" }, { valor: "30", etiqueta: "1 mes" }, { valor: "60", etiqueta: "2 meses" }, { valor: "90", etiqueta: "3 meses" }, { valor: "180", etiqueta: "6 meses" }, { valor: "365", etiqueta: "12 meses" }, { valor: "730", etiqueta: "24 meses" }], "90"), siNo("nunca", "Incluir los nunca vendidos", "si"), siNo("activos", "Solo productos activos", "si")],
    consultar: reporteSinVender,
  },
  { id: "precios-cambiados", grupo: G, titulo: "Precios cambiados", descripcion: "Líneas facturadas a un precio distinto del que proponía el sistema.", parametros: async (db) => [...fechas(), await vendedores(db), siNo("ceros", "Incluir precio o cantidad en cero", "no")], consultar: reportePreciosCambiados },
  { id: "ofertas", grupo: G, titulo: "Ofertas", descripcion: "Promociones vigentes en una fecha y lo vendido mientras duran.", parametros: () => [{ id: "al", etiqueta: "Vigentes al", tipo: "fecha", defecto: "hoy" }, siNo("todas", "Todas las promociones", "no")], consultar: reporteOfertas },
  { id: "movimiento-facturacion", grupo: G, titulo: "Movimiento de facturación", descripcion: "Facturas y devoluciones del año mes por mes, y de cada mes día por día.", parametros: periodo, consultar: (db, v) => reporteMovimientoPeriodo(db, v, false) },
  { id: "movimiento-producto", grupo: G, titulo: "Movimiento de productos por período", descripcion: "Líneas y unidades vendidas y devueltas, mes por mes y día por día.", parametros: periodo, consultar: (db, v) => reporteMovimientoPeriodo(db, v, true) },
  { id: "movimientos-clientes", grupo: G, titulo: "Movimientos por cliente", descripcion: "Lo facturado y devuelto a cada cliente; al elegirlo, los productos que compró.", parametros: () => [...fechas(), producto()], consultar: (db, v) => reporteMovimientos(db, v, "cliente") },
  { id: "movimiento-items", grupo: G, titulo: "Movimiento por producto", descripcion: "Ventas, devoluciones y margen de cada producto en un rango.", parametros: () => [...fechas(), producto(), { id: "cliente", etiqueta: "", tipo: "texto", oculto: true }], consultar: (db, v) => reporteMovimientos(db, v, "producto") },
  { id: "productos-por-vendedor", grupo: G, titulo: "Productos por vendedor", descripcion: "Qué vendedores vendieron un producto, y cuánto.", parametros: () => [...fechas(), texto("producto", "Producto", "Código del producto")], consultar: (db, v) => reporteMovimientos(db, v, "vendedor") },
  { id: "ventas-por-vendedor", grupo: G, titulo: "Ventas por vendedor", descripcion: "Ventas netas de cada vendedor en el día, la semana, el mes, el año y los 3, 6, 9 y 12 meses anteriores.", parametros: () => [{ id: "dia", etiqueta: "Día de consulta", tipo: "fecha", defecto: "hoy" }], consultar: reporteVentasPorVendedorPeriodos },
  { id: "compras-por-proveedor", grupo: G, titulo: "Compras por proveedor", descripcion: "Compras netas de cada proveedor por período, nacionales e importadas.", parametros: () => [{ id: "dia", etiqueta: "Día de consulta", tipo: "fecha", defecto: "hoy" }], consultar: reporteComprasPorProveedor },
  {
    id: "compras-sugeridas", grupo: G, titulo: "Compras sugeridas", descripcion: "Cuánto conviene comprar de cada producto de un proveedor según lo vendido y la existencia.",
    parametros: async (db) => {
      const provs = await db.proveedor.findMany({ where: { productos: { some: {} } }, orderBy: { razonSocial: "asc" }, select: { id: true, razonSocial: true } });
      return [
        opciones("proveedor", "Proveedor", [{ valor: "", etiqueta: "Elegir…" }, ...provs.map((p) => ({ valor: p.id, etiqueta: p.razonSocial }))], ""),
        opciones("base", "Promedio base", BASES_COMPRA, "3"),
        opciones("cobertura", "Meses a cubrir", [{ valor: "base", etiqueta: "Los del período base" }, ...["0.5", "1", "2", "3", "6", "12"].map((x) => ({ valor: x, etiqueta: x.replace(".", ",") }))], "base"),
        siNo("solo", "Solo los que hay que comprar", "si"),
      ];
    },
    consultar: (db, v) => reporteComprasSugeridas(db, v),
  },
  // Detalles a los que se llega desde los anteriores.
  { id: "detalle-ventas", grupo: G, oculto: true, titulo: "Detalle de ventas", descripcion: "Líneas vendidas y devueltas.", parametros: () => [...fechas(), producto(), { id: "cliente", etiqueta: "", tipo: "texto", oculto: true }, { id: "vendedor", etiqueta: "", tipo: "texto", oculto: true }], consultar: reporteDetalleVentas },
  { id: "documentos-venta", grupo: G, oculto: true, titulo: "Documentos de venta", descripcion: "Facturas y notas de crédito del rango.", parametros: () => fechas(), consultar: reporteDocumentosVenta },
];
