import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { estadoDeCuenta } from "../src/lib/cxc/estado-cuenta";
import { anularAplicacionAnticipo, anularCobro, aplicarAnticipo, registrarCobro } from "../src/lib/cxc/servicio";
import { listarDevoluciones } from "../src/lib/notas/devoluciones";
import { facturarYCobrar } from "../src/lib/facturacion/contado";
import { emitirFactura } from "../src/lib/facturacion/servicio";
import { anularNotaVenta, crearNotaVenta, type DatosNotaVenta } from "../src/lib/notas/servicio";
import { abrirEntorno, automatica, crearCajaTesoreria, crearCliente, crearProducto, descuadreContable, fijarTasa, type Entorno } from "./soporte/entorno";

describe("Devolución de facturas con reintegro", () => {
  let e: Entorno;
  before(async () => { e = await abrirEntorno(); await fijarTasa(e.db, 40); await automatica(e.db, true); });
  after(async () => { await automatica(e.db, false); });

  const saldoCuenta = async (id: string) => Number((await e.db.cuentaTesoreria.findUniqueOrThrow({ where: { id } })).saldo);
  const stock = async (codigo: string) => Number((await e.db.existencia.findUnique({ where: { almacenId_productoCodigo: { almacenId: e.almacenId, productoCodigo: codigo } } }))?.cantidad ?? 0);
  const factura = (id: string) => e.db.factura.findUniqueOrThrow({ where: { id } }).then((f) => [Number(f.ajuste), Number(f.saldo)]);
  const reintegro = (moneda: "USD" | "VES", monto: number, cuentaId: string) => ({ formaPago: "EFECTIVO", moneda, monto, cuentaId });

  /** 5 unidades a 10 USD exentas = 50 USD = 2.000 Bs.; `contado` la deja cobrada en dólares. */
  async function venta(contado = true) {
    const cli = await crearCliente(e.db);
    const p = await crearProducto(e, { existencia: 20, precio: 10, costo: 4, exento: true });
    const usd = await crearCajaTesoreria(e, "USD", 100);
    const ves = await crearCajaTesoreria(e, "VES", 10_000);
    const datos = { clienteId: cli.id, almacenId: e.almacenId, observaciones: null, diasCredito: 0, lineas: [{ productoCodigo: p.codigo, cantidad: 5, precioUnitario: 10, descuento: 0 }] };
    const r = contado
      ? await facturarYCobrar(e.db, e.actor, { pedidoId: null, datos }, { pagos: [{ formaPago: "EFECTIVO", moneda: "USD", recibido: 50, cuentaId: usd.id }] })
      : await emitirFactura(e.db, e.actor, datos);
    assert.ok(r.ok, r.ok ? "" : r.error);
    const lineaId = (await e.db.facturaLinea.findFirstOrThrow({ where: { facturaId: r.id } })).id;
    const devolver = (cantidad: number, extra: Partial<DatosNotaVenta> = {}) =>
      crearNotaVenta(e.db, e.actor, { tipo: "CREDITO", modo: "DEVOLUCION", facturaId: r.id, motivo: "Devolución de prueba", almacenId: e.almacenId, lineas: [{ facturaLineaId: lineaId, cantidad }], ...extra });
    return { cli, p, usd, ves, id: r.id, devolver };
  }

  it("parcial de una factura cobrada: el dinero sale de la caja, la mercancía vuelve y anularla lo deshace", async () => {
    const x = await venta();
    const n = await x.devolver(2, { reintegros: [reintegro("VES", 800, x.ves.id)] });
    assert.ok(n.ok, n.ok ? "" : n.error);
    assert.deepEqual(await factura(x.id), [-20, 0]);
    assert.deepEqual([await saldoCuenta(x.ves.id), await saldoCuenta(x.usd.id), await stock(x.p.codigo)], [9200, 150, 17]);
    assert.equal((await estadoDeCuenta(e.db, x.cli.id)).saldoTotal, 0, "vendido, cobrado, devuelto y reintegrado");
    assert.equal(await descuadreContable(e.db), 0);
    assert.ok((await anularNotaVenta(e.db, e.actor, n.id, "Error de caja")).ok);
    assert.deepEqual(await factura(x.id), [0, 0]);
    assert.deepEqual([await saldoCuenta(x.ves.id), await stock(x.p.codigo)], [10_000, 15]);
    assert.equal(await descuadreContable(e.db), 0);
  });

  it("si no se dice cómo se devuelve el dinero (o se pasa, o no alcanza la caja) no queda nada", async () => {
    const x = await venta();
    const vacia = await crearCajaTesoreria(e, "VES", 10);
    const contador = async () => (await e.db.tipoDocumento.findUniqueOrThrow({ where: { codigo: "NOTA_CREDITO" } })).ultimoNumero;
    const antes = await contador();
    for (const extra of [
      {}, // no dice cómo
      { reintegros: [reintegro("VES", 700, x.ves.id)] }, // falta y no deja saldo a favor
      { reintegros: [reintegro("VES", 900, x.ves.id)] }, // se pasa
      { reintegros: [reintegro("USD", 20, x.ves.id)] }, // caja de otra moneda
      { reintegros: [reintegro("VES", 800, vacia.id)] }, // sin dinero en la caja
      { reintegros: [reintegro("VES", 800, x.ves.id)], sinReintegro: true }, // sin permiso de cobranza
    ]) assert.equal((await x.devolver(2, extra)).ok, false, JSON.stringify(extra));
    assert.deepEqual([await factura(x.id), await saldoCuenta(x.ves.id), await saldoCuenta(vacia.id), await stock(x.p.codigo), await contador()], [[0, 0], 10_000, 10, 15, antes]);
  });

  it("total: pide aprobación (también si se completa en partes); lo no reintegrado queda a favor y sirve para otra factura", async () => {
    const x = await venta();
    assert.equal((await x.devolver(5, { sinDevolucionTotal: true, reintegros: [reintegro("USD", 50, x.usd.id)] })).ok, false);
    const n = await x.devolver(5, { reintegros: [reintegro("USD", 30, x.usd.id)], saldoAFavor: true });
    assert.ok(n.ok, n.ok ? "" : n.error);
    const nota = await e.db.notaVenta.findUniqueOrThrow({ where: { id: n.id } });
    assert.deepEqual([Number(nota.excedente), Number(nota.saldoFavor)], [50, 20]);
    assert.deepEqual([await saldoCuenta(x.usd.id), await stock(x.p.codigo)], [120, 20]);
    const favor = await e.db.cobro.findUniqueOrThrow({ where: { id: nota.cobroFavorId as string } });
    assert.deepEqual([favor.formaPago, Number(favor.montoUsd), Number(favor.anticipoSaldoUsd), favor.cuentaId], ["DEVOLUCION", 0, 20, null]);
    assert.equal((await estadoDeCuenta(e.db, x.cli.id)).saldoTotal, -20, "se le deben 20");
    assert.equal(await descuadreContable(e.db), 0);

    // El saldo a favor paga parte de otra factura; mientras esté usado, la nota no se anula.
    const otra = await emitirFactura(e.db, e.actor, { clienteId: x.cli.id, almacenId: e.almacenId, observaciones: null, diasCredito: 0, lineas: [{ productoCodigo: x.p.codigo, cantidad: 3, precioUnitario: 10, descuento: 0 }] });
    assert.ok(otra.ok);
    const ap = await aplicarAnticipo(e.db, e.actor, favor.id, [{ facturaId: otra.id, montoUsd: 20 }]);
    assert.ok(ap.ok, ap.ok ? "" : ap.error);
    assert.deepEqual(await factura(otra.id), [0, 10]);
    assert.equal((await anularNotaVenta(e.db, e.actor, n.id, "Error")).ok, false);
    assert.equal((await anularCobro(e.db, e.actor, favor.id, "No se anula solo")).ok, false);
    assert.equal(await saldoCuenta(x.usd.id), 120);
    assert.ok((await anularAplicacionAnticipo(e.db, e.actor, ap.aplicaciones[0].id, "Deshacer")).ok);
    assert.ok((await anularNotaVenta(e.db, e.actor, n.id, "Ahora sí")).ok);
    assert.deepEqual([await saldoCuenta(x.usd.id), await stock(x.p.codigo)], [150, 12]);
    assert.equal((await e.db.cobro.findUniqueOrThrow({ where: { id: favor.id } })).estado, "ANULADO");
    assert.equal(await descuadreContable(e.db), 0);

    // En dos partes: la que completa la factura también pide aprobación.
    const y = await venta();
    assert.ok((await y.devolver(3, { sinDevolucionTotal: true, reintegros: [reintegro("USD", 30, y.usd.id)] })).ok);
    assert.equal((await y.devolver(2, { sinDevolucionTotal: true, reintegros: [reintegro("USD", 20, y.usd.id)] })).ok, false);
    assert.ok((await y.devolver(2, { reintegros: [reintegro("USD", 20, y.usd.id)] })).ok);
    assert.equal((await y.devolver(1, { reintegros: [reintegro("USD", 10, y.usd.id)] })).ok, false, "no queda nada por devolver");
  });

  it("cobrada a medias: primero baja la deuda y solo se reintegra lo que sobra; el cobro ya no se puede quitar", async () => {
    const x = await venta(false);
    const cobro = await registrarCobro(e.db, e.actor, { clienteId: x.cli.id, formaPago: "EFECTIVO", moneda: "USD", cuentaId: x.usd.id, referencia: null, observaciones: null, aplicaciones: [{ facturaId: x.id, montoUsd: 25 }] });
    assert.ok(cobro.ok, cobro.ok ? "" : cobro.error);
    // Devuelve 20 USD: caben en los 25 que debe, así que no se entrega dinero.
    assert.equal((await x.devolver(2, { reintegros: [reintegro("USD", 20, x.usd.id)] })).ok, false);
    const a = await x.devolver(2);
    assert.ok(a.ok, a.ok ? "" : a.error);
    assert.deepEqual(await factura(x.id), [-20, 5]);
    // Otros 20: 5 bajan la deuda y 15 se devuelven.
    const b = await x.devolver(2, { reintegros: [reintegro("USD", 15, x.usd.id)] });
    assert.ok(b.ok, b.ok ? "" : b.error);
    assert.deepEqual([await factura(x.id), await saldoCuenta(x.usd.id)], [[-40, 0], 110]);
    assert.equal((await anularCobro(e.db, e.actor, cobro.id, "No debe poderse")).ok, false);
    assert.ok((await anularNotaVenta(e.db, e.actor, b.id, "Se revierte")).ok);
    assert.deepEqual([await factura(x.id), await saldoCuenta(x.usd.id)], [[-20, 5], 125]);
    assert.equal(await descuadreContable(e.db), 0);
  });

  it("la consulta de devoluciones suma lo vigente por moneda; las anuladas se ven pero no suman", async () => {
    const x = await venta();
    const a = await x.devolver(2, { reintegros: [reintegro("VES", 800, x.ves.id)] });
    const b = await x.devolver(1, { reintegros: [reintegro("USD", 4, x.usd.id)], saldoAFavor: true });
    const c = await x.devolver(1, { reintegros: [reintegro("USD", 10, x.usd.id)] });
    assert.ok(a.ok && b.ok && c.ok);
    assert.ok((await anularNotaVenta(e.db, e.actor, c.id, "No era")).ok);
    const r = await listarDevoluciones(e.db, { clienteId: x.cli.id });
    assert.deepEqual(r.totales, { cantidad: 2, anuladas: 1, total: 30, totalBs: 1200, reintegradoBs: 800, reintegradoUsd: 4, saldoFavor: 6, deDeuda: 0 });
    assert.deepEqual([r.encontradas, r.filas.map((f) => f.completa)], [3, [false, false, false]]);
    // Los totales incluyen lo que no cabe en la lista; el filtro por estado y por número funciona.
    const corta = await listarDevoluciones(e.db, { clienteId: x.cli.id }, 1);
    assert.deepEqual([corta.filas.length, corta.totales.cantidad], [1, 2]);
    assert.equal((await listarDevoluciones(e.db, { clienteId: x.cli.id, estado: "ANULADA" })).encontradas, 1);
    const numeroFac = (await e.db.factura.findUniqueOrThrow({ where: { id: x.id } })).numero;
    assert.equal((await listarDevoluciones(e.db, { clienteId: x.cli.id, texto: `FAC-${numeroFac}` })).encontradas, 3);
    assert.equal((await listarDevoluciones(e.db, { clienteId: x.cli.id, hasta: new Date("2000-01-01T00:00:00.000Z") })).encontradas, 0);

    const y = await venta();
    assert.ok((await y.devolver(5, { reintegros: [reintegro("USD", 50, y.usd.id)] })).ok);
    assert.equal((await listarDevoluciones(e.db, { clienteId: y.cli.id })).filas[0].completa, true);
  });

  it("a «Consumidor final» no se le deja saldo a favor", async () => {
    const x = await venta();
    const generico = await e.db.cliente.upsert({ where: { documento: "CONTADO" }, update: {}, create: { documento: "CONTADO", razonSocial: "Consumidor final", tipo: "Privado" } });
    const p = await crearProducto(e, { existencia: 5, precio: 10, costo: 4, exento: true });
    const f = await facturarYCobrar(e.db, e.actor, { pedidoId: null, datos: { clienteId: generico.id, almacenId: e.almacenId, observaciones: null, diasCredito: 0, lineas: [{ productoCodigo: p.codigo, cantidad: 1, precioUnitario: 10, descuento: 0 }] } }, { pagos: [{ formaPago: "EFECTIVO", moneda: "USD", recibido: 10, cuentaId: x.usd.id }] });
    assert.ok(f.ok, f.ok ? "" : f.error);
    const lineaId = (await e.db.facturaLinea.findFirstOrThrow({ where: { facturaId: f.id } })).id;
    const base = { tipo: "CREDITO", modo: "DEVOLUCION", facturaId: f.id, motivo: "Devolución", almacenId: e.almacenId, lineas: [{ facturaLineaId: lineaId, cantidad: 1 }] };
    assert.equal((await crearNotaVenta(e.db, e.actor, { ...base, saldoAFavor: true })).ok, false);
    assert.ok((await crearNotaVenta(e.db, e.actor, { ...base, reintegros: [reintegro("USD", 10, x.usd.id)] })).ok);
  });
});
