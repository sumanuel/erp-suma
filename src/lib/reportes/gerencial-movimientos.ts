import "server-only";
import type { Db } from "@/lib/tenant";
import { hoyCaracas } from "@/lib/tasas";
import { aFecha, redondear2 } from "./ayudas";
import { documentosDeVenta, lineasDeVenta, type LineaVenta } from "./movimientos-venta";
import { LIMITE } from "./gerencial-articulos";
import type { Columna, Fila, Resultado } from "./tipos";

// Movimientos, ventas y compras gerenciales (original: MovimientosGerenciales). Se mantienen sus criterios: la filial son los vendedores con
// código 80 o mayor (lo demás, incluso sin vendedor, son clientes), el neto es lo facturado menos lo devuelto (notas de crédito; las de débito
// no entran) y las ventas se miden con la base sin IVA.

export const PRIMER_VENDEDOR_FILIAL = 80;
/** Código del país local en la tabla de países: los proveedores sin país o de este país son nacionales. */
export const PAIS_LOCAL = "VE";

type Grupo = "CLI" | "FIL" | "GEN";
const NOMBRE_GRUPO: Record<Grupo, string> = { CLI: "clientes", FIL: "filial", GEN: "general" };
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (a: number, m: number, d: number) => new Date(Date.UTC(a, m, d));

async function codigosDeVendedor(db: Db) {
  return new Map((await db.vendedor.findMany({ select: { id: true, codigo: true, nombre: true, esVendedor: true } })).map((v) => [v.id, v]));
}
const esFilial = (codigo: string | undefined) => Number.parseInt(codigo ?? "", 10) >= PRIMER_VENDEDOR_FILIAL;

type Suma = { cantFav: number; cantDev: number; undFav: number; undDev: number; montoFav: number; montoDev: number };
const nada = (): Suma => ({ cantFav: 0, cantDev: 0, undFav: 0, undDev: 0, montoFav: 0, montoDev: 0 });
type Movimiento = { fecha: Date; tipo: "FAV" | "DEV"; vendedorId: string | null; monto: number; unidades: number };

/** «Movimiento facturación» (documentos) y «Movimiento producto» (líneas): un año mes por mes, o un mes día por día, por grupo. */
export async function reporteMovimientoPeriodo(db: Db, v: Record<string, string>, porLineas: boolean): Promise<Resultado> {
  const anio = Number(v.anio), mes = v.mes ? Number(v.mes) : 0;
  const desde = utc(anio, mes ? mes - 1 : 0, 1);
  const hasta = mes ? utc(anio, mes, 0) : utc(anio, 11, 31);
  const movimientos: Movimiento[] = porLineas
    ? (await lineasDeVenta(db, desde, hasta)).map((l) => ({ fecha: l.fecha, tipo: l.tipo, vendedorId: l.vendedorId, monto: l.monto, unidades: l.cantidad }))
    : (await documentosDeVenta(db, desde, hasta)).filter((d) => d.tipo !== "NDE").map((d) => ({ fecha: d.fecha, tipo: d.tipo as "FAV" | "DEV", vendedorId: d.vendedorId, monto: d.base, unidades: 0 }));
  const vendedores = await codigosDeVendedor(db);
  const periodos = new Map<number, Record<Grupo, Suma>>();
  const total: Record<Grupo, Suma> = { CLI: nada(), FIL: nada(), GEN: nada() };
  for (const m of movimientos) {
    const clave = mes ? m.fecha.getUTCDate() : m.fecha.getUTCMonth() + 1;
    const p = periodos.get(clave) ?? { CLI: nada(), FIL: nada(), GEN: nada() };
    const propio: Grupo = esFilial(m.vendedorId ? vendedores.get(m.vendedorId)?.codigo : undefined) ? "FIL" : "CLI";
    for (const s of [p[propio], p.GEN, total[propio], total.GEN]) {
      if (m.tipo === "FAV") { s.cantFav++; s.undFav += m.unidades; s.montoFav += m.monto; }
      else { s.cantDev++; s.undDev += m.unidades; s.montoDev += m.monto; }
    }
    periodos.set(clave, p);
  }
  const cant = porLineas ? "Líneas" : "Documentos";
  const comparar = v.vista === "comparar";
  const grupos: Grupo[] = comparar ? ["CLI", "FIL", "GEN"] : [v.vista as Grupo];
  const columnasDe = (g: Grupo): Columna[] => {
    if (comparar) {
      return [
        { clave: `${g}_cantFav`, titulo: `${porLineas ? "Líneas" : "Facturas"} ${NOMBRE_GRUPO[g]}`, tipo: "entero" },
        ...(porLineas ? [{ clave: `${g}_undNeto`, titulo: `Und. netas ${NOMBRE_GRUPO[g]}`, tipo: "numero" as const }] : []),
        { clave: `${g}_neto`, titulo: `Neto ${NOMBRE_GRUPO[g]} USD`, tipo: "moneda" },
      ];
    }
    return [
      { clave: `${g}_cantFav`, titulo: `${cant} facturados`, tipo: "entero" }, { clave: `${g}_cantDev`, titulo: `${cant} devueltos`, tipo: "entero" },
      ...(porLineas ? ([{ clave: `${g}_undFav`, titulo: "Und. facturadas", tipo: "numero" }, { clave: `${g}_undDev`, titulo: "Und. devueltas", tipo: "numero" }, { clave: `${g}_undNeto`, titulo: "Und. netas", tipo: "numero" }] as Columna[]) : []),
      { clave: `${g}_montoFav`, titulo: "Monto facturado USD", tipo: "moneda" }, { clave: `${g}_montoDev`, titulo: "Monto devuelto USD", tipo: "moneda" }, { clave: `${g}_neto`, titulo: "Neto USD", tipo: "moneda" },
    ];
  };
  const valores = (g: Grupo, s: Suma) => ({
    [`${g}_cantFav`]: s.cantFav, [`${g}_cantDev`]: s.cantDev, [`${g}_undFav`]: s.undFav, [`${g}_undDev`]: s.undDev, [`${g}_undNeto`]: s.undFav - s.undDev,
    [`${g}_montoFav`]: redondear2(s.montoFav), [`${g}_montoDev`]: redondear2(s.montoDev), [`${g}_neto`]: redondear2(s.montoFav - s.montoDev),
  });
  const ruta = porLineas ? "movimiento-producto" : "movimiento-facturacion";
  const filas: Fila[] = [...periodos.entries()].sort((a, b) => a[0] - b[0]).map(([clave, p]) => {
    const fecha = mes ? iso(utc(anio, mes - 1, clave)) : "";
    return {
      periodo: mes ? `${String(clave).padStart(2, "0")}/${String(mes).padStart(2, "0")}/${anio}` : MESES[clave - 1],
      ...Object.assign({}, ...grupos.map((g) => valores(g, p[g]))),
      _enlace: mes ? `/reportes/${porLineas ? "detalle-ventas" : "documentos-venta"}?desde=${fecha}&hasta=${fecha}` : `/reportes/${ruta}?anio=${anio}&mes=${clave}&vista=${v.vista}`,
    } as Fila;
  });
  const columnas: Columna[] = [{ clave: "periodo", titulo: mes ? "Día" : "Mes", tipo: "texto" }, ...grupos.flatMap(columnasDe)];
  const todos = Object.assign({}, ...grupos.map((g) => valores(g, total[g]))) as Record<string, number>;
  return {
    columnas, filas, totales: todos,
    notas: [
      mes ? `${MESES[mes - 1]} de ${anio}: pulsa un día para ver sus ${porLineas ? "líneas" : "documentos"}.` : `Año ${anio}: pulsa un mes para verlo día por día.`,
      `Filial: vendedores con código ${PRIMER_VENDEDOR_FILIAL} o mayor; clientes: los demás. Neto = facturado menos notas de crédito, sin IVA.`,
      ...(porLineas ? ["Las notas por monto no tienen líneas de producto y no entran aquí."] : []),
    ],
  };
}

/** Documentos (facturas y notas de crédito) de un rango: el detalle de «Movimiento facturación». */
export async function reporteDocumentosVenta(db: Db, v: Record<string, string>): Promise<Resultado> {
  const docs = (await documentosDeVenta(db, aFecha(v.desde), aFecha(v.hasta))).filter((d) => d.tipo !== "NDE");
  const vendedores = await codigosDeVendedor(db);
  const filas: Fila[] = docs.sort((a, b) => b.fecha.getTime() - a.fecha.getTime() || b.documento.localeCompare(a.documento)).slice(0, LIMITE).map((d) => ({
    documento: d.documento, fecha: d.fecha, tipo: d.tipo === "FAV" ? "Factura" : "Nota de crédito", cliente: d.clienteNombre, vendedor: d.vendedorId ? vendedores.get(d.vendedorId)?.nombre ?? "" : "", monto: redondear2(d.tipo === "DEV" ? -d.base : d.base),
    _enlace: d.tipo === "FAV" ? `/facturacion/${d.id}` : `/facturacion/notas/${d.id}`,
  }));
  return {
    columnas: [{ clave: "documento", titulo: "Documento", tipo: "texto" }, { clave: "fecha", titulo: "Fecha", tipo: "fecha" }, { clave: "tipo", titulo: "Tipo", tipo: "texto" }, { clave: "cliente", titulo: "Cliente", tipo: "texto" }, { clave: "vendedor", titulo: "Vendedor", tipo: "texto" }, { clave: "monto", titulo: "Monto USD (sin IVA)", tipo: "moneda" }],
    filas, totales: { monto: redondear2(filas.reduce((s, f) => s + (f.monto as number), 0)) },
  };
}

const rango = (v: Record<string, string>) => `desde=${v.desde}&hasta=${v.hasta}`;
const q = (nombre: string, valor: string | undefined) => (valor ? `&${nombre}=${encodeURIComponent(valor)}` : "");
const filtroDe = (v: Record<string, string>) => ({ ...(v.producto ? { productoCodigo: v.producto.toUpperCase() } : {}), ...(v.cliente && /^[0-9a-f-]{36}$/i.test(v.cliente) ? { clienteId: v.cliente } : {}), ...(v.vendedor === "SIN" ? { vendedorId: null } : v.vendedor && /^[0-9a-f-]{36}$/i.test(v.vendedor) ? { vendedorId: v.vendedor } : {}) });

/** Líneas de venta y devolución: el detalle de los reportes por producto, cliente y vendedor. */
export async function reporteDetalleVentas(db: Db, v: Record<string, string>): Promise<Resultado> {
  const lineas = await lineasDeVenta(db, aFecha(v.desde), aFecha(v.hasta), filtroDe(v));
  const vendedores = await codigosDeVendedor(db);
  const notas: string[] = [];
  if (lineas.length > LIMITE) notas.push(`Se muestran ${LIMITE} de ${lineas.length} líneas: acota los filtros.`);
  const filas: Fila[] = lineas.sort((a, b) => b.fecha.getTime() - a.fecha.getTime() || b.documento.localeCompare(a.documento)).slice(0, LIMITE).map((l) => {
    const s = l.tipo === "DEV" ? -1 : 1;
    return { documento: l.documento, fecha: l.fecha, codigo: l.productoCodigo, descripcion: l.descripcion, cliente: l.clienteNombre, vendedor: l.vendedorId ? vendedores.get(l.vendedorId)?.nombre ?? "" : "", cantidad: s * l.cantidad, precio: l.precio, monto: redondear2(s * l.monto), _enlace: l.tipo === "FAV" ? `/facturacion/${l.documentoId}` : `/facturacion/notas/${l.documentoId}` };
  });
  return {
    columnas: [{ clave: "documento", titulo: "Documento", tipo: "texto" }, { clave: "fecha", titulo: "Fecha", tipo: "fecha" }, { clave: "codigo", titulo: "Código", tipo: "texto" }, { clave: "descripcion", titulo: "Producto", tipo: "texto" }, { clave: "cliente", titulo: "Cliente", tipo: "texto" }, { clave: "vendedor", titulo: "Vendedor", tipo: "texto" }, { clave: "cantidad", titulo: "Cantidad", tipo: "numero" }, { clave: "precio", titulo: "Precio USD", tipo: "moneda" }, { clave: "monto", titulo: "Monto USD (sin IVA)", tipo: "moneda" }],
    filas, totales: { cantidad: filas.reduce((s, f) => s + (f.cantidad as number), 0), monto: redondear2(filas.reduce((s, f) => s + (f.monto as number), 0)) }, notas,
  };
}

export type AgrupacionMovimiento = "cliente" | "producto" | "vendedor";
type Medida = Suma & { codigo: string; nombre: string; costo: number; id: string };

/** «Movimientos clientes», «Movimiento productos» y «Productos por vendedor»: facturado, devuelto y neto en unidades, líneas y monto. */
export async function reporteMovimientos(db: Db, v: Record<string, string>, por: AgrupacionMovimiento): Promise<Resultado> {
  if (por === "vendedor" && !v.producto) return { columnas: [{ clave: "nombre", titulo: "Vendedor", tipo: "texto" }], filas: [], notas: ["Escribe el código del producto para ver qué vendedores lo vendieron."] };
  const lineas = await lineasDeVenta(db, aFecha(v.desde), aFecha(v.hasta), filtroDe(v));
  const vendedores = await codigosDeVendedor(db);
  const clientes = por === "cliente" ? new Map((await db.cliente.findMany({ where: { id: { in: [...new Set(lineas.map((l) => l.clienteId))] } }, select: { id: true, codigo: true } })).map((c) => [c.id, c.codigo])) : new Map<string, string>();
  const productos = por === "producto" ? new Map((await db.producto.findMany({ where: { codigo: { in: [...new Set(lineas.map((l) => l.productoCodigo))] } }, select: { codigo: true, descripcion: true } })).map((p) => [p.codigo, p.descripcion])) : new Map<string, string>();
  const claveDe = (l: LineaVenta) => (por === "cliente" ? l.clienteId : por === "producto" ? l.productoCodigo : l.vendedorId ?? "SIN");
  const grupos = new Map<string, Medida>();
  for (const l of lineas) {
    const id = claveDe(l);
    const g = grupos.get(id) ?? {
      ...nada(), costo: 0, id,
      codigo: por === "cliente" ? clientes.get(id) ?? "" : por === "producto" ? id : vendedores.get(id)?.codigo ?? "",
      nombre: por === "cliente" ? l.clienteNombre : por === "producto" ? productos.get(id) ?? l.descripcion : vendedores.get(id)?.nombre ?? "Sin vendedor",
    };
    if (l.tipo === "FAV") { g.cantFav++; g.undFav += l.cantidad; g.montoFav += l.monto; g.costo += l.costo; }
    else { g.cantDev++; g.undDev += l.cantidad; g.montoDev += l.monto; g.costo -= l.costo; }
    grupos.set(id, g);
  }
  const lista = [...grupos.values()].sort((a, b) => b.montoFav - b.montoDev - (a.montoFav - a.montoDev));
  const conMargen = por === "producto";
  const filas: Fila[] = lista.slice(0, LIMITE).map((g) => {
    const neto = g.montoFav - g.montoDev;
    const enlace = por === "cliente" ? `/reportes/movimiento-items?${rango(v)}&cliente=${g.id}${q("producto", v.producto)}`
      : por === "producto" ? `/reportes/detalle-ventas?${rango(v)}&producto=${encodeURIComponent(g.id)}${q("cliente", v.cliente)}`
      : `/reportes/detalle-ventas?${rango(v)}&vendedor=${g.id}${q("producto", v.producto)}`;
    return {
      codigo: g.codigo, nombre: g.nombre, undFav: g.undFav, undDev: g.undDev, undNeto: g.undFav - g.undDev, lineasFav: g.cantFav, lineasDev: g.cantDev, lineasNeto: g.cantFav - g.cantDev,
      montoFav: redondear2(g.montoFav), montoDev: redondear2(g.montoDev), montoNeto: redondear2(neto), margen: redondear2(neto - g.costo), pct: neto > 0 ? redondear2(((neto - g.costo) / neto) * 100) : 0, _enlace: enlace,
    };
  });
  const columnas: Columna[] = [
    { clave: "codigo", titulo: "Código", tipo: "texto" }, { clave: "nombre", titulo: por === "cliente" ? "Cliente" : por === "producto" ? "Producto" : "Vendedor", tipo: "texto" },
    { clave: "undFav", titulo: "Und. facturadas", tipo: "numero" }, { clave: "undDev", titulo: "Und. devueltas", tipo: "numero" }, { clave: "undNeto", titulo: "Und. netas", tipo: "numero" },
    { clave: "lineasFav", titulo: "Líneas fact.", tipo: "entero" }, { clave: "lineasDev", titulo: "Líneas dev.", tipo: "entero" }, { clave: "lineasNeto", titulo: "Líneas netas", tipo: "entero" },
    { clave: "montoFav", titulo: "Monto facturado", tipo: "moneda" }, { clave: "montoDev", titulo: "Monto devuelto", tipo: "moneda" }, { clave: "montoNeto", titulo: "Monto neto", tipo: "moneda" },
    ...(conMargen ? ([{ clave: "margen", titulo: "Margen", tipo: "moneda" }, { clave: "pct", titulo: "% margen", tipo: "numero" }] as Columna[]) : []),
  ];
  const suma = (k: string) => redondear2(filas.reduce((s, f) => s + (f[k] as number), 0));
  const notas = ["Montos en USD sin IVA, después de descuentos. Neto = facturado menos devuelto (las notas por monto no tienen productos)."];
  if (v.cliente && por === "producto") {
    const c = filtroDe(v).clienteId ? await db.cliente.findUnique({ where: { id: v.cliente }, select: { razonSocial: true } }) : null;
    if (c) notas.unshift(`Solo lo comprado por ${c.razonSocial}.`);
  }
  if (lista.length > LIMITE) notas.push(`Se muestran ${LIMITE} de ${lista.length} filas.`);
  return { columnas, filas, totales: Object.fromEntries(["undFav", "undDev", "undNeto", "lineasFav", "lineasDev", "lineasNeto", "montoFav", "montoDev", "montoNeto", ...(conMargen ? ["margen"] : [])].map((k) => [k, suma(k)])), notas };
}

type Periodo = { clave: string; titulo: string; desde: Date; hasta: Date };
/** El día, la semana (de lunes al día), el mes y el año hasta el día, y los 3, 6, 9 y 12 meses completos anteriores a su mes. */
export function periodosDe(dia: Date): Periodo[] {
  const a = dia.getUTCFullYear(), m = dia.getUTCMonth(), d = dia.getUTCDate();
  const lunes = utc(a, m, d - ((dia.getUTCDay() + 6) % 7));
  return [
    { clave: "dia", titulo: "Día", desde: utc(a, m, d), hasta: utc(a, m, d) }, { clave: "semana", titulo: "Semana", desde: lunes, hasta: utc(a, m, d) },
    { clave: "mes", titulo: "Mes", desde: utc(a, m, 1), hasta: utc(a, m, d) }, { clave: "anio", titulo: "Año", desde: utc(a, 0, 1), hasta: utc(a, m, d) },
    ...[3, 6, 9, 12].map((n) => ({ clave: `m${n}`, titulo: `${n} meses`, desde: utc(a, m - n, 1), hasta: utc(a, m, 0) })),
  ];
}

type FilaPeriodos = { codigo: string; nombre: string; grupo: 0 | 1; montos: number[]; costos: number[] };

/** Arma la tabla por periodos con el total de cada grupo y el total general al final. */
function tablaPeriodos(filas: FilaPeriodos[], periodos: Periodo[], grupos: [string, string], conCosto: boolean, quien: string): { columnas: Columna[]; filas: Fila[] } {
  const i = (clave: string) => periodos.findIndex((p) => p.clave === clave);
  const armar = (codigo: string, nombre: string, grupo: string, montos: number[], costos: number[], negrita: boolean): Fila => ({
    codigo, nombre, grupo, ...Object.fromEntries(periodos.map((p, k) => [p.clave, redondear2(montos[k])])),
    ...(conCosto ? { pctMes: montos[i("mes")] > 0 ? redondear2((costos[i("mes")] / montos[i("mes")]) * 100) : 0, pctAnio: montos[i("anio")] > 0 ? redondear2((costos[i("anio")] / montos[i("anio")]) * 100) : 0 } : {}),
    ...(negrita ? { _negrita: true } : {}),
  });
  const sumar = (de: FilaPeriodos[], que: "montos" | "costos") => periodos.map((_p, k) => de.reduce((s, f) => s + f[que][k], 0));
  const conMovimiento = filas.filter((f) => f.montos.some((x) => Math.abs(x) > 1e-9));
  const salida: Fila[] = [];
  for (const g of [0, 1] as const) {
    const del = conMovimiento.filter((f) => f.grupo === g).sort((a, b) => b.montos[i("anio")] - a.montos[i("anio")] || a.codigo.localeCompare(b.codigo));
    if (del.length === 0) continue;
    salida.push(...del.map((f) => armar(f.codigo, f.nombre, grupos[g], f.montos, f.costos, false)));
    salida.push(armar("", `TOTAL ${grupos[g].toUpperCase()}`, "", sumar(del, "montos"), sumar(del, "costos"), true));
  }
  if (conMovimiento.length) salida.push(armar("", "TOTAL GENERAL", "", sumar(conMovimiento, "montos"), sumar(conMovimiento, "costos"), true));
  return {
    columnas: [
      { clave: "codigo", titulo: "Código", tipo: "texto" }, { clave: "nombre", titulo: quien, tipo: "texto" }, { clave: "grupo", titulo: "Grupo", tipo: "texto" },
      ...periodos.map((p): Columna => ({ clave: p.clave, titulo: `${p.titulo} USD`, tipo: "moneda" })),
      ...(conCosto ? ([{ clave: "pctMes", titulo: "% costo mes", tipo: "numero" }, { clave: "pctAnio", titulo: "% costo año", tipo: "numero" }] as Columna[]) : []),
    ],
    filas: salida,
  };
}

/** «Ventas por vendedor» por periodos de comparación, con el porcentaje que representa el costo. */
export async function reporteVentasPorVendedorPeriodos(db: Db, v: Record<string, string>): Promise<Resultado> {
  const dia = aFecha(v.dia);
  const periodos = periodosDe(dia);
  const desde = new Date(Math.min(...periodos.map((p) => p.desde.getTime())));
  const docs = (await documentosDeVenta(db, desde, dia)).filter((d) => d.tipo !== "NDE");
  const vendedores = await codigosDeVendedor(db);
  const m = new Map<string, FilaPeriodos>();
  for (const d of docs) {
    const vend = d.vendedorId ? vendedores.get(d.vendedorId) : undefined;
    const id = vend ? d.vendedorId! : "SIN";
    const f = m.get(id) ?? { codigo: vend?.codigo ?? "", nombre: vend?.nombre ?? "Sin vendedor", grupo: esFilial(vend?.codigo) ? 1 : 0, montos: periodos.map(() => 0), costos: periodos.map(() => 0) };
    const s = d.tipo === "DEV" ? -1 : 1;
    periodos.forEach((p, k) => { if (d.fecha >= p.desde && d.fecha <= p.hasta) { f.montos[k] += s * d.base; f.costos[k] += s * d.costo; } });
    m.set(id, f);
  }
  const t = tablaPeriodos([...m.values()], periodos, ["Clientes", "Filial"], true, "Vendedor");
  return { ...t, notas: [`Ventas netas sin IVA (facturas menos notas de crédito) medidas por la fecha del documento, hasta el día elegido; los de 3 a 12 meses son meses completos anteriores. Filial: código ${PRIMER_VENDEDOR_FILIAL} o mayor.`] };
}

/** «Compras por proveedor»: compras netas (facturas menos notas de crédito de proveedor), nacionales e importadas. */
export async function reporteComprasPorProveedor(db: Db, v: Record<string, string>): Promise<Resultado> {
  const dia = aFecha(v.dia);
  const periodos = periodosDe(dia);
  const desde = new Date(Math.min(...periodos.map((p) => p.desde.getTime())));
  const proveedorSel = { select: { codigo: true, razonSocial: true, pais: { select: { codigo: true } } } } as const;
  const [facturas, notas] = await Promise.all([
    // La fecha de la compra es la de recepción del documento (original: fecha de carga); si no se anotó, la del documento.
    db.facturaCompra.findMany({ where: { estado: "REGISTRADA", tipoDocumento: "FACTURA", OR: [{ fechaRecepcion: { gte: desde, lte: dia } }, { fechaRecepcion: null, fecha: { gte: desde, lte: dia } }] }, select: { proveedorId: true, fecha: true, fechaRecepcion: true, subtotal: true, proveedor: proveedorSel } }),
    db.notaCompra.findMany({ where: { estado: "ACTIVA", tipo: "CREDITO", fecha: { gte: desde, lte: dia } }, select: { proveedorId: true, fecha: true, subtotal: true, proveedor: proveedorSel } }),
  ]);
  const m = new Map<string, FilaPeriodos>();
  const movimientos = [...facturas.map((f) => ({ id: f.proveedorId, p: f.proveedor, fecha: f.fechaRecepcion ?? f.fecha, monto: Number(f.subtotal) })), ...notas.map((n) => ({ id: n.proveedorId, p: n.proveedor, fecha: n.fecha, monto: -Number(n.subtotal) }))];
  for (const x of movimientos) {
    const f = m.get(x.id) ?? { codigo: x.p.codigo, nombre: x.p.razonSocial, grupo: !x.p.pais || x.p.pais.codigo === PAIS_LOCAL ? 0 : 1, montos: periodos.map(() => 0), costos: periodos.map(() => 0) };
    periodos.forEach((p, k) => { if (x.fecha >= p.desde && x.fecha <= p.hasta) f.montos[k] += x.monto; });
    m.set(x.id, f);
  }
  const t = tablaPeriodos([...m.values()], periodos, ["Nacionales", "Importados"], false, "Proveedor");
  return { ...t, notas: ["Compras netas sin IVA en USD: facturas de proveedor menos sus notas de crédito (los pagarés y otros documentos no cuentan). Importados: proveedores de un país distinto de Venezuela."] };
}

const BASES: Record<string, { meses: number; etiqueta: string }> = { "15d": { meses: 0.5, etiqueta: "15 días" }, "1": { meses: 1, etiqueta: "1 mes" }, "3": { meses: 3, etiqueta: "3 meses" }, "6": { meses: 6, etiqueta: "6 meses" }, "12": { meses: 12, etiqueta: "12 meses" } };
export const BASES_COMPRA = Object.entries(BASES).map(([valor, b]) => ({ valor, etiqueta: b.etiqueta }));

/** «Compras sugeridas»: cuánto conviene comprar de cada producto de un proveedor según lo vendido y la existencia. */
export async function reporteComprasSugeridas(db: Db, v: Record<string, string>, hoy: Date = hoyCaracas()): Promise<Resultado> {
  const vacio: Resultado = { columnas: [{ clave: "codigo", titulo: "Código", tipo: "texto" }], filas: [], notas: ["Elige un proveedor. Solo aparecen los que tienen productos asignados (Productos › Proveedores por producto)."] };
  if (!/^[0-9a-f-]{36}$/i.test(v.proveedor ?? "")) return vacio;
  const productos = await db.producto.findMany({ where: { activo: true, proveedores: { some: { proveedorId: v.proveedor } } }, select: { codigo: true, descripcion: true, ultimoCosto: true }, orderBy: { codigo: "asc" }, take: LIMITE });
  const a = hoy.getUTCFullYear(), m = hoy.getUTCMonth(), d = hoy.getUTCDate();
  const finAnterior = utc(a, m, 0);
  const periodos: Record<string, [Date, Date]> = { "15d": [utc(a, m, d - 15), utc(a, m, d - 1)], "1": [utc(a, m - 1, 1), finAnterior], "3": [utc(a, m - 3, 1), finAnterior], "6": [utc(a, m - 6, 1), finAnterior], "12": [utc(a, m - 12, 1), finAnterior], mes: [utc(a, m, 1), utc(a, m, d)] };
  const codigos = new Set(productos.map((p) => p.codigo));
  const lineas = (await lineasDeVenta(db, new Date(Math.min(...Object.values(periodos).map((p) => p[0].getTime()))), utc(a, m, d))).filter((l) => codigos.has(l.productoCodigo));
  const vendido = new Map<string, Record<string, number>>();
  for (const l of lineas) {
    const x = vendido.get(l.productoCodigo) ?? {};
    for (const [k, [desde, hasta]] of Object.entries(periodos)) if (l.fecha >= desde && l.fecha <= hasta) x[k] = (x[k] ?? 0) + (l.tipo === "DEV" ? -1 : 1) * l.cantidad;
    vendido.set(l.productoCodigo, x);
  }
  const stock = new Map((await db.existencia.groupBy({ by: ["productoCodigo"], where: { productoCodigo: { in: [...codigos] } }, _sum: { cantidad: true } })).map((x) => [x.productoCodigo, Number(x._sum.cantidad ?? 0)]));
  const base = BASES[v.base] ?? BASES["3"];
  const cobertura = v.cobertura === "base" ? base.meses : Number(v.cobertura);
  let filas: Fila[] = productos.map((p) => {
    const x = vendido.get(p.codigo) ?? {};
    const prom = (k: string) => (x[k] ?? 0) / BASES[k].meses;
    const existencia = stock.get(p.codigo) ?? 0;
    const promedio = prom(v.base in BASES ? v.base : "3");
    const comprar = promedio > 0 && existencia < promedio * cobertura ? redondear2(promedio * cobertura - existencia) : 0;
    const costo = redondear2(Number(p.ultimoCosto));
    return {
      codigo: p.codigo, descripcion: p.descripcion, existencia, p15: redondear2(prom("15d")), p1: redondear2(prom("1")), p3: redondear2(prom("3")), p6: redondear2(prom("6")), p12: redondear2(prom("12")), mes: x.mes ?? 0,
      mesesExistencia: promedio > 0 ? redondear2(existencia / promedio) : null, comprar, costo, total: redondear2(comprar * costo), _enlace: `/gerencial/articulo?codigo=${encodeURIComponent(p.codigo)}`,
    };
  });
  if (v.solo === "si") filas = filas.filter((f) => (f.comprar as number) > 0);
  filas.sort((x, y) => (y.total as number) - (x.total as number) || String(x.codigo).localeCompare(String(y.codigo)));
  return {
    columnas: [
      { clave: "codigo", titulo: "Código", tipo: "texto" }, { clave: "descripcion", titulo: "Producto", tipo: "texto" }, { clave: "existencia", titulo: "Existencia", tipo: "numero" },
      { clave: "p15", titulo: "Prom. 15 días", tipo: "numero" }, { clave: "p1", titulo: "Prom. 1 mes", tipo: "numero" }, { clave: "p3", titulo: "Prom. 3 meses", tipo: "numero" }, { clave: "p6", titulo: "Prom. 6 meses", tipo: "numero" }, { clave: "p12", titulo: "Prom. 12 meses", tipo: "numero" },
      { clave: "mes", titulo: "Vendido este mes", tipo: "numero" }, { clave: "mesesExistencia", titulo: "Meses de existencia", tipo: "numero" }, { clave: "comprar", titulo: "A comprar", tipo: "numero" }, { clave: "costo", titulo: "Último costo USD", tipo: "moneda" }, { clave: "total", titulo: "Total a comprar USD", tipo: "moneda" },
    ],
    filas,
    totales: { total: redondear2(filas.reduce((s, f) => s + (f.total as number), 0)) },
    notas: [
      `Promedios = unidades vendidas por mes (facturas menos devoluciones). Se sugiere lo que falta para cubrir ${cobertura.toLocaleString("es-VE")} mes(es) según el promedio de ${base.etiqueta}.`,
      "Se valora con el último costo. El «costo de reposición» del sistema anterior necesita la lista de precios y los factores de cada proveedor, que aquí no se registran.",
    ],
  };
}
