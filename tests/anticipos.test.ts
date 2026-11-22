import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { emitirFactura } from "../src/lib/facturacion/servicio";
import { anularAplicacionAnticipo, anularCobro, aplicarAnticipo, registrarRecibo } from "../src/lib/cxc/servicio";
import { abrirEntorno, automatica, crearCajaTesoreria, crearCliente, crearProducto, descuadreContable, fijarTasa, type Entorno } from "./soporte/entorno";

describe("Anticipos de clientes (saldo a favor)", () => {
  let e: Entorno;
  before(async () => {
    e = await abrirEntorno();
    await fijarTasa(e.db, 40);
    // Las facturas y cobros de estas pruebas deben quedar contabilizados (si no, los libros de reportes.test.ts no cuadran).
    await automatica(e.db, true);
    if (!(await e.db.cuentaConcepto.findFirst({ where: { concepto: "ANTICIPO_CLIENTES" } }))) {
      const cuenta = (await e.db.cuentaContable.findFirst({ where: { codigo: "2.1.05" } })) ?? (await e.db.cuentaContable.findFirstOrThrow({ where: { codigo: "2.1.03" } }));
      await e.db.cuentaConcepto.create({ data: { concepto: "ANTICIPO_CLIENTES", cuentaId: cuenta.id } });
    }
  });
  after(async () => {
    await automatica(e.db, false);
  });
  const saldoFactura = async (id: string) => Number((await e.db.factura.findUniqueOrThrow({ where: { id } })).saldo);
  const factura = async (clienteId: string, cantidad: number) => {
    const p = await crearProducto(e, { existencia: 50, precio: 10, exento: true });
    const f = await emitirFactura(e.db, e.actor, { clienteId, almacenId: e.almacenId, observaciones: null, diasCredito: 30, aprobacion: { motivo: "prueba de anticipos" }, lineas: [{ productoCodigo: p.codigo, cantidad, precioUnitario: 10, descuento: 0 }] });
    assert.ok(f.ok);
    return f.id;
  };

  it("un recibo que paga de más: lo aplicado baja la factura y el excedente queda como anticipo; sin la opción se rechaza", async () => {
    const cli = await crearCliente(e.db);
    const caja = await crearCajaTesoreria(e, "USD", 0);
    const fid = await factura(cli.id, 10); // 100 USD
    const base = { clienteId: cli.id, observaciones: null, pagos: [{ formaPago: "EFECTIVO", moneda: "USD", monto: 130, cuentaId: caja.id }], aplicaciones: [{ facturaId: fid, montoUsd: 100 }] };
    assert.equal((await registrarRecibo(e.db, e.actor, base)).ok, false);
    const r = await registrarRecibo(e.db, e.actor, { ...base, anticipo: true });
    assert.ok(r.ok, r.ok ? "" : r.error);
    const c = await e.db.cobro.findUniqueOrThrow({ where: { id: r.cobros[0].id } });
    assert.deepEqual([Number(c.montoUsd), Number(c.anticipoUsd), Number(c.anticipoSaldoUsd), Number(c.anticipoBs)], [100, 30, 30, 1200]);
    assert.equal(await saldoFactura(fid), 0);
    assert.equal(Number((await e.db.cuentaTesoreria.findUniqueOrThrow({ where: { id: caja.id } })).saldo), 130);
  });

  it("anticipo sin facturas: el recibo guarda todo como saldo a favor y luego se aplica por partes a facturas del mismo cliente", async () => {
    const cli = await crearCliente(e.db);
    const otro = await crearCliente(e.db);
    const caja = await crearCajaTesoreria(e, "USD", 0);
    const r = await registrarRecibo(e.db, e.actor, { clienteId: cli.id, observaciones: null, anticipo: true, pagos: [{ formaPago: "ZELLE", moneda: "USD", monto: 80, cuentaId: caja.id }], aplicaciones: [] });
    assert.ok(r.ok, r.ok ? "" : r.error);
    const cobroId = r.cobros[0].id;
    const f1 = await factura(cli.id, 5); // 50
    const f2 = await factura(cli.id, 6); // 60
    const ajena = await factura(otro.id, 1);
    assert.equal((await aplicarAnticipo(e.db, e.actor, cobroId, [{ facturaId: ajena, montoUsd: 5 }])).ok, false); // de otro cliente
    assert.equal((await aplicarAnticipo(e.db, e.actor, cobroId, [{ facturaId: f1, montoUsd: 90 }])).ok, false); // más que el saldo de la factura
    const a = await aplicarAnticipo(e.db, e.actor, cobroId, [{ facturaId: f1, montoUsd: 50 }, { facturaId: f2, montoUsd: 20 }]);
    assert.ok(a.ok, a.ok ? "" : a.error);
    assert.equal(await saldoFactura(f1), 0);
    assert.equal(await saldoFactura(f2), 40);
    assert.equal(Number((await e.db.cobro.findUniqueOrThrow({ where: { id: cobroId } })).anticipoSaldoUsd), 10);
    assert.equal((await aplicarAnticipo(e.db, e.actor, cobroId, [{ facturaId: f2, montoUsd: 11 }])).ok, false); // solo quedan 10
    // El cobro con anticipo aplicado no se anula; anular la aplicación devuelve la deuda y el saldo.
    assert.equal((await anularCobro(e.db, e.actor, cobroId, "intento")).ok, false);
    assert.ok((await anularAplicacionAnticipo(e.db, e.actor, a.aplicaciones[0].id, "se aplicó a la factura equivocada")).ok);
    assert.equal(await saldoFactura(f1), 50);
    assert.equal(Number((await e.db.cobro.findUniqueOrThrow({ where: { id: cobroId } })).anticipoSaldoUsd), 60);
    assert.equal((await anularAplicacionAnticipo(e.db, e.actor, a.aplicaciones[0].id, "otra vez")).ok, false);
    assert.ok((await anularAplicacionAnticipo(e.db, e.actor, a.aplicaciones[1].id, "revertir todo")).ok);
    // Ahora sí: sin aplicaciones activas, el cobro se anula y la caja devuelve el dinero.
    assert.ok((await anularCobro(e.db, e.actor, cobroId, "el cliente pidió devolución")).ok);
    assert.equal(Number((await e.db.cuentaTesoreria.findUniqueOrThrow({ where: { id: caja.id } })).saldo), 0);
    assert.equal((await aplicarAnticipo(e.db, e.actor, cobroId, [{ facturaId: f1, montoUsd: 1 }])).ok, false); // anulado
  });

  it("recibo solo de anticipo exige un monto; el anticipo en bolívares guarda su valor a la tasa del día", async () => {
    const cli = await crearCliente(e.db);
    const cajaVes = await crearCajaTesoreria(e, "VES", 0);
    const r = await registrarRecibo(e.db, e.actor, { clienteId: cli.id, observaciones: null, anticipo: true, pagos: [{ formaPago: "TRANSFERENCIA", moneda: "VES", monto: 400, cuentaId: cajaVes.id }], aplicaciones: [] });
    assert.ok(r.ok, r.ok ? "" : r.error);
    const c = await e.db.cobro.findUniqueOrThrow({ where: { id: r.cobros[0].id } });
    assert.deepEqual([Number(c.montoUsd), Number(c.anticipoUsd), Number(c.anticipoBs)], [0, 10, 400]);
  });

  it("contabilidad: el asiento del anticipo y de su aplicación cuadra y el libro sigue cuadrado", async () => {
    const cli = await crearCliente(e.db);
    const caja = await crearCajaTesoreria(e, "USD", 0);
    const r = await registrarRecibo(e.db, e.actor, { clienteId: cli.id, observaciones: null, anticipo: true, pagos: [{ formaPago: "EFECTIVO", moneda: "USD", monto: 25, cuentaId: caja.id }], aplicaciones: [] });
    assert.ok(r.ok, r.ok ? "" : r.error);
    const fid = await factura(cli.id, 3);
    const a = await aplicarAnticipo(e.db, e.actor, r.cobros[0].id, [{ facturaId: fid, montoUsd: 25 }]);
    assert.ok(a.ok, a.ok ? "" : a.error);
    assert.equal(await descuadreContable(e.db), 0);
    assert.ok(await e.db.asiento.findFirst({ where: { origen: "APLICACION_ANTICIPO" } }));
    assert.ok((await anularAplicacionAnticipo(e.db, e.actor, a.aplicaciones[0].id, "prueba contable")).ok);
    assert.equal(await descuadreContable(e.db), 0);
    await anularCobro(e.db, e.actor, r.cobros[0].id, "limpieza");
  });
});
