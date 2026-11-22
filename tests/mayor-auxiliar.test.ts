import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { balancePorAuxiliar, libroMayor } from "../src/lib/contabilidad/reportes";
import { anularAsiento, registrarAsiento } from "../src/lib/contabilidad/servicio";
import { abrirEntorno, unico, type Entorno } from "./soporte/entorno";

const ANIO = 2018;
describe("Mayor y balance por auxiliar", () => {
  let e: Entorno;
  const ids: string[] = [];
  before(async () => { e = await abrirEntorno(); });
  after(async () => { for (const id of ids) await anularAsiento(e.db, e.actor, id, "limpieza de la prueba"); });

  it("el balance suma por auxiliar y el mayor se puede filtrar por uno", async () => {
    const caja = await e.db.cuentaContable.findUniqueOrThrow({ where: { codigo: "1.1.02" } });
    const otra = await e.db.cuentaContable.findUniqueOrThrow({ where: { codigo: "4.1.01" } });
    const a1 = await e.db.auxiliarContable.create({ data: { cuentaId: caja.id, codigo: unico("AX"), nombre: "Cliente uno" } });
    const a2 = await e.db.auxiliarContable.create({ data: { cuentaId: caja.id, codigo: unico("AX"), nombre: "Cliente dos" } });
    const mov = async (mes: number, auxiliarId: string | null, monto: number) => {
      const r = await registrarAsiento(e.db, e.actor, { fecha: new Date(Date.UTC(ANIO, mes - 1, 10)), descripcion: "Prueba de auxiliares", referencia: null, lineas: [{ cuentaId: caja.id, auxiliarId, descripcion: null, debe: monto, haber: 0 }, { cuentaId: otra.id, descripcion: null, debe: 0, haber: monto }] });
      assert.ok(r.ok, r.ok ? "" : r.error);
      ids.push(r.id);
    };
    await mov(1, a1.id, 100);
    await mov(2, a2.id, 50);
    await mov(3, a1.id, 25);
    await mov(3, null, 7);
    const filas = await balancePorAuxiliar(e.db, caja.id, new Date(Date.UTC(ANIO, 1, 1)), new Date(Date.UTC(ANIO, 11, 31)));
    const f = (id: string | null) => filas.find((x) => x.auxiliarId === id)!;
    assert.deepEqual([f(a1.id).saldoInicial, f(a1.id).debe, f(a1.id).saldoFinal], [10000, 2500, 12500]);
    assert.deepEqual([f(a2.id).saldoInicial, f(a2.id).debe, f(a2.id).saldoFinal], [0, 5000, 5000]);
    assert.equal(f(null).saldoFinal >= 700, true);
    const m1 = await libroMayor(e.db, caja.id, new Date(Date.UTC(ANIO, 0, 1)), new Date(Date.UTC(ANIO, 11, 31)), a1.id);
    assert.equal(m1.movimientos.length, 2);
    assert.equal(m1.saldoFinal, 12500);
  });
});

describe("Estructura de costos", () => {
  it("costos y gastos con su porcentaje sobre los ingresos del período", async () => {
    const e = await abrirEntorno();
    const { reporteEstructuraCostos } = await import("../src/lib/reportes/financieros");
    const ids: string[] = [];
    const [caja, ventas, costo, inv] = await Promise.all(["1.1.01", "4.1.01", "5.1.01", "1.1.03"].map(async (c) => (await e.db.cuentaContable.findUniqueOrThrow({ where: { codigo: c } })).id));
    const mov = async (lineas: { cuentaId: string; debe: number; haber: number }[]) => {
      const r = await registrarAsiento(e.db, e.actor, { fecha: new Date(Date.UTC(2017, 4, 10)), descripcion: "Prueba de estructura", referencia: null, lineas: lineas.map((l) => ({ ...l, descripcion: null })) });
      assert.ok(r.ok);
      ids.push(r.id);
    };
    await mov([{ cuentaId: caja, debe: 200, haber: 0 }, { cuentaId: ventas, debe: 0, haber: 200 }]);
    await mov([{ cuentaId: costo, debe: 50, haber: 0 }, { cuentaId: inv, debe: 0, haber: 50 }]);
    const r = await reporteEstructuraCostos(e.db, { desde: "2017-01-01", hasta: "2017-12-31" });
    const fila = (t: string) => r.filas.find((f) => f.cuenta === t)!;
    assert.equal(fila("Ingresos del período").saldo, 200);
    assert.equal(fila("Total costos y gastos").saldo, 50);
    assert.equal(fila("Total costos y gastos").sobreIngresos, 25);
    assert.equal(fila("Utilidad del período").saldo, 150);
    for (const id of ids) await anularAsiento(e.db, e.actor, id, "limpieza de la prueba");
  });
});
