import "server-only";
import type { Db } from "@/lib/tenant";
import { reporteBalanceGeneral, reporteEstadoResultados } from "./financieros";
import { reporteInventarioValorado } from "./inventario";
import { reporteAntiguedadCxc, reporteAntiguedadCxp } from "./saldos";
import type { MetaReporte, Opcion, Parametro, Resultado } from "./tipos";
import { reporteVentas } from "./ventas";

// Catálogo de reportes. Para agregar uno: una función que devuelve un `Resultado`, y una entrada aquí con sus parámetros. La pantalla, la impresión y el CSV salen solos.
export type DefReporte = MetaReporte & {
  parametros: (db: Db) => Promise<Parametro[]> | Parametro[];
  consultar: (db: Db, valores: Record<string, string>) => Promise<Resultado>;
};

const fechas = (): Parametro[] => [{ id: "desde", etiqueta: "Desde", tipo: "fecha", defecto: "inicioMes" }, { id: "hasta", etiqueta: "Hasta", tipo: "fecha", defecto: "hoy" }];
const vista = (): Parametro => ({ id: "vista", etiqueta: "Vista", tipo: "opciones", defecto: "resumen", opciones: [{ valor: "resumen", etiqueta: "Resumen por tramos" }, { valor: "detalle", etiqueta: "Detalle por factura" }] });

export const REPORTES: DefReporte[] = [
  {
    id: "ventas", titulo: "Ventas, costo y margen", grupo: "Ventas", descripcion: "Ventas del período por cliente, producto, día o mes, con costo y margen.",
    parametros: () => [...fechas(), { id: "agrupar", etiqueta: "Agrupar por", tipo: "opciones", defecto: "cliente", opciones: [{ valor: "cliente", etiqueta: "Cliente" }, { valor: "producto", etiqueta: "Producto" }, { valor: "dia", etiqueta: "Día" }, { valor: "mes", etiqueta: "Mes" }] }],
    consultar: reporteVentas,
  },
  {
    id: "inventario", titulo: "Inventario valorado", grupo: "Inventario", descripcion: "Existencias a costo promedio, por producto o categoría y por almacén.",
    parametros: async (db) => {
      const almacenes: Opcion[] = (await db.almacen.findMany({ orderBy: { nombre: "asc" }, select: { id: true, codigo: true, nombre: true } })).map((a) => ({ valor: a.id, etiqueta: `${a.codigo} · ${a.nombre}` }));
      return [
        { id: "almacen", etiqueta: "Almacén", tipo: "opciones", defecto: "", opciones: [{ valor: "", etiqueta: "Todos los almacenes" }, ...almacenes] },
        { id: "agrupar", etiqueta: "Agrupar por", tipo: "opciones", defecto: "producto", opciones: [{ valor: "producto", etiqueta: "Producto" }, { valor: "categoria", etiqueta: "Categoría" }] },
      ];
    },
    consultar: reporteInventarioValorado,
  },
  { id: "antiguedad-cxc", titulo: "Antigüedad de cuentas por cobrar", grupo: "Cobranza y pagos", descripcion: "Saldos de clientes por tramos de mora, o detalle por factura.", parametros: () => [vista()], consultar: reporteAntiguedadCxc },
  { id: "antiguedad-cxp", titulo: "Antigüedad de cuentas por pagar", grupo: "Cobranza y pagos", descripcion: "Saldos con proveedores por tramos de vencimiento, o detalle por factura.", parametros: () => [vista()], consultar: reporteAntiguedadCxp },
  { id: "balance-general", titulo: "Balance general", grupo: "Contabilidad", descripcion: "Activo, pasivo y patrimonio en bolívares a una fecha.", parametros: () => [{ id: "hasta", etiqueta: "Al", tipo: "fecha", defecto: "hoy" }], consultar: reporteBalanceGeneral },
  { id: "estado-resultados", titulo: "Estado de resultados", grupo: "Contabilidad", descripcion: "Ingresos, costos, gastos y utilidad del período en bolívares.", parametros: () => fechas(), consultar: reporteEstadoResultados },
];

export const buscarReporte = (id: string) => REPORTES.find((r) => r.id === id);
