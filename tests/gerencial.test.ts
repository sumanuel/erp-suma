import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { guardarOrden, emitirOrden, recibirOrden } from "../src/lib/compras/servicio";
import { registrarFacturaCompra } from "../src/lib/cxp/servicio";
import { emitirFactura } from "../src/lib/facturacion/servicio";
import { crearNotaVenta } from "../src/lib/notas/servicio";
import { resolverParametros } from "../src/lib/reportes/ayudas";
import { consultaArticulo } from "../src/lib/reportes/consulta-articulo";
import { consultaCliente, consultaProveedor } from "../src/lib/reportes/consulta-terceros";
import { periodosDe, reporteComprasSugeridas } from "../src/lib/reportes/gerencial-movimientos";
import { REPORTES_GERENCIALES } from "../src/lib/reportes/gerencial-registro";
import { buscarReporte } from "../src/lib/reportes/registro";
import type { Fila } from "../src/lib/reportes/tipos";
import { abrirEntorno, automatica, crearCliente, crearProducto, crearProveedor, fijarTasa, hoy, unico, type Entorno } from "./soporte/entorno";

describe("Módulo gerencial", () => {
  let e: Entorno;
  // Con la contabilización activa: los libros fiscales de la suite se cuadran contra la contabilidad (la base es compartida).
  before(async () => { e = await abrirEntorno(); await fijarTasa(e.db, 40); await automatica(e.db, true); });
  after(async () => { await automatica(e.db, false); });

  const consultar = async (id: string, valores: Record<string, string> = {}) => {
    const def = buscarReporte(id)!;
    return def.consultar(e.db, resolverParametros(await def.parametros(e.db), valores));
  };
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const num = (f: Fila | undefined, k: string) => Number(f?.[k]);

  // Un escenario propio: vendedor de la filial, cliente, producto; se venden 10 y se devuelven 2.
  async function escenario() {
    const codigoVendedor = String(80 + Math.floor(Math.random() * 900_000));
    const vendedor = await e.db.vendedor.create({ data: { codigo: codigoVendedor, nombre: unico("Vend ") } });
    const cli = await crearCliente(e.db);
    const p = await crearProducto(e, { existencia: 30, precio: 10, costo: 4, exento: true });
    const f = await emitirFactura(e.db, e.actor, { clienteId: cli.id, almacenId: e.almacenId, observaciones: null, diasCredito: 0, encabezado: { vendedorId: vendedor.id, condicionPagoId: null, transporteId: null, direccionEntrega: null, descuentos: [0, 0, 0], origenVentaId: null, bultos: null, kilos: null, prontoPago: [0, 0, 0, 0] }, lineas: [{ productoCodigo: p.codigo, cantidad: 10, precioUnitario: 10, descuento: 0 }] });
    assert.ok(f.ok, f.ok ? "" : f.error);
    const linea = await e.db.facturaLinea.findFirstOrThrow({ where: { facturaId: f.id } });
    const nc = await crearNotaVenta(e.db, e.actor, { modo: "DEVOLUCION", tipo: "CREDITO", facturaId: f.id, motivo: "Devolución de prueba", almacenId: e.almacenId, lineas: [{ facturaLineaId: linea.id, cantidad: 2 }] });
    assert.ok(nc.ok, nc.ok ? "" : nc.error);
    return { vendedor, cli, p, facturaId: f.id, linea };
  }

  it("todos los reportes gerenciales se pueden consultar con sus parámetros por defecto", async () => {
    for (const r of REPORTES_GERENCIALES) {
      const res = await consultar(r.id);
      assert.ok(res.columnas.length > 0, r.id);
    }
  });

  it("el reporte de ventas es neto: resta las devoluciones en cantidad, venta y costo", async () => {
    const x = await escenario();
    const rango = { desde: iso(hoy()), hasta: iso(hoy()) };
    const porProducto = (await consultar("ventas", { ...rango, agrupar: "producto" })).filas.find((f) => f.codigo === x.p.codigo);
    assert.deepEqual([num(porProducto, "cantidad"), num(porProducto, "ventas"), num(porProducto, "costo"), num(porProducto, "margen")], [8, 80, 32, 48]);
    const nombre = (await e.db.cliente.findUniqueOrThrow({ where: { id: x.cli.id } })).razonSocial;
    const documento = (await e.db.cliente.findUniqueOrThrow({ where: { id: x.cli.id } })).documento;
    const porCliente = (await consultar("ventas", { ...rango, agrupar: "cliente" })).filas.find((f) => f.documento === documento && f.grupo === nombre);
    assert.deepEqual([num(porCliente, "facturas"), num(porCliente, "ventas"), num(porCliente, "total")], [1, 80, 80]);
  });

  it("movimientos por cliente, por producto y por vendedor: facturado, devuelto y neto, con enlace al detalle", async () => {
    const x = await escenario();
    const rango = { desde: iso(hoy()), hasta: iso(hoy()) };
    const cliente = (await consultar("movimientos-clientes", { ...rango, producto: x.p.codigo })).filas;
    assert.equal(cliente.length, 1);
    assert.deepEqual(["undFav", "undDev", "undNeto", "lineasFav", "lineasDev", "montoNeto"].map((k) => num(cliente[0], k)), [10, 2, 8, 1, 1, 80]);
    assert.match(cliente[0]._enlace ?? "", /movimiento-items\?.*cliente=/);
    const items = (await consultar("movimiento-items", { ...rango, cliente: x.cli.id })).filas;
    assert.deepEqual([items.length, num(items[0], "margen"), num(items[0], "pct")], [1, 48, 60]);
    const vend = (await consultar("productos-por-vendedor", { ...rango, producto: x.p.codigo.toLowerCase() })).filas;
    assert.deepEqual([vend.length, vend[0].codigo, num(vend[0], "undNeto")], [1, x.vendedor.codigo, 8]);
    const detalle = (await consultar("detalle-ventas", { ...rango, producto: x.p.codigo })).filas;
    assert.deepEqual(detalle.map((f) => num(f, "cantidad")).sort((a, b) => a - b), [-2, 10]);
  });

  it("ventas por vendedor por períodos: el de código 80 o mayor va en la filial, con su porcentaje de costo y los totales", async () => {
    const x = await escenario();
    const r = await consultar("ventas-por-vendedor", { dia: iso(hoy()) });
    const fila = r.filas.find((f) => f.codigo === x.vendedor.codigo);
    assert.deepEqual([fila?.grupo, num(fila, "dia"), num(fila, "mes"), num(fila, "anio"), num(fila, "m3"), num(fila, "pctMes")], ["Filial", 80, 80, 80, 0, 40]);
    assert.ok(r.filas.some((f) => f.nombre === "TOTAL FILIAL"));
    assert.equal(r.filas.at(-1)?.nombre, "TOTAL GENERAL");
  });

  it("los períodos de comparación son los del sistema anterior", () => {
    const p = periodosDe(new Date("2026-11-19T00:00:00.000Z")); // jueves
    const de = (k: string) => { const x = p.find((y) => y.clave === k)!; return [iso(x.desde), iso(x.hasta)]; };
    assert.deepEqual(de("semana"), ["2026-11-16", "2026-11-19"]);
    assert.deepEqual(de("mes"), ["2026-11-01", "2026-11-19"]);
    assert.deepEqual(de("m3"), ["2026-08-01", "2026-10-31"]);
    assert.deepEqual(de("m12"), ["2025-11-01", "2026-10-31"]);
  });

  it("precios cambiados: solo las líneas vendidas a un precio distinto del que proponía el sistema", async () => {
    const cli = await crearCliente(e.db);
    const a = await crearProducto(e, { existencia: 5, precio: 10, costo: 4, exento: true });
    const b = await crearProducto(e, { existencia: 5, precio: 10, costo: 4, exento: true });
    const f = await emitirFactura(e.db, e.actor, { clienteId: cli.id, almacenId: e.almacenId, observaciones: null, diasCredito: 0, lineas: [{ productoCodigo: a.codigo, cantidad: 1, precioUnitario: 8, descuento: 0 }, { productoCodigo: b.codigo, cantidad: 1, precioUnitario: 10, descuento: 0 }] });
    assert.ok(f.ok, f.ok ? "" : f.error);
    const filas = (await consultar("precios-cambiados", { desde: iso(hoy()), hasta: iso(hoy()) })).filas;
    const fila = filas.find((x) => x.codigo === a.codigo);
    assert.deepEqual([num(fila, "original"), num(fila, "venta"), num(fila, "diferencia"), num(fila, "pct")], [10, 8, -2, -20]);
    assert.ok(!filas.some((x) => x.codigo === b.codigo));
  });

  it("artículos sin vender y agotados", async () => {
    const quieto = await crearProducto(e, { existencia: 7, precio: 10, costo: 3 });
    const sv = (await consultar("articulos-sin-vender", { nunca: "si" })).filas.find((f) => f.codigo === quieto.codigo);
    assert.deepEqual([sv?.ultimaVenta, num(sv, "valorizado")], ["Nunca vendido", 21]);
    assert.ok(!(await consultar("articulos-sin-vender", { nunca: "no" })).filas.some((f) => f.codigo === quieto.codigo));
    const cli = await crearCliente(e.db);
    const p = await crearProducto(e, { existencia: 2, precio: 10, costo: 4, exento: true });
    assert.ok((await emitirFactura(e.db, e.actor, { clienteId: cli.id, almacenId: e.almacenId, observaciones: null, diasCredito: 0, lineas: [{ productoCodigo: p.codigo, cantidad: 2, precioUnitario: 10, descuento: 0 }] })).ok);
    assert.ok((await consultar("articulos-agotados", {})).filas.some((f) => f.codigo === p.codigo));
    assert.ok(!(await consultar("articulos-negativos", {})).filas.some((f) => f.codigo === p.codigo));
    assert.ok(!(await consultar("articulos-sin-vender", {})).filas.some((f) => f.codigo === p.codigo), "sin existencia no es «sin vender»");
  });

  it("compras sugeridas: promedio de los meses anteriores y lo que falta para la cobertura", async () => {
    const x = await escenario(); // existencia 30 − 10 + 2 = 22
    const prov = await crearProveedor(e.db);
    await e.db.productoProveedor.create({ data: { productoCodigo: x.p.codigo, proveedorId: prov.id } });
    // La venta pasa al mes anterior: 10 vendidas y 2 devueltas = 8 en 1 mes.
    const h = hoy();
    const anterior = new Date(Date.UTC(h.getUTCFullYear(), h.getUTCMonth() - 1, 10));
    await e.db.factura.update({ where: { id: x.facturaId }, data: { fecha: anterior } });
    await e.db.notaVenta.updateMany({ where: { facturaId: x.facturaId }, data: { fecha: anterior } });
    const base = { proveedor: prov.id, base: "1", cobertura: "6", solo: "no" };
    const [fila] = (await reporteComprasSugeridas(e.db, base)).filas;
    assert.deepEqual(["existencia", "p1", "p3", "mesesExistencia", "comprar", "total"].map((k) => num(fila, k)), [22, 8, 2.67, 2.75, 26, 104]);
    assert.equal((await reporteComprasSugeridas(e.db, { ...base, cobertura: "1", solo: "si" })).filas.length, 0, "con 22 en existencia alcanza para un mes");
  });

  it("compras por proveedor y las consultas de cliente, proveedor y artículo", async () => {
    const x = await escenario();
    const prov = await crearProveedor(e.db);
    const fc = await registrarFacturaCompra(e.db, e.actor, { proveedorId: prov.id, ordenId: null, documento: unico("D"), numeroControl: null, fecha: hoy(), diasCredito: 0, subtotal: 100, iva: 16, observaciones: null });
    assert.ok(fc.ok, fc.ok ? "" : fc.error);
    const p = await e.db.proveedor.findUniqueOrThrow({ where: { id: prov.id } });
    const compra = (await consultar("compras-por-proveedor", { dia: iso(hoy()) })).filas.find((f) => f.codigo === p.codigo);
    assert.deepEqual([compra?.grupo, num(compra, "dia"), num(compra, "anio")], ["Nacionales", 100, 100]);
    const o = await guardarOrden(e.db, e.actor, null, { proveedorId: prov.id, fecha: hoy(), fechaEsperada: null, observaciones: null, lineas: [{ productoCodigo: x.p.codigo, cantidad: 5, costoUnitario: 4, descuento: 0 }] });
    assert.ok(o.ok);
    assert.ok((await emitirOrden(e.db, e.actor, o.id)).ok);
    const ol = await e.db.ordenCompraLinea.findFirstOrThrow({ where: { ordenId: o.id } });
    assert.ok((await recibirOrden(e.db, e.actor, o.id, { almacenId: e.almacenId, documento: null, observaciones: null, lineas: [{ ordenLineaId: ol.id, cantidad: 3 }] })).ok);

    const cp = await consultaProveedor(e.db, prov.id);
    assert.deepEqual([cp?.saldo, cp?.pendientes.length, cp?.historial.length], [116, 1, 1]);
    const cc = await consultaCliente(e.db, x.cli.id);
    assert.deepEqual([cc?.saldo, cc?.pendientes.length], [80, 1]);
    assert.deepEqual(cc?.historial.map((h) => h.tipo).sort(), ["Factura", "Nota de crédito"]);
    const a = await consultaArticulo(e.db, x.p.codigo);
    assert.equal(a?.existencia, 25);
    assert.equal(a?.porRecibir, 2);
    assert.equal(a?.recepciones.length, 1);
    assert.equal(a?.porMes.at(-1)?.cantidad, 8);
    assert.ok(a?.ultimaVenta && a.ultimaCompra && a.movimientos.length > 0);
    assert.equal(await consultaArticulo(e.db, "NO-EXISTE"), null);
  });
});
