import "server-only";
import type { Db } from "@/lib/tenant";
import { aFecha, redondear2 } from "./ayudas";
import { documentosDeVenta, lineasDeVenta } from "./movimientos-venta";
import type { Fila, Resultado } from "./tipos";

// Ventas netas, costo y margen en USD: facturas emitidas, menos las notas de crédito (devoluciones y ajustes), más las notas de débito (cargos),
// cada una en la fecha de su documento. Los montos en Bs. son los de cada documento con la tasa congelada de su factura.
type Acum = { facturas: number; ventas: number; iva: number; total: number; totalBs: number; costo: number };
const vacio = (): Acum => ({ facturas: 0, ventas: 0, iva: 0, total: 0, totalBs: 0, costo: 0 });

export async function reporteVentas(db: Db, v: Record<string, string>): Promise<Resultado> {
  const desde = aFecha(v.desde), hasta = aFecha(v.hasta);
  const porcentaje = (a: number, b: number) => (a > 0 ? redondear2(((a - b) / a) * 100) : 0);

  if (v.agrupar === "producto") {
    const m = new Map<string, { codigo: string; descripcion: string; cantidad: number; ventas: number; costo: number }>();
    const lineas = await lineasDeVenta(db, desde, hasta);
    const productos = new Map((await db.producto.findMany({ where: { codigo: { in: [...new Set(lineas.map((l) => l.productoCodigo))] } }, select: { codigo: true, descripcion: true } })).map((p) => [p.codigo, p.descripcion]));
    for (const l of lineas) {
      const x = m.get(l.productoCodigo) ?? { codigo: l.productoCodigo, descripcion: productos.get(l.productoCodigo) ?? l.descripcion, cantidad: 0, ventas: 0, costo: 0 };
      const signo = l.tipo === "DEV" ? -1 : 1;
      x.cantidad += signo * l.cantidad;
      x.ventas += signo * l.monto;
      x.costo += signo * l.costo;
      m.set(l.productoCodigo, x);
    }
    const lista = [...m.values()].sort((x, y) => y.ventas - x.ventas);
    const filas: Fila[] = lista.map((x) => ({ codigo: x.codigo, descripcion: x.descripcion, cantidad: x.cantidad, ventas: redondear2(x.ventas), costo: redondear2(x.costo), margen: redondear2(x.ventas - x.costo), pct: porcentaje(x.ventas, x.costo) }));
    const t = lista.reduce((s, x) => ({ cantidad: s.cantidad + x.cantidad, ventas: s.ventas + x.ventas, costo: s.costo + x.costo }), { cantidad: 0, ventas: 0, costo: 0 });
    return {
      columnas: [
        { clave: "codigo", titulo: "Código", tipo: "texto" }, { clave: "descripcion", titulo: "Producto", tipo: "texto" }, { clave: "cantidad", titulo: "Cantidad neta", tipo: "numero" },
        { clave: "ventas", titulo: "Ventas netas USD (sin IVA)", tipo: "moneda" }, { clave: "costo", titulo: "Costo USD", tipo: "moneda" }, { clave: "margen", titulo: "Margen USD", tipo: "moneda" }, { clave: "pct", titulo: "Margen %", tipo: "numero" },
      ],
      filas, totales: { cantidad: t.cantidad, ventas: redondear2(t.ventas), costo: redondear2(t.costo), margen: redondear2(t.ventas - t.costo) },
      notas: [
        "Cantidades y montos netos: se restan las devoluciones. El costo es el que tenía el producto al facturar. Ventas sin IVA, después de descuentos.",
        "Las notas por monto (ajustes de crédito y cargos de débito) no son de un producto: aquí no aparecen, y sí en las otras formas de agrupar.",
      ],
    };
  }

  // «Ventas por vendedor» (original: lbxCosultaVentaXVendedor): el vendedor es el del documento.
  const documentos = (await documentosDeVenta(db, desde, hasta)).sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
  const vendedores = v.agrupar === "vendedor" ? new Map((await db.vendedor.findMany({ select: { id: true, codigo: true, nombre: true } })).map((x) => [x.id, `${x.nombre} (${x.codigo})`])) : new Map<string, string>();
  const grupos = new Map<string, { etiqueta: string; extra: string; fecha?: Date; a: Acum }>();
  for (const d of documentos) {
    const clave = v.agrupar === "dia" ? d.fecha.toISOString().slice(0, 10) : v.agrupar === "mes" ? d.fecha.toISOString().slice(0, 7) : v.agrupar === "vendedor" ? d.vendedorId ?? "SIN" : d.clienteId;
    const g = grupos.get(clave) ?? {
      etiqueta: v.agrupar === "cliente" ? d.clienteNombre : v.agrupar === "vendedor" ? (d.vendedorId ? vendedores.get(d.vendedorId) ?? "Vendedor eliminado" : "Sin vendedor") : clave,
      extra: v.agrupar === "cliente" ? d.clienteDocumento : "", fecha: v.agrupar === "dia" ? d.fecha : undefined, a: vacio(),
    };
    const signo = d.tipo === "DEV" ? -1 : 1;
    if (d.tipo === "FAV") g.a.facturas += 1;
    g.a.ventas += signo * d.base;
    g.a.iva += signo * d.iva;
    g.a.total += signo * d.total;
    g.a.totalBs += signo * d.totalBs;
    g.a.costo += signo * d.costo;
    grupos.set(clave, g);
  }
  const lista = [...grupos.values()];
  if (v.agrupar === "cliente" || v.agrupar === "vendedor") lista.sort((a, b) => b.a.total - a.a.total);
  const filas: Fila[] = lista.map((g) => ({
    grupo: g.fecha ?? g.etiqueta, documento: g.extra, facturas: g.a.facturas, ventas: redondear2(g.a.ventas), iva: redondear2(g.a.iva), total: redondear2(g.a.total), totalBs: redondear2(g.a.totalBs),
    costo: redondear2(g.a.costo), margen: redondear2(g.a.ventas - g.a.costo),
  }));
  const sum = (k: string) => redondear2(filas.reduce((s, f) => s + (f[k] as number), 0));
  const titulo = { cliente: "Cliente", dia: "Día", mes: "Mes (AAAA-MM)", vendedor: "Vendedor" }[v.agrupar] ?? "Cliente";
  return {
    columnas: [
      { clave: "grupo", titulo, tipo: v.agrupar === "dia" ? "fecha" : "texto" },
      ...(v.agrupar === "cliente" ? [{ clave: "documento", titulo: "RIF", tipo: "texto" as const }] : []),
      { clave: "facturas", titulo: "Facturas", tipo: "entero" }, { clave: "ventas", titulo: "Ventas netas USD (sin IVA)", tipo: "moneda" }, { clave: "iva", titulo: "IVA USD", tipo: "moneda" },
      { clave: "total", titulo: "Total USD", tipo: "moneda" }, { clave: "totalBs", titulo: "Total Bs.", tipo: "moneda" }, { clave: "costo", titulo: "Costo USD", tipo: "moneda" }, { clave: "margen", titulo: "Margen USD", tipo: "moneda" },
    ],
    filas,
    totales: { facturas: filas.reduce((s, f) => s + (f.facturas as number), 0), ventas: sum("ventas"), iva: sum("iva"), total: sum("total"), totalBs: sum("totalBs"), costo: sum("costo"), margen: sum("margen") },
    notas: ["Ventas netas: facturas emitidas menos notas de crédito más notas de débito, cada una en la fecha de su documento (las anuladas no cuentan). El total en Bs. usa la tasa de la factura."],
  };
}
