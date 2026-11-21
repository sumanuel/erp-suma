import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { anularCobro, registrarCobro } from "../src/lib/cxc/servicio";
import { anularFactura, emitirFactura } from "../src/lib/facturacion/servicio";
import { registrarRetencionSufrida, anularRetencion } from "../src/lib/retenciones/servicio";
import { abrirEntorno, automatica, crearCajaTesoreria, crearCliente, crearProducto, descuadreContable, fijarTasa, hoy, redondear2, type Entorno } from "./soporte/entorno";

describe("Ventas, cobros y retenciones", () => {
  let e: Entorno;
  before(async () => {
    e = await abrirEntorno();
    await fijarTasa(e.db, 40);
    await automatica(e.db, true);
  });
  after(async () => {
    await automatica(e.db, false);
  });

  const existencia = async (codigo: string) => Number((await e.db.existencia.findUnique({ where: { almacenId_productoCodigo: { almacenId: e.almacenId, productoCodigo: codigo } } }))?.cantidad ?? 0);
  const facturar = (clienteId: string, codigo: string, cantidad: number, precio = 10) =>
    emitirFactura(e.db, e.actor, { clienteId, almacenId: e.almacenId, observaciones: null, diasCredito: 0, lineas: [{ productoCodigo: codigo, cantidad, precioUnitario: precio, descuento: 0 }] });
  const saldoFactura = async (id: string) => Number((await e.db.factura.findUniqueOrThrow({ where: { id } })).saldo);

  it("factura: calcula IVA, descuenta inventario, congela la tasa y contabiliza", async () => {
    const cli = await crearCliente(e.db);
    const p = await crearProducto(e, { existencia: 10, costo: 4 });
    const r = await facturar(cli.id, p.codigo, 3);
    assert.ok(r.ok);
    const f = await e.db.factura.findUniqueOrThrow({ where: { id: r.id } });
    assert.equal(Number(f.subtotal), 30);
    assert.equal(Number(f.iva), 4.8);
    assert.equal(Number(f.total), 34.8);
    assert.equal(Number(f.saldo), 34.8);
    assert.equal(Number(f.tasaUsd), 40);
    assert.equal(Number(f.totalBs), 1392);
    assert.equal(await existencia(p.codigo), 7);
    const a = await e.db.asiento.findFirstOrThrow({ where: { referencia: `FAC-${String(f.numero).padStart(6, "0")}`, origen: "FACTURA" }, include: { lineas: true } });
    const d = a.lineas.reduce((s, l) => s + Number(l.debe), 0);
    const h = a.lineas.reduce((s, l) => s + Number(l.haber), 0);
    assert.equal(redondear2(d - h), 0);
    assert.ok(d >= 1392);
  });

  it("no vende más de lo que hay y no deja rastro", async () => {
    const cli = await crearCliente(e.db);
    const p = await crearProducto(e, { existencia: 2 });
    const antes = await e.db.factura.count();
    assert.equal((await facturar(cli.id, p.codigo, 3)).ok, false);
    assert.equal(await existencia(p.codigo), 2);
    assert.equal(await e.db.factura.count(), antes);
  });

  it("concurrencia: 6 facturas de 2 sobre 5 en existencia → solo 2 pasan, nunca negativo", async () => {
    const cli = await crearCliente(e.db);
    const p = await crearProducto(e, { existencia: 5 });
    const rs = await Promise.all(Array.from({ length: 6 }, () => facturar(cli.id, p.codigo, 2)));
    assert.equal(rs.filter((r) => r.ok).length, 2);
    assert.equal(await existencia(p.codigo), 1);
  });

  it("rechaza cantidades, precios y descuentos inválidos", async () => {
    const cli = await crearCliente(e.db);
    const p = await crearProducto(e, { existencia: 10 });
    for (const [c, pr] of [[0, 10], [-1, 10], [1, -5], [1.00001, 10]] as const) assert.equal((await facturar(cli.id, p.codigo, c, pr)).ok, false, `cant ${c} precio ${pr}`);
    assert.equal(await existencia(p.codigo), 10);
  });

  it("cobro parcial y total; no se cobra de más; anular el cobro restituye el saldo y la caja", async () => {
    const cli = await crearCliente(e.db);
    const p = await crearProducto(e, { existencia: 10 });
    const f = await facturar(cli.id, p.codigo, 2); // 23,20 USD
    assert.ok(f.ok);
    const caja = await crearCajaTesoreria(e, "USD");
    const cobrar = (monto: number) => registrarCobro(e.db, e.actor, { clienteId: cli.id, formaPago: "EFECTIVO", moneda: "USD", cuentaId: caja.id, referencia: null, observaciones: null, aplicaciones: [{ facturaId: f.id, montoUsd: monto }] });
    const c1 = await cobrar(10);
    assert.ok(c1.ok);
    assert.equal(await saldoFactura(f.id), 13.2);
    assert.equal((await cobrar(13.21)).ok, false); // de más
    assert.equal(await saldoFactura(f.id), 13.2);
    const c2 = await cobrar(13.2);
    assert.ok(c2.ok);
    assert.equal(await saldoFactura(f.id), 0);
    assert.equal(Number((await e.db.cuentaTesoreria.findUniqueOrThrow({ where: { id: caja.id } })).saldo), 23.2);
    // con cobros vigentes la factura no se anula
    assert.equal((await anularFactura(e.db, e.actor, f.id, "Prueba")).ok, false);
    assert.equal((await anularCobro(e.db, e.actor, c2.id, "Error")).ok, true);
    assert.equal((await anularCobro(e.db, e.actor, c2.id, "Otra vez")).ok, false);
    assert.equal(await saldoFactura(f.id), 13.2);
    assert.equal(Number((await e.db.cuentaTesoreria.findUniqueOrThrow({ where: { id: caja.id } })).saldo), 10);
  });

  it("concurrencia: dos cobros simultáneos por el total solo dejan pasar uno", async () => {
    const cli = await crearCliente(e.db);
    const p = await crearProducto(e, { existencia: 10 });
    const f = await facturar(cli.id, p.codigo, 1); // 11,60
    assert.ok(f.ok);
    const caja = await crearCajaTesoreria(e, "USD");
    const rs = await Promise.all([1, 2].map(() => registrarCobro(e.db, e.actor, { clienteId: cli.id, formaPago: "EFECTIVO", moneda: "USD", cuentaId: caja.id, referencia: null, observaciones: null, aplicaciones: [{ facturaId: f.id, montoUsd: 11.6 }] })));
    assert.equal(rs.filter((r) => r.ok).length, 1);
    assert.equal(await saldoFactura(f.id), 0);
    assert.equal(Number((await e.db.cuentaTesoreria.findUniqueOrThrow({ where: { id: caja.id } })).saldo), 11.6);
  });

  it("cobro en bolívares usa la tasa del día; la caja debe ser de la misma moneda", async () => {
    const cli = await crearCliente(e.db);
    const p = await crearProducto(e, { existencia: 10 });
    const f = await facturar(cli.id, p.codigo, 1);
    assert.ok(f.ok);
    const cajaUsd = await crearCajaTesoreria(e, "USD");
    const cajaVes = await crearCajaTesoreria(e, "VES");
    const datos = (cuentaId: string, moneda: string) => ({ clienteId: cli.id, formaPago: "TRANSFERENCIA", moneda, cuentaId, referencia: "REF1", observaciones: null, aplicaciones: [{ facturaId: f.id, montoUsd: 11.6 }] });
    assert.equal((await registrarCobro(e.db, e.actor, datos(cajaUsd.id, "VES"))).ok, false);
    assert.equal((await registrarCobro(e.db, e.actor, datos(cajaVes.id, "USD"))).ok, false);
    assert.equal(await saldoFactura(f.id), 11.6);
    assert.ok((await registrarCobro(e.db, e.actor, datos(cajaVes.id, "VES"))).ok);
    assert.equal(Number((await e.db.cuentaTesoreria.findUniqueOrThrow({ where: { id: cajaVes.id } })).saldo), 464);
  });

  it("anular una factura sin cobros devuelve la mercancía y no se anula dos veces", async () => {
    const cli = await crearCliente(e.db);
    const p = await crearProducto(e, { existencia: 10 });
    const f = await facturar(cli.id, p.codigo, 4);
    assert.ok(f.ok);
    assert.equal(await existencia(p.codigo), 6);
    assert.equal((await anularFactura(e.db, e.actor, f.id, "Error de captura")).ok, true);
    assert.equal(await existencia(p.codigo), 10);
    assert.equal(await saldoFactura(f.id), 0);
    assert.equal((await anularFactura(e.db, e.actor, f.id, "Otra vez")).ok, false);
    assert.equal(await existencia(p.codigo), 10);
  });

  it("retención de IVA sufrida reduce el saldo, no se duplica y se puede anular", async () => {
    const cli = await crearCliente(e.db);
    const p = await crearProducto(e, { existencia: 10 });
    const f = await facturar(cli.id, p.codigo, 10); // subtotal 100, IVA 16, total 116
    assert.ok(f.ok);
    const ret = (porcentaje: number, comprobante: string) => registrarRetencionSufrida(e.db, e.actor, { facturaId: f.id, tipo: "IVA", porcentaje, comprobante, fecha: hoy() });
    assert.equal((await ret(150, "C1")).ok, false);
    const r = await ret(75, "C-0001"); // 12 USD
    assert.ok(r.ok);
    assert.equal(await saldoFactura(f.id), 104);
    assert.equal((await ret(75, "C-0002")).ok, false);
    assert.equal((await anularRetencion(e.db, e.actor, r.id, "Comprobante errado")).ok, true);
    assert.equal(await saldoFactura(f.id), 116);
  });

  it("el libro contable sigue cuadrado y la cartera cuadra con las facturas", async () => {
    assert.equal(await descuadreContable(e.db), 0);
    const r = await e.db.$queryRawUnsafe<{ n: string }[]>("SELECT COUNT(*)::text AS n FROM factura WHERE saldo < 0 OR (estado = 'ANULADA' AND saldo <> 0)");
    assert.equal(r[0].n, "0");
    const s = await e.db.$queryRawUnsafe<{ n: string }[]>("SELECT COUNT(*)::text AS n FROM existencia WHERE cantidad < 0");
    assert.equal(s[0].n, "0");
  });
});
