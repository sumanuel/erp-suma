import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { anularCobro, registrarRecibo, type DatosRecibo } from "../src/lib/cxc/servicio";
import { emitirFactura } from "../src/lib/facturacion/servicio";
import { abrirEntorno, automatica, crearCajaTesoreria, crearCliente, crearProducto, descuadreContable, fijarTasa, hoy, unico, type Entorno } from "./soporte/entorno";

describe("Recibo de ingreso con varias formas de pago", () => {
  let e: Entorno;
  before(async () => {
    e = await abrirEntorno();
    await fijarTasa(e.db, 40);
    await automatica(e.db, true);
  });
  after(async () => {
    await automatica(e.db, false);
  });
  const saldoCuenta = async (id: string) => Number((await e.db.cuentaTesoreria.findUniqueOrThrow({ where: { id } })).saldo);
  const saldoFactura = async (id: string) => Number((await e.db.factura.findUniqueOrThrow({ where: { id } })).saldo);
  async function factura(clienteId: string, cantidad = 1) {
    const p = await crearProducto(e, { existencia: 50, costo: 4 });
    const f = await emitirFactura(e.db, e.actor, { clienteId, almacenId: e.almacenId, observaciones: null, diasCredito: 0, lineas: [{ productoCodigo: p.codigo, cantidad, precioUnitario: 10, descuento: 0 }] });
    assert.ok(f.ok);
    return f.id; // 11,60 USD por unidad
  }
  const recibo = (d: Partial<DatosRecibo> & Pick<DatosRecibo, "clienteId" | "pagos" | "aplicaciones">) => registrarRecibo(e.db, e.actor, { observaciones: null, ...d });

  it("dos formas de pago (USD efectivo + Bs. transferencia) cubren dos facturas; cada forma es un cobro del mismo recibo", async () => {
    const cli = await crearCliente(e.db);
    const f1 = await factura(cli.id); // 11,60
    const f2 = await factura(cli.id, 2); // 23,20
    const usd = await crearCajaTesoreria(e, "USD");
    const ves = await crearCajaTesoreria(e, "VES");
    // total 34,80 USD: 20 USD en efectivo + 14,80 USD = 592 Bs.
    const r = await recibo({
      clienteId: cli.id, numeroComprobante: "CMP-1",
      pagos: [{ formaPago: "EFECTIVO", moneda: "USD", monto: 20, cuentaId: usd.id }, { formaPago: "TRANSFERENCIA", moneda: "VES", monto: 592, cuentaId: ves.id, referencia: "TRF 99" }],
      aplicaciones: [{ facturaId: f1, montoUsd: 11.6 }, { facturaId: f2, montoUsd: 23.2 }],
    });
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(r.cobros.length, 2);
    assert.equal(await saldoFactura(f1), 0);
    assert.equal(await saldoFactura(f2), 0);
    assert.equal(await saldoCuenta(usd.id), 20);
    assert.equal(await saldoCuenta(ves.id), 592);
    const cobros = await e.db.cobro.findMany({ where: { reciboId: r.id } });
    assert.equal(cobros.length, 2);
    assert.ok(cobros.every((c) => c.numeroComprobante === "CMP-1"));
    assert.equal(Math.round(cobros.reduce((s, c) => s + Number(c.montoUsd), 0) * 10000) / 10000, 34.8);
    assert.equal(await descuadreContable(e.db), 0);
  });

  it("los pagos deben sumar exactamente lo aplicado: si sobra o falta se rechaza sin dejar rastro", async () => {
    const cli = await crearCliente(e.db);
    const f = await factura(cli.id);
    const usd = await crearCajaTesoreria(e, "USD");
    const cobros0 = await e.db.cobro.count();
    assert.equal((await recibo({ clienteId: cli.id, pagos: [{ formaPago: "EFECTIVO", moneda: "USD", monto: 12, cuentaId: usd.id }], aplicaciones: [{ facturaId: f, montoUsd: 11.6 }] })).ok, false);
    assert.equal((await recibo({ clienteId: cli.id, pagos: [{ formaPago: "EFECTIVO", moneda: "USD", monto: 11, cuentaId: usd.id }], aplicaciones: [{ facturaId: f, montoUsd: 11.6 }] })).ok, false);
    assert.equal(await e.db.cobro.count(), cobros0);
    assert.equal(await saldoFactura(f), 11.6);
    assert.equal(await saldoCuenta(usd.id), 0);
  });

  it("cheque exige número; la fecha no puede ser futura; el cobrador debe ser cobrador", async () => {
    const cli = await crearCliente(e.db);
    const f = await factura(cli.id);
    const usd = await crearCajaTesoreria(e, "USD");
    const base = { clienteId: cli.id, aplicaciones: [{ facturaId: f, montoUsd: 11.6 }] };
    const pago = { formaPago: "CHEQUE", moneda: "USD", monto: 11.6, cuentaId: usd.id };
    assert.equal((await recibo({ ...base, pagos: [pago] })).ok, false); // sin número de cheque
    assert.equal((await recibo({ ...base, fecha: new Date(hoy().getTime() + 86_400_000), pagos: [{ ...pago, numeroCheque: "123" }] })).ok, false);
    const vendedor = await e.db.vendedor.create({ data: { codigo: unico("V"), nombre: "Solo vendedor", esVendedor: true } });
    assert.equal((await recibo({ ...base, cobradorId: vendedor.id, pagos: [{ ...pago, numeroCheque: "123" }] })).ok, false);
    const cobrador = await e.db.vendedor.create({ data: { codigo: unico("C"), nombre: "Cobrador", esVendedor: false, esCobrador: true } });
    const banco = await e.db.banco.create({ data: { codigo: unico("B"), nombre: "Banco emisor" } });
    const r = await recibo({ ...base, cobradorId: cobrador.id, pagos: [{ ...pago, numeroCheque: "000123", bancoChequeId: banco.id, fechaCheque: hoy() }] });
    assert.ok(r.ok, JSON.stringify(r));
    const c = await e.db.cobro.findFirstOrThrow({ where: { reciboId: r.id } });
    assert.equal(c.numeroCheque, "000123");
    assert.equal(c.bancoChequeId, banco.id);
    assert.equal(c.cobradorId, cobrador.id);
  });

  it("una fecha pasada queda en el cobro y en su asiento", async () => {
    const cli = await crearCliente(e.db);
    const f = await factura(cli.id);
    const usd = await crearCajaTesoreria(e, "USD");
    const ayer = new Date(hoy().getTime() - 86_400_000);
    const moneda = await e.db.moneda.findUniqueOrThrow({ where: { codigo: "USD" } });
    await e.db.tasaCambio.create({ data: { monedaId: moneda.id, fecha: new Date(hoy().getTime() - 5 * 86_400_000), valor: 40 } }); // la tasa vigente de ayer
    const r = await recibo({ clienteId: cli.id, fecha: ayer, pagos: [{ formaPago: "EFECTIVO", moneda: "USD", monto: 11.6, cuentaId: usd.id }], aplicaciones: [{ facturaId: f, montoUsd: 11.6 }] });
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal((await e.db.cobro.findUniqueOrThrow({ where: { id: r.cobros[0].id } })).fecha.getTime(), ayer.getTime());
    assert.equal((await e.db.reciboCobro.findUniqueOrThrow({ where: { id: r.id } })).fecha.getTime(), ayer.getTime());
  });

  it("anular un cobro del recibo devuelve su parte a las facturas; dos recibos simultáneos por la misma factura → solo uno", async () => {
    const cli = await crearCliente(e.db);
    const f = await factura(cli.id);
    const usd = await crearCajaTesoreria(e, "USD");
    const ves = await crearCajaTesoreria(e, "VES");
    const r = await recibo({ clienteId: cli.id, pagos: [{ formaPago: "EFECTIVO", moneda: "USD", monto: 6, cuentaId: usd.id }, { formaPago: "EFECTIVO", moneda: "VES", monto: 224, cuentaId: ves.id }], aplicaciones: [{ facturaId: f, montoUsd: 11.6 }] }); // 224 Bs. = 5,60 USD
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(await saldoFactura(f), 0);
    assert.ok((await anularCobro(e.db, e.actor, r.cobros[1].id, "Error de captura")).ok);
    assert.equal(await saldoFactura(f), 5.6);
    const g = await factura(cli.id);
    const caja = await crearCajaTesoreria(e, "USD");
    const rs = await Promise.all([1, 2].map(() => recibo({ clienteId: cli.id, pagos: [{ formaPago: "EFECTIVO", moneda: "USD", monto: 11.6, cuentaId: caja.id }], aplicaciones: [{ facturaId: g, montoUsd: 11.6 }] })));
    assert.equal(rs.filter((x) => x.ok).length, 1);
    assert.equal(await saldoCuenta(caja.id), 11.6);
  });

  it("el libro sigue cuadrado", async () => {
    assert.equal(await descuadreContable(e.db), 0);
  });
});
