import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { facturarYCobrar, type PagoFactura } from "../src/lib/facturacion/contado";
import { acumularPago } from "../src/lib/ventas/reparto-pagos";
import { confirmarPedido, guardarPedido } from "../src/lib/pedidos/servicio";
import { abrirEntorno, automatica, crearCajaTesoreria, crearCliente, crearProducto, descuadreContable, fijarTasa, hoy, type Entorno } from "./soporte/entorno";

describe("Factura de contado cobrada en la misma operación", () => {
  let e: Entorno;
  before(async () => { e = await abrirEntorno(); await fijarTasa(e.db, 40); await automatica(e.db, true); });
  after(async () => { await automatica(e.db, false); });

  const saldoCuenta = async (id: string) => Number((await e.db.cuentaTesoreria.findUniqueOrThrow({ where: { id } })).saldo);
  const stock = async (codigo: string) => Number((await e.db.existencia.findUnique({ where: { almacenId_productoCodigo: { almacenId: e.almacenId, productoCodigo: codigo } } }))?.cantidad ?? 0);
  async function venta() {
    const cli = await crearCliente(e.db);
    const p = await crearProducto(e, { existencia: 20, precio: 10, costo: 4, exento: true });
    const usd = await crearCajaTesoreria(e, "USD", 100);
    const ves = await crearCajaTesoreria(e, "VES", 10_000);
    // 5 unidades a 10 USD = 50 USD = 2.000 Bs.
    const datos = { clienteId: cli.id, almacenId: e.almacenId, observaciones: null, diasCredito: 0, lineas: [{ productoCodigo: p.codigo, cantidad: 5, precioUnitario: 10, descuento: 0 }] };
    return { cli, p, usd, ves, datos };
  }
  const pago = (formaPago: string, moneda: "USD" | "VES", recibido: number, cuentaId: string, referencia?: string): PagoFactura => ({ formaPago, moneda, recibido, cuentaId, referencia });

  it("dos pagos iguales se suman en un renglón, que queda de último; con otra caja o número siguen aparte", () => {
    const a = pago("EFECTIVO", "VES", 1000, "caja");
    const punto = pago("PUNTO_VENTA", "VES", 500, "banco", "01");
    assert.deepEqual(acumularPago([a], pago("EFECTIVO", "VES", 1000.5, "caja")).map((p) => p.recibido), [2000.5]);
    assert.deepEqual(acumularPago([a, punto], a).map((p) => [p.formaPago, p.recibido]), [["PUNTO_VENTA", 500], ["EFECTIVO", 2000]]);
    for (const otro of [pago("EFECTIVO", "VES", 1, "otra"), pago("EFECTIVO", "USD", 1, "caja"), pago("PUNTO_VENTA", "VES", 1, "banco", "02")]) assert.equal(acumularPago([a, punto], otro).length, 3);
  });

  it("con dos formas de pago deja la factura en cero, un recibo con dos cobros y el dinero en cada cuenta", async () => {
    const x = await venta();
    const banco = await crearCajaTesoreria(e, "VES", 0);
    const r = await facturarYCobrar(e.db, e.actor, { pedidoId: null, datos: x.datos }, { pagos: [pago("EFECTIVO", "USD", 20, x.usd.id), pago("TRANSFERENCIA", "VES", 1200, banco.id, "00123")] });
    assert.ok(r.ok, r.ok ? "" : r.error);
    assert.equal(r.vuelto, null);
    const f = await e.db.factura.findUniqueOrThrow({ where: { id: r.id } });
    assert.deepEqual([Number(f.total), Number(f.saldo), f.diasCredito], [50, 0, 0]);
    const recibo = await e.db.reciboCobro.findUniqueOrThrow({ where: { numero: r.reciboNumero }, include: { cobros: { orderBy: { numero: "asc" } } } });
    assert.deepEqual(recibo.cobros.map((c) => [c.formaPago, c.moneda, Number(c.montoMoneda)]), [["EFECTIVO", "USD", 20], ["TRANSFERENCIA", "VES", 1200]]);
    assert.deepEqual([await saldoCuenta(x.usd.id), await saldoCuenta(banco.id), await stock(x.p.codigo)], [120, 1200, 15]);
    assert.equal(await descuadreContable(e.db), 0);
  });

  it("efectivo de más: vuelto en la misma moneda", async () => {
    const x = await venta();
    const r = await facturarYCobrar(e.db, e.actor, { pedidoId: null, datos: x.datos }, { pagos: [pago("EFECTIVO", "VES", 2500, x.ves.id)] });
    assert.ok(r.ok, r.ok ? "" : r.error);
    assert.deepEqual(r.vuelto, { moneda: "VES", monto: 500 });
    assert.equal(await saldoCuenta(x.ves.id), 12_000, "solo queda lo cobrado");
    assert.match((await e.db.reciboCobro.findUniqueOrThrow({ where: { numero: r.reciboNumero } })).observaciones ?? "", /vuelto 500 VES/);
  });

  it("paga en dólares y se le da el vuelto en bolívares desde la otra caja", async () => {
    const x = await venta();
    const sinCaja = await facturarYCobrar(e.db, e.actor, { pedidoId: null, datos: x.datos }, { pagos: [pago("EFECTIVO", "USD", 60, x.usd.id)], monedaVuelto: "VES" });
    assert.equal(sinCaja.ok, false);
    const r = await facturarYCobrar(e.db, e.actor, { pedidoId: null, datos: x.datos }, { pagos: [pago("EFECTIVO", "USD", 60, x.usd.id)], monedaVuelto: "VES", cajaVueltoId: x.ves.id });
    assert.ok(r.ok, r.ok ? "" : r.error);
    assert.deepEqual(r.vuelto, { moneda: "VES", monto: 400 });
    assert.deepEqual([await saldoCuenta(x.usd.id), await saldoCuenta(x.ves.id)], [160, 9600]);
    assert.equal(await descuadreContable(e.db), 0);
  });

  it("si el cobro no procede no queda nada: ni factura, ni salida de inventario, ni número de recibo gastado", async () => {
    const x = await venta();
    const contador = async () => (await e.db.tipoDocumento.findMany({ where: { codigo: { in: ["FACTURA", "RECIBO_COBRO"] } }, orderBy: { codigo: "asc" } })).map((t) => t.ultimoNumero);
    const antes = await contador();
    for (const pagos of [
      [pago("EFECTIVO", "VES", 1999, x.ves.id)], // falta
      [pago("PUNTO_VENTA", "VES", 2500, x.ves.id)], // solo el efectivo da vuelto
      [pago("EFECTIVO", "USD", 50, x.ves.id)], // la caja es de otra moneda
      [pago("EFECTIVO", "USD", 50, x.usd.id), pago("EFECTIVO", "USD", 1, x.usd.id)], // sobra un pago
      [pago("CHEQUE", "VES", 2000, x.ves.id)], // cheque sin número
    ]) {
      const r = await facturarYCobrar(e.db, e.actor, { pedidoId: null, datos: x.datos }, { pagos });
      assert.equal(r.ok, false, JSON.stringify(pagos));
    }
    assert.equal(await e.db.factura.count({ where: { clienteId: x.cli.id } }), 0);
    assert.deepEqual([await stock(x.p.codigo), await saldoCuenta(x.usd.id), await saldoCuenta(x.ves.id)], [20, 100, 10_000]);
    assert.deepEqual(await contador(), antes);
  });

  it("factura un pedido confirmado y lo cobra; si el cobro falla, el pedido sigue confirmado", async () => {
    const x = await venta();
    const o = await guardarPedido(e.db, e.actor, null, { clienteId: x.cli.id, fecha: hoy(), observaciones: null, lineas: x.datos.lineas });
    assert.ok(o.ok, o.ok ? "" : o.error);
    assert.ok((await confirmarPedido(e.db, e.actor, o.id)).ok);
    const doc = { pedidoId: o.id, almacenId: e.almacenId, observaciones: null };
    assert.equal((await facturarYCobrar(e.db, e.actor, doc, { pagos: [pago("EFECTIVO", "USD", 10, x.usd.id)] })).ok, false);
    assert.equal((await e.db.pedidoVenta.findUniqueOrThrow({ where: { id: o.id } })).estado, "CONFIRMADO");
    const r = await facturarYCobrar(e.db, e.actor, doc, { pagos: [pago("EFECTIVO", "USD", 50, x.usd.id)] });
    assert.ok(r.ok, r.ok ? "" : r.error);
    assert.equal((await e.db.pedidoVenta.findUniqueOrThrow({ where: { id: o.id } })).estado, "FACTURADO");
    assert.equal(Number((await e.db.factura.findUniqueOrThrow({ where: { id: r.id } })).saldo), 0);
  });
});
