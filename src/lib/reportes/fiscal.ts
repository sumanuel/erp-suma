import "server-only";
import type { Db } from "@/lib/tenant";
import { calcularLinea } from "@/lib/pedidos/calculos";
import { numeroFactura } from "@/lib/facturacion/estados";
import { aFecha } from "./ayudas";
import type { Columna, Fila, Resultado } from "./tipos";

// Libros fiscales de IVA (ventas y compras) y resumen del período, en bolívares. Cada documento se toma con su tasa congelada y se reparte por alícuota en
// centavos enteros, de modo que las bases y el IVA suman EXACTAMENTE lo que contabilizó el asiento automático (base = subtotal × tasa; IVA = total − base).
// Las facturas anuladas se listan con montos en cero, como exige el libro. REVISAR con el contador de cada cliente el formato y las columnas que pida el SENIAT.

type Asiento = { exenta: number; porAlicuota: Map<number, { base: number; iva: number }> };
type Registro = { fecha: Date; rif: string; nombre: string; numero: string; control: string; total: number; anulada: boolean; sinNumeroFiscal: boolean; obs: string } & Asiento;

const c = (n: number) => Math.round(n * 100); // a centavos
const aBs = (centavos: number) => centavos / 100;

/** Reparte el total de la base entre alícuotas respetando que sumen exactamente `objetivo` (el residuo va a la mayor). */
function ajustar(partes: Map<number, number>, objetivo: number) {
  const suma = [...partes.values()].reduce((s, x) => s + x, 0);
  if (partes.size === 0 || suma === objetivo) return;
  const mayor = [...partes.entries()].sort((a, b) => b[1] - a[1])[0][0];
  partes.set(mayor, (partes.get(mayor) ?? 0) + (objetivo - suma));
}

async function registrosVentas(db: Db, desde: Date, hasta: Date): Promise<Registro[]> {
  const facturas = await db.factura.findMany({
    where: { fecha: { gte: desde, lte: hasta } },
    include: { cliente: { select: { documento: true, razonSocial: true } }, lineas: true },
    orderBy: [{ fecha: "asc" }, { numero: "asc" }],
  });
  return facturas.map((f) => {
    const anulada = f.estado === "ANULADA";
    const base: Registro = { fecha: f.fecha, rif: f.cliente.documento, nombre: f.cliente.razonSocial, numero: f.numeroFiscal ?? numeroFactura(f.numero), control: f.numeroControl ?? "", total: 0, anulada, sinNumeroFiscal: !f.numeroFiscal, obs: anulada ? "ANULADA" : "", exenta: 0, porAlicuota: new Map() };
    if (anulada) return base;
    const tasa = Number(f.tasaUsd);
    const neto = new Map<number, number>();
    for (const l of f.lineas) {
      const r = Number(l.ivaPorcentaje);
      neto.set(r, (neto.get(r) ?? 0) + calcularLinea({ cantidad: Number(l.cantidad), costoUnitario: Number(l.precioUnitario), descuento: Number(l.descuento), ivaPorcentaje: r }).neto);
    }
    const bases = new Map([...neto].map(([r, n]) => [r, c(n * tasa)]));
    ajustar(bases, c(Number(f.subtotal) * tasa));
    const total = c(Number(f.totalBs));
    const ivaTotal = total - [...bases.values()].reduce((s, x) => s + x, 0);
    const ivas = new Map<number, number>();
    for (const [r, b] of bases) if (r > 0) ivas.set(r, Math.round((b * r) / 100));
    ajustar(ivas, ivaTotal);
    for (const [r, b] of bases) {
      if (r === 0) base.exenta += b;
      else base.porAlicuota.set(r, { base: b, iva: ivas.get(r) ?? 0 });
    }
    base.total = total;
    return base;
  });
}

async function registrosCompras(db: Db, desde: Date, hasta: Date): Promise<Registro[]> {
  const [facturas, alicuotas] = await Promise.all([
    db.facturaCompra.findMany({ where: { fecha: { gte: desde, lte: hasta } }, include: { proveedor: { select: { documento: true, razonSocial: true } } }, orderBy: [{ fecha: "asc" }, { numero: "asc" }] }),
    db.alicuotaIva.findMany({ where: { activo: true, porcentajeCompra: { gt: 0 } }, select: { porcentajeCompra: true } }),
  ]);
  const tasas = [...new Set(alicuotas.map((a) => Number(a.porcentajeCompra)))];
  return facturas.map((f) => {
    const anulada = f.estado === "ANULADA";
    const base: Registro = { fecha: f.fecha, rif: f.proveedor.documento, nombre: f.proveedor.razonSocial, numero: f.documento, control: f.numeroControl ?? "", total: 0, anulada, sinNumeroFiscal: false, obs: anulada ? "ANULADA" : "", exenta: 0, porAlicuota: new Map() };
    if (anulada) return base;
    const tasa = Number(f.tasaUsd);
    const baseBs = c(Number(f.subtotal) * tasa);
    const total = c(Number(f.total) * tasa);
    const iva = total - baseBs;
    base.total = total;
    if (iva === 0) base.exenta = baseBs;
    else {
      // Se deduce la alícuota por la proporción IVA/base y se toma la más cercana de las configuradas.
      const prop = (Number(f.iva) / Number(f.subtotal)) * 100;
      const r = tasas.length ? tasas.reduce((m, x) => (Math.abs(x - prop) < Math.abs(m - prop) ? x : m)) : Math.round(prop);
      if (Math.abs(r - prop) > 0.5) base.obs = `IVA ${prop.toFixed(2)} % no coincide con una alícuota`;
      base.porAlicuota.set(r, { base: baseBs, iva });
    }
    return base;
  });
}

function columnasLibro(registros: Registro[], terceroEtiqueta: string, numeroEtiqueta: string): { columnas: Columna[]; alicuotas: number[] } {
  const alicuotas = [...new Set(registros.flatMap((r) => [...r.porAlicuota.keys()]))].sort((a, b) => b - a);
  return {
    alicuotas,
    columnas: [
      { clave: "n", titulo: "Nº", tipo: "entero" }, { clave: "fecha", titulo: "Fecha", tipo: "fecha" }, { clave: "rif", titulo: "RIF", tipo: "texto" }, { clave: "nombre", titulo: terceroEtiqueta, tipo: "texto" },
      { clave: "numero", titulo: numeroEtiqueta, tipo: "texto" }, { clave: "control", titulo: "Nº de control", tipo: "texto" }, { clave: "total", titulo: "Total (IVA incluido) Bs.", tipo: "moneda" }, { clave: "exenta", titulo: "Exentas o no gravadas Bs.", tipo: "moneda" },
      ...alicuotas.flatMap((a): Columna[] => [{ clave: `base_${a}`, titulo: `Base imponible ${a} % Bs.`, tipo: "moneda" }, { clave: `iva_${a}`, titulo: `IVA ${a} % Bs.`, tipo: "moneda" }]),
      { clave: "obs", titulo: "Observaciones", tipo: "texto" },
    ],
  };
}

function armarLibro(registros: Registro[], terceroEtiqueta: string, numeroEtiqueta: string, notas: string[]): Resultado {
  const { columnas, alicuotas } = columnasLibro(registros, terceroEtiqueta, numeroEtiqueta);
  const filas: Fila[] = registros.map((r, i) => {
    const f: Fila = { n: i + 1, fecha: r.fecha, rif: r.rif, nombre: r.nombre, numero: r.numero, control: r.control, total: aBs(r.total), exenta: aBs(r.exenta), obs: r.obs };
    for (const a of alicuotas) { f[`base_${a}`] = aBs(r.porAlicuota.get(a)?.base ?? 0); f[`iva_${a}`] = aBs(r.porAlicuota.get(a)?.iva ?? 0); }
    return f;
  });
  const sumar = (clave: string) => Math.round(filas.reduce((s, f) => s + ((f[clave] as number) ?? 0), 0) * 100) / 100;
  const totales: Record<string, number> = { total: sumar("total"), exenta: sumar("exenta") };
  for (const a of alicuotas) { totales[`base_${a}`] = sumar(`base_${a}`); totales[`iva_${a}`] = sumar(`iva_${a}`); }
  return { columnas, filas, totales, notas };
}

export async function reporteLibroVentas(db: Db, v: Record<string, string>): Promise<Resultado> {
  const r = await registrosVentas(db, aFecha(v.desde), aFecha(v.hasta));
  const sin = r.filter((x) => !x.anulada && x.sinNumeroFiscal).length;
  return armarLibro(r, "Nombre o razón social del cliente", "Nº de factura", [
    "Montos en bolívares con la tasa de cada factura. Las facturas anuladas aparecen con montos en cero.",
    ...(sin ? [`${sin} factura(s) sin número fiscal registrado muestran su número interno (FAC-…): regístralo en la factura para que salga en el libro.`] : []),
    "Falta la columna de retenciones de IVA que le practican los clientes (aún no está modelado). Revisa con tu contador el formato exigido.",
  ]);
}

export async function reporteLibroCompras(db: Db, v: Record<string, string>): Promise<Resultado> {
  const r = await registrosCompras(db, aFecha(v.desde), aFecha(v.hasta));
  return armarLibro(r, "Nombre o razón social del proveedor", "Nº de factura del proveedor", [
    "Montos en bolívares con la tasa de la fecha de cada factura. Las facturas anuladas aparecen con montos en cero.",
    "La factura del proveedor se registra con un solo IVA: la alícuota se deduce de la proporción IVA/base. Importaciones y compras con varias alícuotas aún no están separadas.",
    "Falta la columna de retenciones de IVA practicadas (aún no está modelado). Revisa con tu contador el formato exigido.",
  ]);
}

/** Resumen del período: débito fiscal (ventas) menos crédito fiscal (compras) = IVA a pagar o excedente de crédito. */
export async function reporteResumenIva(db: Db, v: Record<string, string>): Promise<Resultado> {
  const desde = aFecha(v.desde), hasta = aFecha(v.hasta);
  const [ventas, compras] = await Promise.all([registrosVentas(db, desde, hasta), registrosCompras(db, desde, hasta)]);
  const agrupar = (rs: Registro[]) => {
    const m = new Map<number, { base: number; iva: number }>();
    let exenta = 0;
    for (const r of rs) { exenta += r.exenta; for (const [a, x] of r.porAlicuota) { const y = m.get(a) ?? { base: 0, iva: 0 }; y.base += x.base; y.iva += x.iva; m.set(a, y); } }
    return { m, exenta, iva: [...m.values()].reduce((s, x) => s + x.iva, 0) };
  };
  const V = agrupar(ventas), C = agrupar(compras);
  const filas: Fila[] = [{ concepto: "DÉBITO FISCAL (ventas)", base: null, iva: null, _negrita: true }];
  for (const [a, x] of [...V.m].sort((p, q) => q[0] - p[0])) filas.push({ concepto: `Ventas gravadas al ${a} %`, base: aBs(x.base), iva: aBs(x.iva), _nivel: 1 });
  filas.push({ concepto: "Ventas exentas o no gravadas", base: aBs(V.exenta), iva: null, _nivel: 1 }, { concepto: "Total débito fiscal", base: null, iva: aBs(V.iva), _negrita: true });
  filas.push({ concepto: "CRÉDITO FISCAL (compras)", base: null, iva: null, _negrita: true });
  for (const [a, x] of [...C.m].sort((p, q) => q[0] - p[0])) filas.push({ concepto: `Compras gravadas al ${a} %`, base: aBs(x.base), iva: aBs(x.iva), _nivel: 1 });
  filas.push({ concepto: "Compras exentas o no gravadas", base: aBs(C.exenta), iva: null, _nivel: 1 }, { concepto: "Total crédito fiscal", base: null, iva: aBs(C.iva), _negrita: true });
  const cuota = V.iva - C.iva;
  filas.push({ concepto: cuota >= 0 ? "IVA a pagar del período (débito − crédito)" : "Excedente de crédito fiscal (a favor)", base: null, iva: aBs(Math.abs(cuota)), _negrita: true });
  return {
    columnas: [{ clave: "concepto", titulo: "Concepto", tipo: "texto" }, { clave: "base", titulo: "Base imponible Bs.", tipo: "moneda" }, { clave: "iva", titulo: "IVA Bs.", tipo: "moneda" }],
    filas,
    notas: ["No descuenta retenciones de IVA ni excedentes de períodos anteriores (aún no modelados). Es una ayuda para preparar la declaración: valida las cifras con tu contador."],
  };
}

