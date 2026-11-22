import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { emitirFactura } from "../src/lib/facturacion/servicio";
import { aplicarAnticipo, registrarRecibo } from "../src/lib/cxc/servicio";
import { estadoDeCuenta } from "../src/lib/cxc/estado-cuenta";
import { abrirEntorno, automatica, crearCajaTesoreria, crearCliente, crearProducto, fijarTasa, type Entorno } from "./soporte/entorno";

describe("Estado de cuenta del cliente", () => {
  let e: Entorno;
  before(async () => {
    e = await abrirEntorno();
    await fijarTasa(e.db, 40);
    await automatica(e.db, true);
    if (!(await e.db.cuentaConcepto.findFirst({ where: { concepto: "ANTICIPO_CLIENTES" } }))) {
      const cuenta = (await e.db.cuentaContable.findFirst({ where: { codigo: "2.1.05" } })) ?? (await e.db.cuentaContable.findFirstOrThrow({ where: { codigo: "2.1.03" } }));
      await e.db.cuentaConcepto.create({ data: { concepto: "ANTICIPO_CLIENTES", cuentaId: cuenta.id } });
    }
  });
  after(async () => {
    await automatica(e.db, false);
  });

  it("los movimientos suman lo que el cliente debe: facturas − cobros − anticipos, y el saldo final coincide con facturas abiertas menos anticipos", async () => {
    const cli = await crearCliente(e.db);
    const caja = await crearCajaTesoreria(e, "USD", 0);
    const p = await crearProducto(e, { existencia: 50, precio: 10, exento: true });
    const f = (cantidad: number) => emitirFactura(e.db, e.actor, { clienteId: cli.id, almacenId: e.almacenId, observaciones: null, diasCredito: 30, aprobacion: { motivo: "prueba" }, lineas: [{ productoCodigo: p.codigo, cantidad, precioUnitario: 10, descuento: 0 }] });
    const f1 = await f(10); // 100
    const f2 = await f(5); // 50
    assert.ok(f1.ok && f2.ok);
    const r = await registrarRecibo(e.db, e.actor, { clienteId: cli.id, observaciones: null, anticipo: true, pagos: [{ formaPago: "EFECTIVO", moneda: "USD", monto: 120, cuentaId: caja.id }], aplicaciones: [{ facturaId: f1.id, montoUsd: 60 }] });
    assert.ok(r.ok, r.ok ? "" : r.error);
    // 60 aplicados a la factura 1, 60 de anticipo
    let ec = await estadoDeCuenta(e.db, cli.id);
    assert.equal(ec.saldoFinal, 150 - 60 - 60);
    assert.ok((await aplicarAnticipo(e.db, e.actor, r.cobros[0].id, [{ facturaId: f2.id, montoUsd: 50 }])).ok);
    ec = await estadoDeCuenta(e.db, cli.id);
    assert.equal(ec.saldoFinal, 150 - 60 - 60); // aplicar un anticipo no cambia lo que debe en total
    const abiertas = await e.db.factura.findMany({ where: { clienteId: cli.id, estado: "EMITIDA" } });
    const anticipos = await e.db.cobro.findMany({ where: { clienteId: cli.id } });
    const esperado = abiertas.reduce((s, x) => s + Number(x.saldo), 0) - anticipos.reduce((s, x) => s + Number(x.anticipoSaldoUsd), 0);
    assert.equal(ec.saldoFinal, esperado);
    assert.ok(ec.movimientos.some((m) => m.tipo === "Anticipo aplicado" && m.info));
    // Con «desde» en el futuro todo queda como saldo anterior.
    const mañana = new Date(Date.now() + 86_400_000 * 2);
    const futuro = await estadoDeCuenta(e.db, cli.id, mañana);
    assert.equal(futuro.movimientos.length, 0);
    assert.equal(futuro.saldoAnterior, ec.saldoFinal);
  });
});
