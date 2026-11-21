import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { anularAsiento, cambiarEstadoPeriodo, registrarAsiento } from "../src/lib/contabilidad/servicio";
import { abrirEntorno, descuadreContable, type Entorno } from "./soporte/entorno";

describe("Contabilidad", () => {
  let e: Entorno;
  let caja: string, capital: string;
  before(async () => {
    e = await abrirEntorno();
    caja = (await e.db.cuentaContable.findFirstOrThrow({ where: { codigo: "1.1.01" } })).id;
    capital = (await e.db.cuentaContable.findFirstOrThrow({ where: { codigo: "3.1.01" } })).id;
  });
  const hoy = () => new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(new Date())}T00:00:00.000Z`);
  const asiento = (debe: number, haber: number, fecha = hoy()) => ({ fecha, descripcion: "Prueba", referencia: null, lineas: [{ cuentaId: caja, descripcion: null, debe, haber: 0 }, { cuentaId: capital, descripcion: null, debe: 0, haber }] });

  it("registra un asiento cuadrado", async () => {
    assert.equal((await registrarAsiento(e.db, e.actor, asiento(100.1, 100.1))).ok, true);
  });

  it("rechaza descuadrados, sin líneas, con montos negativos o con ambos lados", async () => {
    assert.equal((await registrarAsiento(e.db, e.actor, asiento(100, 99.99))).ok, false);
    assert.equal((await registrarAsiento(e.db, e.actor, { ...asiento(1, 1), lineas: [] })).ok, false);
    assert.equal((await registrarAsiento(e.db, e.actor, asiento(-5, -5))).ok, false);
    const ambos = asiento(10, 10);
    ambos.lineas[0].haber = 10;
    assert.equal((await registrarAsiento(e.db, e.actor, ambos)).ok, false);
  });

  it("la base misma impide un asiento descuadrado (aunque se salte la aplicación)", async () => {
    const antes = await e.db.asiento.count();
    await assert.rejects(
      e.db.$transaction(async (tx) => {
        const a = await tx.asiento.create({ data: { fecha: hoy(), anio: 2026, mes: 1, descripcion: "trampa", usuarioId: e.actor.id, usuarioNombre: e.actor.nombre } as never });
        await tx.asientoLinea.create({ data: { asientoId: a.id, linea: 1, cuentaId: caja, debe: 50, haber: 0 } });
      }),
    );
    assert.equal(await e.db.asiento.count(), antes);
  });

  it("no permite cuentas no posteables (de agrupación)", async () => {
    const padre = await e.db.cuentaContable.findFirstOrThrow({ where: { posteable: false } });
    const a = asiento(10, 10);
    a.lineas[0].cuentaId = padre.id;
    assert.equal((await registrarAsiento(e.db, e.actor, a)).ok, false);
  });

  it("período cerrado rechaza asientos; reabrirlo los permite", async () => {
    const f = new Date("2020-03-15T00:00:00.000Z");
    assert.equal((await cambiarEstadoPeriodo(e.db, e.actor, 2020, 3, true)).ok, true);
    assert.equal((await registrarAsiento(e.db, e.actor, asiento(10, 10, f))).ok, false);
    assert.equal((await cambiarEstadoPeriodo(e.db, e.actor, 2020, 3, false)).ok, true);
    assert.equal((await registrarAsiento(e.db, e.actor, asiento(10, 10, f))).ok, true);
  });

  it("anular no borra: queda en el historial como ANULADO con su motivo y no se anula dos veces", async () => {
    const r = await registrarAsiento(e.db, e.actor, asiento(321.45, 321.45));
    assert.ok(r.ok);
    const antes = await e.db.asiento.count();
    assert.equal((await anularAsiento(e.db, e.actor, r.id, "Error de captura")).ok, true);
    assert.equal(await e.db.asiento.count(), antes);
    assert.equal((await anularAsiento(e.db, e.actor, r.id, "Otra vez")).ok, false);
    const a = await e.db.asiento.findUniqueOrThrow({ where: { id: r.id } });
    assert.equal(a.estado, "ANULADO");
    assert.equal(a.motivoAnulacion, "Error de captura");
  });

  it("el libro completo queda cuadrado", async () => {
    assert.equal(await descuadreContable(e.db), 0);
  });
});
