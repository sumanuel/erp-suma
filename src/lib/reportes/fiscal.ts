import "server-only";
import type { Db } from "@/lib/tenant";
import { calcularLinea } from "@/lib/pedidos/calculos";
import { numeroFactura } from "@/lib/facturacion/estados";
import { numeroNotaVenta } from "@/lib/notas/estados";
import { aFecha } from "./ayudas";
import type { Columna, Fila, Resultado } from "./tipos";

// Libros fiscales de IVA (ventas y compras) y resumen del período, en bolívares. Cada documento se toma con su tasa congelada y se reparte por alícuota en
// centavos enteros, de modo que las bases y el IVA suman EXACTAMENTE lo que contabilizó el asiento automático (base = subtotal × tasa; IVA = total − base).
// Las facturas anuladas se listan con montos en cero, como exige el libro. REVISAR con el contador de cada cliente el formato y las columnas que pida el SENIAT.

type Asiento = { exenta: number; porAlicuota: Map<number, { base: number; iva: number }> };
type Registro = { retComprobante?: string; retIva?: number; fecha: Date; rif: string; nombre: string; numero: string; control: string; total: number; anulada: boolean; sinNumeroFiscal: boolean; obs: string } & Asiento;

const c = (n: number) => Math.round(n * 100); // a centavos
const aBs = (centavos: number) => centavos / 100;

/** Reparte el total de la base entre alícuotas respetando que sumen exactamente `objetivo` (el residuo va a la mayor). */
function ajustar(partes: Map<number, number>, objetivo: number) {
  const suma = [...partes.values()].reduce((s, x) => s + x, 0);
  if (partes.size === 0 || suma === objetivo) return;
  const mayor = [...partes.entries()].sort((a, b) => b[1] - a[1])[0][0];
  partes.set(mayor, (partes.get(mayor) ?? 0) + (objetivo - suma));
}

/** Reparte un documento de venta por alícuota en centavos, de modo que las bases suman round(subtotal × tasa) y el IVA suma (total − base): igual que el asiento. */
function desglosarVenta(neto: Map<number, number>, subtotalUsd: number, totalBs: number, tasa: number) {
  const bases = new Map([...neto].map(([r, n]) => [r, c(n * tasa)]));
  ajustar(bases, c(subtotalUsd * tasa));
  const total = c(totalBs);
  const ivaTotal = total - [...bases.values()].reduce((s, x) => s + x, 0);
  const ivas = new Map<number, number>();
  for (const [r, b] of bases) if (r > 0) ivas.set(r, Math.round((b * r) / 100));
  ajustar(ivas, ivaTotal);
  const out: Asiento & { total: number } = { exenta: 0, porAlicuota: new Map(), total };
  for (const [r, b] of bases) {
    if (r === 0) out.exenta += b;
    else out.porAlicuota.set(r, { base: b, iva: ivas.get(r) ?? 0 });
  }
  return out;
}
const multiplicar = (d: Asiento & { total: number }, signo: 1 | -1): Asiento & { total: number } => ({
  exenta: signo * d.exenta, total: signo * d.total, porAlicuota: new Map([...d.porAlicuota].map(([r, x]) => [r, { base: signo * x.base, iva: signo * x.iva }])),
});

async function registrosVentas(db: Db, desde: Date, hasta: Date): Promise<Registro[]> {
  const [facturas, notas] = await Promise.all([
    db.factura.findMany({ where: { fecha: { gte: desde, lte: hasta } }, include: { cliente: { select: { documento: true, razonSocial: true } }, lineas: true }, orderBy: [{ fecha: "asc" }, { numero: "asc" }] }),
    db.notaVenta.findMany({ where: { fecha: { gte: desde, lte: hasta } }, include: { cliente: { select: { documento: true, razonSocial: true } }, lineas: true, factura: { select: { numero: true, numeroFiscal: true } } }, orderBy: [{ fecha: "asc" }, { numero: "asc" }] }),
  ]);
  const deFacturas: Registro[] = facturas.map((f) => {
    const anulada = f.estado === "ANULADA";
    const base: Registro = { fecha: f.fecha, rif: f.cliente.documento, nombre: f.cliente.razonSocial, numero: f.numeroFiscal ?? numeroFactura(f.numero), control: f.numeroControl ?? "", total: 0, anulada, sinNumeroFiscal: !f.numeroFiscal, obs: anulada ? "ANULADA" : "", exenta: 0, porAlicuota: new Map() };
    if (anulada) return base;
    const neto = new Map<number, number>();
    for (const l of f.lineas) {
      const r = Number(l.ivaPorcentaje);
      neto.set(r, (neto.get(r) ?? 0) + calcularLinea({ cantidad: Number(l.cantidad), costoUnitario: Number(l.precioUnitario), descuento: Number(l.descuento), ivaPorcentaje: r }).neto);
    }
    return { ...base, ...desglosarVenta(neto, Number(f.subtotal), Number(f.totalBs), Number(f.tasaUsd)) };
  });
  // Las notas de crédito restan (montos negativos); las de débito suman. Las anuladas figuran en cero.
  const deNotas: Registro[] = notas.map((n) => {
    const anulada = n.estado === "ANULADA";
    const nombre = n.tipo === "CREDITO" ? "Nota de crédito" : "Nota de débito";
    const base: Registro = { fecha: n.fecha, rif: n.cliente.documento, nombre: n.cliente.razonSocial, numero: n.numeroFiscal ?? numeroNotaVenta(n.tipo, n.numero), control: n.numeroControl ?? "", total: 0, anulada, sinNumeroFiscal: false, obs: `${nombre} sobre ${n.factura.numeroFiscal ?? numeroFactura(n.factura.numero)}${anulada ? " · ANULADA" : ""}`, exenta: 0, porAlicuota: new Map() };
    if (anulada) return base;
    const neto = new Map<number, number>();
    if (n.modo === "DEVOLUCION") for (const l of n.lineas) { const r = Number(l.ivaPorcentaje); neto.set(r, (neto.get(r) ?? 0) + calcularLinea({ cantidad: Number(l.cantidad), costoUnitario: Number(l.precioUnitario), descuento: Number(l.descuento), ivaPorcentaje: r }).neto); }
    else neto.set(Number(n.ivaPorcentaje ?? 0), Number(n.subtotal));
    const tasa = Number(n.tasaUsd);
    return { ...base, ...multiplicar(desglosarVenta(neto, Number(n.subtotal), Math.round(Number(n.total) * tasa * 100) / 100, tasa), n.tipo === "CREDITO" ? -1 : 1) };
  });
  const ret = await db.retencion.findMany({ where: { tipo: "IVA", sentido: "SUFRIDA", estado: "ACTIVA", facturaId: { in: facturas.map((f) => f.id) } }, select: { facturaId: true, comprobante: true, montoBs: true } });
  const porFactura = new Map(ret.map((x) => [x.facturaId, x]));
  facturas.forEach((f, i) => { const x = porFactura.get(f.id); if (x) { deFacturas[i].retComprobante = x.comprobante; deFacturas[i].retIva = c(Number(x.montoBs)); } });
  return [...deFacturas, ...deNotas].sort((x, y) => x.fecha.getTime() - y.fecha.getTime() || (x.obs.includes("Nota") ? 1 : 0) - (y.obs.includes("Nota") ? 1 : 0));
}

async function registrosCompras(db: Db, desde: Date, hasta: Date): Promise<Registro[]> {
  const [facturas, notas, alicuotas] = await Promise.all([
    db.facturaCompra.findMany({ where: { fecha: { gte: desde, lte: hasta } }, include: { proveedor: { select: { documento: true, razonSocial: true } } }, orderBy: [{ fecha: "asc" }, { numero: "asc" }] }),
    db.notaCompra.findMany({ where: { fecha: { gte: desde, lte: hasta } }, include: { proveedor: { select: { documento: true, razonSocial: true } }, factura: { select: { documento: true } } }, orderBy: [{ fecha: "asc" }, { numero: "asc" }] }),
    db.alicuotaIva.findMany({ where: { activo: true, porcentajeCompra: { gt: 0 } }, select: { porcentajeCompra: true } }),
  ]);
  const tasas = [...new Set(alicuotas.map((a) => Number(a.porcentajeCompra)))];
  /** Un documento del proveedor trae un solo IVA: la alícuota se deduce de la proporción IVA/base. */
  const desglosar = (subtotal: number, iva: number, total: number, tasa: number, base: Registro, signo: 1 | -1): Registro => {
    const baseBs = c(subtotal * tasa), totalBs = c(total * tasa), ivaBs = totalBs - baseBs;
    base.total = signo * totalBs;
    if (ivaBs === 0) base.exenta = signo * baseBs;
    else {
      const prop = (iva / subtotal) * 100;
      const r = tasas.length ? tasas.reduce((m, x) => (Math.abs(x - prop) < Math.abs(m - prop) ? x : m)) : Math.round(prop);
      if (Math.abs(r - prop) > 0.5) base.obs = `${base.obs ? `${base.obs} · ` : ""}IVA ${prop.toFixed(2)} % no coincide con una alícuota`;
      base.porAlicuota.set(r, { base: signo * baseBs, iva: signo * ivaBs });
    }
    return base;
  };
  const deFacturas = facturas.map((f) => {
    const anulada = f.estado === "ANULADA";
    const base: Registro = { fecha: f.fecha, rif: f.proveedor.documento, nombre: f.proveedor.razonSocial, numero: f.documento, control: f.numeroControl ?? "", total: 0, anulada, sinNumeroFiscal: false, obs: anulada ? "ANULADA" : "", exenta: 0, porAlicuota: new Map() };
    return anulada ? base : desglosar(Number(f.subtotal), Number(f.iva), Number(f.total), Number(f.tasaUsd), base, 1);
  });
  const deNotas = notas.map((n) => {
    const anulada = n.estado === "ANULADA";
    const nombre = n.tipo === "CREDITO" ? "Nota de crédito" : "Nota de débito";
    const base: Registro = { fecha: n.fecha, rif: n.proveedor.documento, nombre: n.proveedor.razonSocial, numero: n.documento, control: n.numeroControl ?? "", total: 0, anulada, sinNumeroFiscal: false, obs: `${nombre} sobre ${n.factura.documento}${anulada ? " · ANULADA" : ""}`, exenta: 0, porAlicuota: new Map() };
    return anulada ? base : desglosar(Number(n.subtotal), Number(n.iva), Number(n.total), Number(n.tasaUsd), base, n.tipo === "CREDITO" ? -1 : 1);
  });
  const ret = await db.retencion.findMany({ where: { tipo: "IVA", sentido: "PRACTICADA", estado: "ACTIVA", facturaCompraId: { in: facturas.map((f) => f.id) } }, select: { facturaCompraId: true, comprobante: true, montoBs: true } });
  const porFactura = new Map(ret.map((x) => [x.facturaCompraId, x]));
  facturas.forEach((f, i) => { const x = porFactura.get(f.id); if (x) { deFacturas[i].retComprobante = x.comprobante; deFacturas[i].retIva = c(Number(x.montoBs)); } });
  return [...deFacturas, ...deNotas].sort((x, y) => x.fecha.getTime() - y.fecha.getTime() || (x.obs.includes("Nota") ? 1 : 0) - (y.obs.includes("Nota") ? 1 : 0));
}

function columnasLibro(registros: Registro[], terceroEtiqueta: string, numeroEtiqueta: string): { columnas: Columna[]; alicuotas: number[] } {
  const alicuotas = [...new Set(registros.flatMap((r) => [...r.porAlicuota.keys()]))].sort((a, b) => b - a);
  return {
    alicuotas,
    columnas: [
      { clave: "n", titulo: "Nº", tipo: "entero" }, { clave: "fecha", titulo: "Fecha", tipo: "fecha" }, { clave: "rif", titulo: "RIF", tipo: "texto" }, { clave: "nombre", titulo: terceroEtiqueta, tipo: "texto" },
      { clave: "numero", titulo: numeroEtiqueta, tipo: "texto" }, { clave: "control", titulo: "Nº de control", tipo: "texto" }, { clave: "total", titulo: "Total (IVA incluido) Bs.", tipo: "moneda" }, { clave: "exenta", titulo: "Exentas o no gravadas Bs.", tipo: "moneda" },
      ...alicuotas.flatMap((a): Columna[] => [{ clave: `base_${a}`, titulo: `Base imponible ${a} % Bs.`, tipo: "moneda" }, { clave: `iva_${a}`, titulo: `IVA ${a} % Bs.`, tipo: "moneda" }]),
      { clave: "retComp", titulo: "Nº comprobante de retención de IVA", tipo: "texto" }, { clave: "retIva", titulo: "IVA retenido Bs.", tipo: "moneda" },
      { clave: "obs", titulo: "Observaciones", tipo: "texto" },
    ],
  };
}

function armarLibro(registros: Registro[], terceroEtiqueta: string, numeroEtiqueta: string, notas: string[]): Resultado {
  const { columnas, alicuotas } = columnasLibro(registros, terceroEtiqueta, numeroEtiqueta);
  const filas: Fila[] = registros.map((r, i) => {
    const f: Fila = { n: i + 1, fecha: r.fecha, rif: r.rif, nombre: r.nombre, numero: r.numero, control: r.control, total: aBs(r.total), exenta: aBs(r.exenta), retComp: r.retComprobante ?? "", retIva: aBs(r.retIva ?? 0), obs: r.obs };
    for (const a of alicuotas) { f[`base_${a}`] = aBs(r.porAlicuota.get(a)?.base ?? 0); f[`iva_${a}`] = aBs(r.porAlicuota.get(a)?.iva ?? 0); }
    return f;
  });
  const sumar = (clave: string) => Math.round(filas.reduce((s, f) => s + ((f[clave] as number) ?? 0), 0) * 100) / 100;
  const totales: Record<string, number> = { total: sumar("total"), exenta: sumar("exenta"), retIva: sumar("retIva") };
  for (const a of alicuotas) { totales[`base_${a}`] = sumar(`base_${a}`); totales[`iva_${a}`] = sumar(`iva_${a}`); }
  return { columnas, filas, totales, notas };
}

export async function reporteLibroVentas(db: Db, v: Record<string, string>): Promise<Resultado> {
  const r = await registrosVentas(db, aFecha(v.desde), aFecha(v.hasta));
  const sin = r.filter((x) => !x.anulada && x.sinNumeroFiscal).length;
  return armarLibro(r, "Nombre o razón social del cliente", "Nº de factura", [
    "Montos en bolívares con la tasa de cada factura. Las facturas anuladas aparecen con montos en cero.",
    ...(sin ? [`${sin} factura(s) sin número fiscal registrado muestran su número interno (FAC-…): regístralo en la factura para que salga en el libro.`] : []),
    "La columna de retención de IVA muestra la que el cliente nos practicó sobre la factura (comprobante e importe), en la fila de la factura. Revisa con tu contador el formato exigido.",
  ]);
}

export async function reporteLibroCompras(db: Db, v: Record<string, string>): Promise<Resultado> {
  const r = await registrosCompras(db, aFecha(v.desde), aFecha(v.hasta));
  return armarLibro(r, "Nombre o razón social del proveedor", "Nº de factura del proveedor", [
    "Montos en bolívares con la tasa de la fecha de cada factura. Las facturas anuladas aparecen con montos en cero.",
    "La factura del proveedor se registra con un solo IVA: la alícuota se deduce de la proporción IVA/base. Importaciones y compras con varias alícuotas aún no están separadas.",
    "La columna de retención de IVA muestra la que nosotros le practicamos al proveedor sobre la factura (comprobante e importe). Revisa con tu contador el formato exigido.",
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
  const retClientes = ventas.reduce((s, r) => s + (r.retIva ?? 0), 0);
  const retProveedores = compras.reduce((s, r) => s + (r.retIva ?? 0), 0);
  const cuota = V.iva - C.iva;
  filas.push({ concepto: cuota >= 0 ? "IVA a pagar del período (débito − crédito)" : "Excedente de crédito fiscal (a favor)", base: null, iva: aBs(Math.abs(cuota)), _negrita: true });
  filas.push({ concepto: "RETENCIONES DE IVA", base: null, iva: null, _negrita: true }, { concepto: "Retenido por clientes (a nuestro favor)", base: null, iva: aBs(retClientes), _nivel: 1 }, { concepto: "Cuota después de retenciones soportadas (débito − crédito − retenido por clientes)", base: null, iva: aBs(cuota - retClientes), _nivel: 1 }, { concepto: "Retenido a proveedores (por enterar al fisco)", base: null, iva: aBs(retProveedores), _nivel: 1 });
  return {
    columnas: [{ clave: "concepto", titulo: "Concepto", tipo: "texto" }, { clave: "base", titulo: "Base imponible Bs.", tipo: "moneda" }, { clave: "iva", titulo: "IVA Bs.", tipo: "moneda" }],
    filas,
    notas: ["Las retenciones se toman de la fila de la factura que afectan. No incluye excedentes de períodos anteriores. Es una ayuda para preparar la declaración: valida las cifras con tu contador."],
  };
}


/** Retenciones del período, practicadas a proveedores o sufridas de clientes, para declarar y enterar. */
export async function reporteRetenciones(db: Db, v: Record<string, string>): Promise<Resultado> {
  const practicada = v.sentido !== "SUFRIDA";
  const rs = await db.retencion.findMany({
    where: { sentido: practicada ? "PRACTICADA" : "SUFRIDA", fecha: { gte: aFecha(v.desde), lte: aFecha(v.hasta) }, ...(v.tipo ? { tipo: v.tipo } : {}) },
    include: { proveedor: { select: { documento: true, razonSocial: true } }, cliente: { select: { documento: true, razonSocial: true } }, facturaCompra: { select: { documento: true } }, factura: { select: { numero: true, numeroFiscal: true } } },
    orderBy: [{ fecha: "asc" }, { numero: "asc" }],
  });
  const filas: Fila[] = rs.map((r) => {
    const t = practicada ? r.proveedor : r.cliente;
    const anulada = r.estado === "ANULADA";
    return {
      fecha: r.fecha, comprobante: r.comprobante, rif: t?.documento ?? "", nombre: t?.razonSocial ?? "", factura: practicada ? (r.facturaCompra?.documento ?? "") : (r.factura?.numeroFiscal ?? `FAC-${String(r.factura?.numero ?? 0).padStart(6, "0")}`),
      tipo: r.tipo, concepto: r.concepto ?? "", base: anulada ? 0 : Number(r.baseUsd), pct: anulada ? 0 : Number(r.porcentaje), montoUsd: anulada ? 0 : Number(r.montoUsd), montoBs: anulada ? 0 : Number(r.montoBs), obs: anulada ? "ANULADA" : "",
    };
  });
  const sum = (k: string) => Math.round(filas.reduce((s, f) => s + (f[k] as number), 0) * 100) / 100;
  return {
    columnas: [
      { clave: "fecha", titulo: "Fecha", tipo: "fecha" }, { clave: "comprobante", titulo: "Nº de comprobante", tipo: "texto" }, { clave: "rif", titulo: "RIF", tipo: "texto" }, { clave: "nombre", titulo: practicada ? "Proveedor" : "Cliente", tipo: "texto" },
      { clave: "factura", titulo: "Factura", tipo: "texto" }, { clave: "tipo", titulo: "Impuesto", tipo: "texto" }, { clave: "concepto", titulo: "Concepto", tipo: "texto" }, { clave: "base", titulo: "Base USD", tipo: "moneda" },
      { clave: "pct", titulo: "%", tipo: "numero" }, { clave: "montoUsd", titulo: "Retenido USD", tipo: "moneda" }, { clave: "montoBs", titulo: "Retenido Bs.", tipo: "moneda" }, { clave: "obs", titulo: "Observaciones", tipo: "texto" },
    ],
    filas, totales: { base: sum("base"), montoUsd: sum("montoUsd"), montoBs: sum("montoBs") },
    notas: [practicada ? "Retenciones que practicamos a proveedores: es lo que se debe enterar al fisco. El retenido en Bs. usa la tasa de cada factura." : "Retenciones que nos practicaron los clientes: crédito a nuestro favor contra la declaración. El retenido en Bs. usa la tasa de cada factura."],
  };
}
