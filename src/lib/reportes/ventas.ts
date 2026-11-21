import "server-only";
import type { Db } from "@/lib/tenant";
import { calcularLinea } from "@/lib/pedidos/calculos";
import { aFecha, redondear2 } from "./ayudas";
import type { Fila, Resultado } from "./tipos";

// Ventas, costo y margen en USD (los montos en Bs. son los de cada factura con su tasa congelada). Solo facturas EMITIDAS: las anuladas no cuentan.
type Acum = { facturas: number; ventas: number; iva: number; total: number; totalBs: number; costo: number };
const vacio = (): Acum => ({ facturas: 0, ventas: 0, iva: 0, total: 0, totalBs: 0, costo: 0 });

export async function reporteVentas(db: Db, v: Record<string, string>): Promise<Resultado> {
  const desde = aFecha(v.desde), hasta = aFecha(v.hasta);
  const facturas = await db.factura.findMany({
    where: { estado: "EMITIDA", fecha: { gte: desde, lte: hasta } },
    include: { cliente: { select: { id: true, razonSocial: true, documento: true } }, lineas: { include: { producto: { select: { descripcion: true } } } } },
    orderBy: { fecha: "asc" },
  });
  const porcentaje = (a: number, b: number) => (a > 0 ? redondear2(((a - b) / a) * 100) : 0);

  if (v.agrupar === "producto") {
    const m = new Map<string, { codigo: string; descripcion: string; cantidad: number; ventas: number; costo: number }>();
    for (const f of facturas) for (const l of f.lineas) {
      const x = m.get(l.productoCodigo) ?? { codigo: l.productoCodigo, descripcion: l.producto.descripcion, cantidad: 0, ventas: 0, costo: 0 };
      x.cantidad += Number(l.cantidad);
      x.ventas += calcularLinea({ cantidad: Number(l.cantidad), costoUnitario: Number(l.precioUnitario), descuento: Number(l.descuento), ivaPorcentaje: 0 }).neto;
      x.costo += Number(l.cantidad) * Number(l.costoUnitario);
      m.set(l.productoCodigo, x);
    }
    const lista = [...m.values()].sort((x, y) => y.ventas - x.ventas);
    const filas: Fila[] = lista.map((x) => ({ codigo: x.codigo, descripcion: x.descripcion, cantidad: x.cantidad, ventas: redondear2(x.ventas), costo: redondear2(x.costo), margen: redondear2(x.ventas - x.costo), pct: porcentaje(x.ventas, x.costo) }));
    const t = lista.reduce((s, x) => ({ cantidad: s.cantidad + x.cantidad, ventas: s.ventas + x.ventas, costo: s.costo + x.costo }), { cantidad: 0, ventas: 0, costo: 0 });
    return {
      columnas: [
        { clave: "codigo", titulo: "Código", tipo: "texto" }, { clave: "descripcion", titulo: "Producto", tipo: "texto" }, { clave: "cantidad", titulo: "Cantidad vendida", tipo: "numero" },
        { clave: "ventas", titulo: "Ventas USD (sin IVA)", tipo: "moneda" }, { clave: "costo", titulo: "Costo USD", tipo: "moneda" }, { clave: "margen", titulo: "Margen USD", tipo: "moneda" }, { clave: "pct", titulo: "Margen %", tipo: "numero" },
      ],
      filas, totales: { cantidad: t.cantidad, ventas: redondear2(t.ventas), costo: redondear2(t.costo), margen: redondear2(t.ventas - t.costo) },
      notas: ["El costo es el costo promedio que tenía el producto al facturar. Ventas sin IVA, después de descuentos."],
    };
  }

  const grupos = new Map<string, { etiqueta: string; extra: string; fecha?: Date; a: Acum }>();
  for (const f of facturas) {
    const clave = v.agrupar === "dia" ? f.fecha.toISOString().slice(0, 10) : v.agrupar === "mes" ? f.fecha.toISOString().slice(0, 7) : f.cliente.id;
    const g = grupos.get(clave) ?? { etiqueta: v.agrupar === "cliente" ? f.cliente.razonSocial : clave, extra: v.agrupar === "cliente" ? f.cliente.documento : "", fecha: v.agrupar === "dia" ? f.fecha : undefined, a: vacio() };
    g.a.facturas += 1;
    g.a.ventas += Number(f.subtotal);
    g.a.iva += Number(f.iva);
    g.a.total += Number(f.total);
    g.a.totalBs += Number(f.totalBs);
    g.a.costo += f.lineas.reduce((s, l) => s + Number(l.cantidad) * Number(l.costoUnitario), 0);
    grupos.set(clave, g);
  }
  const lista = [...grupos.values()];
  if (v.agrupar === "cliente") lista.sort((a, b) => b.a.total - a.a.total);
  const filas: Fila[] = lista.map((g) => ({
    grupo: g.fecha ?? g.etiqueta, documento: g.extra, facturas: g.a.facturas, ventas: redondear2(g.a.ventas), iva: redondear2(g.a.iva), total: redondear2(g.a.total), totalBs: redondear2(g.a.totalBs),
    costo: redondear2(g.a.costo), margen: redondear2(g.a.ventas - g.a.costo),
  }));
  const sum = (k: string) => redondear2(filas.reduce((s, f) => s + (f[k] as number), 0));
  const titulo = { cliente: "Cliente", dia: "Día", mes: "Mes (AAAA-MM)" }[v.agrupar] ?? "Cliente";
  return {
    columnas: [
      { clave: "grupo", titulo, tipo: v.agrupar === "dia" ? "fecha" : "texto" },
      ...(v.agrupar === "cliente" ? [{ clave: "documento", titulo: "RIF", tipo: "texto" as const }] : []),
      { clave: "facturas", titulo: "Facturas", tipo: "entero" }, { clave: "ventas", titulo: "Ventas USD (sin IVA)", tipo: "moneda" }, { clave: "iva", titulo: "IVA USD", tipo: "moneda" },
      { clave: "total", titulo: "Total USD", tipo: "moneda" }, { clave: "totalBs", titulo: "Total Bs.", tipo: "moneda" }, { clave: "costo", titulo: "Costo USD", tipo: "moneda" }, { clave: "margen", titulo: "Margen USD", tipo: "moneda" },
    ],
    filas,
    totales: { facturas: filas.reduce((s, f) => s + (f.facturas as number), 0), ventas: sum("ventas"), iva: sum("iva"), total: sum("total"), totalBs: sum("totalBs"), costo: sum("costo"), margen: sum("margen") },
    notas: ["Solo facturas emitidas (las anuladas no cuentan). El total en Bs. es el de cada factura con su tasa del día."],
  };
}
