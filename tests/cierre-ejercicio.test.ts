import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { cerrarEjercicio, previsualizarCierre, reabrirEjercicio } from "../src/lib/contabilidad/cierre";
import { anularAsiento, cambiarEstadoPeriodo, registrarAsiento } from "../src/lib/contabilidad/servicio";
import { balanceComprobacion } from "../src/lib/contabilidad/reportes";
import { abrirEntorno, type Entorno } from "./soporte/entorno";

// Año lejano y propio de la prueba (las demás pruebas trabajan con el día de hoy).
const ANIO = 2019;

describe("Cierre del ejercicio contable", () => {
  let e: Entorno;
  const ids: string[] = [];
  const cuenta = async (codigo: string) => (await e.db.cuentaContable.findUniqueOrThrow({ where: { codigo } })).id;
  const saldo = async (codigo: string) => {
    const b = await balanceComprobacion(e.db, new Date(Date.UTC(ANIO, 0, 1)), new Date(Date.UTC(ANIO, 11, 31)));
    return (b.filas.find((f) => f.codigo === codigo)?.saldoFinal ?? 0) / 100;
  };
  before(async () => {
    e = await abrirEntorno();
    // Si una corrida anterior (con la base reutilizada) dejó algo de ${ANIO}, se limpia.
    await reabrirEjercicio(e.db, e.actor, ANIO, "limpieza previa");
    for (const a of await e.db.asiento.findMany({ where: { anio: ANIO, estado: "REGISTRADO" }, select: { id: true } })) await anularAsiento(e.db, e.actor, a.id, "limpieza previa");
    const [caja, ventas, costo, inv, gasto] = await Promise.all(["1.1.01", "4.1.01", "5.1.01", "1.1.03", "6.1.04"].map(cuenta));
    const asiento = async (mes: number, lineas: { cuentaId: string; debe: number; haber: number }[]) => {
      const r = await registrarAsiento(e.db, e.actor, { fecha: new Date(Date.UTC(ANIO, mes - 1, 15)), descripcion: "Movimiento de prueba del cierre", referencia: null, lineas: lineas.map((l) => ({ ...l, descripcion: null })) });
      assert.ok(r.ok, r.ok ? "" : r.error);
      ids.push(r.id);
    };
    await asiento(3, [{ cuentaId: caja, debe: 100, haber: 0 }, { cuentaId: ventas, debe: 0, haber: 100 }]); // venta 100
    await asiento(6, [{ cuentaId: costo, debe: 40, haber: 0 }, { cuentaId: inv, debe: 0, haber: 40 }]); // costo 40
    await asiento(9, [{ cuentaId: gasto, debe: 10.5, haber: 0 }, { cuentaId: caja, debe: 0, haber: 10.5 }]); // gasto 10,50
    if (!(await e.db.cuentaConcepto.findUnique({ where: { concepto: "RESULTADO_EJERCICIO" } }))) {
      await e.db.cuentaConcepto.create({ data: { concepto: "RESULTADO_EJERCICIO", cuentaId: await cuenta("3.1.02") } });
    }
  });
  after(async () => {
    // Deja la base como estaba: se reabre (si quedó cerrado) y se anulan los asientos de la prueba.
    await reabrirEjercicio(e.db, e.actor, ANIO, "limpieza de la prueba");
    for (const id of ids) await anularAsiento(e.db, e.actor, id, "limpieza de la prueba");
  });

  it("la vista previa suma los resultados del año: utilidad = ingresos − costos − gastos", async () => {
    const p = await previsualizarCierre(e.db, ANIO);
    assert.equal(p.lineas.length, 3);
    assert.equal(p.resultado, 4950); // 100 − 40 − 10,50 = 49,50 Bs. (en centavos)
  });

  it("no se cierra un año que no ha terminado ni uno sin movimientos", async () => {
    assert.equal((await cerrarEjercicio(e.db, e.actor, new Date().getUTCFullYear() + 1)).ok, false);
    assert.equal((await cerrarEjercicio(e.db, e.actor, 2018)).ok, false);
  });

  it("cerrar: el asiento de cierre pone en cero ingresos, costos y gastos, lleva la utilidad a resultados acumulados y cierra los 12 períodos", async () => {
    const antes = await saldo("3.1.02");
    const r = await cerrarEjercicio(e.db, e.actor, ANIO);
    assert.ok(r.ok, r.ok ? "" : r.error);
    assert.equal(r.resultadoBs, 49.5);
    assert.equal(await saldo("4.1.01"), 0);
    assert.equal(await saldo("5.1.01"), 0);
    assert.equal(await saldo("6.1.04"), 0);
    assert.equal(Math.round(((await saldo("3.1.02")) - antes) * 100) / 100, -49.5); // saldo acreedor: utilidad
    const periodos = await e.db.periodoContable.findMany({ where: { anio: ANIO } });
    assert.equal(periodos.filter((p) => p.estado === "CERRADO").length, 12);
    const asiento = await e.db.asiento.findUniqueOrThrow({ where: { id: r.asientoId }, include: { lineas: true } });
    assert.equal(asiento.origen, "CIERRE_EJERCICIO");
    assert.equal(asiento.fecha.toISOString().slice(0, 10), `${ANIO}-12-31`);
    const debe = asiento.lineas.reduce((s, l) => s + Number(l.debe), 0), haber = asiento.lineas.reduce((s, l) => s + Number(l.haber), 0);
    assert.equal(Math.round(debe * 100), Math.round(haber * 100));
  });

  it("ya cerrado: no admite asientos, no se cierra dos veces ni se reabre un período suelto", async () => {
    const caja = await cuenta("1.1.01"), ventas = await cuenta("4.1.01");
    const r = await registrarAsiento(e.db, e.actor, { fecha: new Date(Date.UTC(ANIO, 4, 2)), descripcion: "Fuera de tiempo", referencia: null, lineas: [{ cuentaId: caja, descripcion: null, debe: 1, haber: 0 }, { cuentaId: ventas, descripcion: null, debe: 0, haber: 1 }] });
    assert.equal(r.ok, false);
    assert.equal((await cerrarEjercicio(e.db, e.actor, ANIO)).ok, false);
    assert.equal((await cambiarEstadoPeriodo(e.db, e.actor, ANIO, 3, false)).ok, false);
  });

  it("reabrir anula el asiento de cierre, reabre los períodos y los resultados vuelven; pide motivo", async () => {
    assert.equal((await reabrirEjercicio(e.db, e.actor, ANIO, "")).ok, false);
    assert.ok((await reabrirEjercicio(e.db, e.actor, ANIO, "se cerró por error")).ok);
    assert.equal(await saldo("4.1.01"), -100);
    assert.equal((await e.db.periodoContable.findMany({ where: { anio: ANIO, estado: "CERRADO" } })).length, 0);
    assert.equal((await reabrirEjercicio(e.db, e.actor, ANIO, "otra vez")).ok, false);
    assert.ok((await cerrarEjercicio(e.db, e.actor, ANIO)).ok); // se puede volver a cerrar
  });
});
