import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { registrarMovimientoManual, transferir } from "../src/lib/tesoreria/movimientos";
import { abrirEntorno, automatica, crearCajaTesoreria, descuadreContable, fijarTasa, type Entorno } from "./soporte/entorno";

describe("Tesorería", () => {
  let e: Entorno;
  let capitalId: string;
  before(async () => {
    e = await abrirEntorno();
    await fijarTasa(e.db, 40);
    capitalId = (await e.db.cuentaContable.findFirstOrThrow({ where: { codigo: "3.1.01" } })).id;
  });
  after(async () => {
    await automatica(e.db, false);
  });

  const saldo = async (id: string) => Number((await e.db.cuentaTesoreria.findUniqueOrThrow({ where: { id } })).saldo);
  const movs = (id: string) => e.db.movimientoTesoreria.count({ where: { cuentaId: id } });

  it("ingreso y egreso mueven el saldo y dejan libro", async () => {
    await automatica(e.db, false);
    const c = await crearCajaTesoreria(e, "VES");
    assert.deepEqual(await registrarMovimientoManual(e.db, e.actor, { cuentaId: c.id, tipo: "INGRESO", monto: 1000, descripcion: "Depósito", documento: null }), { ok: true });
    assert.deepEqual(await registrarMovimientoManual(e.db, e.actor, { cuentaId: c.id, tipo: "EGRESO", monto: 250.5, descripcion: "Gasto", documento: null }), { ok: true });
    assert.equal(await saldo(c.id), 749.5);
    assert.equal(await movs(c.id), 2);
  });

  it("rechaza egreso sin fondos, montos inválidos y no deja rastro", async () => {
    const c = await crearCajaTesoreria(e, "VES", 100);
    for (const monto of [101, 0, -5, 1.234, NaN]) {
      const r = await registrarMovimientoManual(e.db, e.actor, { cuentaId: c.id, tipo: "EGRESO", monto, descripcion: "Prueba", documento: null });
      assert.equal(r.ok, false, `monto ${monto} debió rechazarse`);
    }
    assert.equal(await saldo(c.id), 100);
    assert.equal(await movs(c.id), 0);
  });

  it("concurrencia: 10 egresos de 30 sobre 100 → solo 3 pasan y el saldo nunca es negativo", async () => {
    const c = await crearCajaTesoreria(e, "VES", 100);
    const rs = await Promise.all(Array.from({ length: 10 }, () => registrarMovimientoManual(e.db, e.actor, { cuentaId: c.id, tipo: "EGRESO", monto: 30, descripcion: "Retiro", documento: null })));
    assert.equal(rs.filter((r) => r.ok).length, 3);
    assert.equal(await saldo(c.id), 10);
    assert.equal(await movs(c.id), 3);
  });

  it("transferencia es atómica: mueve ambos saldos o ninguno", async () => {
    const a = await crearCajaTesoreria(e, "VES", 500);
    const b = await crearCajaTesoreria(e, "VES", 0);
    assert.deepEqual(await transferir(e.db, e.actor, { origenId: a.id, destinoId: b.id, monto: 200, descripcion: null }), { ok: true });
    assert.equal(await saldo(a.id), 300);
    assert.equal(await saldo(b.id), 200);
    const r = await transferir(e.db, e.actor, { origenId: a.id, destinoId: b.id, monto: 9999, descripcion: null });
    assert.equal(r.ok, false);
    assert.equal(await saldo(a.id), 300);
    assert.equal(await saldo(b.id), 200);
    assert.equal((await transferir(e.db, e.actor, { origenId: a.id, destinoId: a.id, monto: 1, descripcion: null })).ok, false);
  });

  it("no mezcla monedas en una transferencia", async () => {
    const a = await crearCajaTesoreria(e, "VES", 500);
    const b = await crearCajaTesoreria(e, "USD", 0);
    assert.equal((await transferir(e.db, e.actor, { origenId: a.id, destinoId: b.id, monto: 10, descripcion: null })).ok, false);
    assert.equal(await saldo(a.id), 500);
  });

  describe("con contabilización automática", () => {
    before(() => automatica(e.db, true));
    after(() => automatica(e.db, false));

    it("sin contrapartida (o igual a la propia caja) se rechaza completo", async () => {
      const c = await crearCajaTesoreria(e, "VES");
      const asientos0 = await e.db.asiento.count();
      assert.equal((await registrarMovimientoManual(e.db, e.actor, { cuentaId: c.id, tipo: "INGRESO", monto: 100, descripcion: "Capital", documento: null })).ok, false);
      assert.equal((await registrarMovimientoManual(e.db, e.actor, { cuentaId: c.id, tipo: "INGRESO", monto: 100, descripcion: "Capital", documento: null, contrapartidaId: c.cuentaContableId })).ok, false);
      assert.equal(await saldo(c.id), 0);
      assert.equal(await movs(c.id), 0);
      assert.equal(await e.db.asiento.count(), asientos0);
    });

    it("el ingreso genera un asiento cuadrado y el egreso lo invierte", async () => {
      const c = await crearCajaTesoreria(e, "VES");
      assert.deepEqual(await registrarMovimientoManual(e.db, e.actor, { cuentaId: c.id, tipo: "INGRESO", monto: 1000, descripcion: "Aporte", documento: null, contrapartidaId: capitalId }), { ok: true });
      const a = await e.db.asiento.findFirstOrThrow({ where: { origen: "TESORERIA" }, orderBy: { numero: "desc" }, include: { lineas: true } });
      const debe = a.lineas.filter((l) => Number(l.debe) > 0).map((l) => [l.cuentaId, Number(l.debe)]);
      const haber = a.lineas.filter((l) => Number(l.haber) > 0).map((l) => [l.cuentaId, Number(l.haber)]);
      assert.deepEqual(debe, [[c.cuentaContableId, 1000]]);
      assert.deepEqual(haber, [[capitalId, 1000]]);
      assert.deepEqual(await registrarMovimientoManual(e.db, e.actor, { cuentaId: c.id, tipo: "EGRESO", monto: 400, descripcion: "Retiro", documento: null, contrapartidaId: capitalId }), { ok: true });
      const b = await e.db.asiento.findFirstOrThrow({ where: { origen: "TESORERIA" }, orderBy: { numero: "desc" }, include: { lineas: true } });
      assert.equal(Number(b.lineas.find((l) => l.cuentaId === c.cuentaContableId)!.haber), 400);
    });

    it("una caja en dólares se contabiliza en bolívares a la tasa del día", async () => {
      const c = await crearCajaTesoreria(e, "USD");
      assert.deepEqual(await registrarMovimientoManual(e.db, e.actor, { cuentaId: c.id, tipo: "INGRESO", monto: 100, descripcion: "Aporte USD", documento: null, contrapartidaId: capitalId }), { ok: true });
      const a = await e.db.asiento.findFirstOrThrow({ where: { origen: "TESORERIA" }, orderBy: { numero: "desc" }, include: { lineas: true } });
      assert.equal(Number(a.lineas.find((l) => l.cuentaId === c.cuentaContableId)!.debe), 4000);
    });

    it("el libro contable queda cuadrado", async () => {
      assert.equal(await descuadreContable(e.db), 0);
    });
  });
});
