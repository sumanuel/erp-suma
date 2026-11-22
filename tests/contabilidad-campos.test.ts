import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { crearCuentaContable, editarCuentaContable, registrarAsiento } from "../src/lib/contabilidad/servicio";
import { reporteBalanceGeneral, reporteLibroDiario } from "../src/lib/reportes/financieros";
import { abrirEntorno, descuadreContable, hoy, unico, type Entorno } from "./soporte/entorno";

describe("Contabilidad: auxiliares, siglas, banderas de impresión, apertura y libro diario", () => {
  let e: Entorno;
  let caja: string, capital: string;
  before(async () => {
    e = await abrirEntorno();
    caja = (await e.db.cuentaContable.findFirstOrThrow({ where: { codigo: "1.1.01" } })).id;
    capital = (await e.db.cuentaContable.findFirstOrThrow({ where: { codigo: "3.1.01" } })).id;
  });
  const iso = () => hoy().toISOString().slice(0, 10);
  const asiento = (lineas: { cuentaId: string; debe: number; haber: number; auxiliarId?: string | null; referencia?: string; documento?: string }[], descripcion = "Prueba") =>
    ({ fecha: hoy(), descripcion, referencia: null, lineas: lineas.map((l) => ({ descripcion: "Concepto de línea", ...l })) });
  const aux = (cuentaId: string, extra: Record<string, unknown> = {}) => e.db.auxiliarContable.create({ data: { cuentaId, codigo: unico("AX"), nombre: "Banco Mercantil", ...extra } });

  it("auxiliar: código único por cuenta (puede repetirse en otra cuenta)", async () => {
    const a = await aux(caja);
    await assert.rejects(e.db.auxiliarContable.create({ data: { cuentaId: caja, codigo: a.codigo, nombre: "Repetido" } }));
    await e.db.auxiliarContable.create({ data: { cuentaId: capital, codigo: a.codigo, nombre: "Mismo código, otra cuenta" } });
  });

  it("la línea guarda auxiliar, referencia y documento; el auxiliar debe ser de la cuenta y estar activo", async () => {
    const a = await aux(caja);
    const otraCuenta = await aux(capital);
    const inactivo = await aux(caja, { activo: false });
    const ok = await registrarAsiento(e.db, e.actor, asiento([{ cuentaId: caja, debe: 100, haber: 0, auxiliarId: a.id, referencia: "REF-1", documento: "DEP-55" }, { cuentaId: capital, debe: 0, haber: 100 }]));
    assert.ok(ok.ok, JSON.stringify(ok));
    const l = await e.db.asientoLinea.findFirstOrThrow({ where: { asientoId: ok.id, cuentaId: caja }, include: { auxiliar: true } });
    assert.equal(l.auxiliarId, a.id);
    assert.equal(l.referencia, "REF-1");
    assert.equal(l.documento, "DEP-55");
    assert.equal((await registrarAsiento(e.db, e.actor, asiento([{ cuentaId: caja, debe: 10, haber: 0, auxiliarId: otraCuenta.id }, { cuentaId: capital, debe: 0, haber: 10 }]))).ok, false);
    assert.equal((await registrarAsiento(e.db, e.actor, asiento([{ cuentaId: caja, debe: 10, haber: 0, auxiliarId: inactivo.id }, { cuentaId: capital, debe: 0, haber: 10 }]))).ok, false);
    assert.equal((await registrarAsiento(e.db, e.actor, asiento([{ cuentaId: caja, debe: 10, haber: 0, auxiliarId: "00000000-0000-0000-0000-000000000000" }, { cuentaId: capital, debe: 0, haber: 10 }]))).ok, false);
    await assert.rejects(e.db.auxiliarContable.delete({ where: { id: a.id } })); // tiene movimientos
  });

  it("cuenta con siglas y banderas; se editan", async () => {
    const padre = await e.db.cuentaContable.findFirstOrThrow({ where: { codigo: "1.2" } });
    const codigo = `1.2.${String(Math.floor(Math.random() * 800) + 100)}`;
    const r = await crearCuentaContable(e.db, e.actor, { codigo, nombre: "Equipos de oficina", tipo: null, padreId: padre.id, posteable: true, siglas: "eqo", imprimeBalance: false, imprimeDiario: false });
    assert.ok(r.ok, JSON.stringify(r));
    const c = await e.db.cuentaContable.findUniqueOrThrow({ where: { id: r.id } });
    assert.equal(c.siglas, "EQO");
    assert.equal(c.imprimeBalance, false);
    assert.ok((await editarCuentaContable(e.db, e.actor, r.id, { nombre: "Equipos", posteable: true, activo: true, siglas: "EO", imprimeBalance: true })).ok);
    const d = await e.db.cuentaContable.findUniqueOrThrow({ where: { id: r.id } });
    assert.deepEqual([d.siglas, d.imprimeBalance, d.imprimeDiario], ["EO", true, false]);
  });

  it("balance general: una cuenta que no se imprime no se detalla pero sigue sumando y el balance cuadra", async () => {
    const hoja = await e.db.cuentaContable.create({ data: { codigo: `1.2.9${Math.floor(Math.random() * 90) + 10}`, nombre: "Cuenta oculta en balance", tipo: "ACTIVO", padreId: (await e.db.cuentaContable.findFirstOrThrow({ where: { codigo: "1.2" } })).id, nivel: 3, posteable: true, imprimeBalance: false } });
    assert.ok((await registrarAsiento(e.db, e.actor, asiento([{ cuentaId: hoja.id, debe: 777, haber: 0 }, { cuentaId: capital, debe: 0, haber: 777 }]))).ok);
    const b = await reporteBalanceGeneral(e.db, { hasta: iso() });
    assert.equal(b.filas.some((f) => String(f.cuenta).includes("Cuenta oculta en balance")), false);
    assert.ok(b.notas?.[0].startsWith("El balance cuadra"), b.notas?.[0]);
  });

  it("asiento de apertura: queda marcado y sale en el libro diario; las líneas de cuentas ocultas se omiten con aviso", async () => {
    const oculta = await e.db.cuentaContable.create({ data: { codigo: `1.2.8${Math.floor(Math.random() * 90) + 10}`, nombre: "Cuenta fuera del diario", tipo: "ACTIVO", padreId: (await e.db.cuentaContable.findFirstOrThrow({ where: { codigo: "1.2" } })).id, nivel: 3, posteable: true, imprimeDiario: false } });
    const r = await registrarAsiento(e.db, e.actor, asiento([{ cuentaId: caja, debe: 5000, haber: 0 }, { cuentaId: oculta.id, debe: 300, haber: 0 }, { cuentaId: capital, debe: 0, haber: 5300 }], "Saldos iniciales del ejercicio"), "APERTURA");
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal((await e.db.asiento.findUniqueOrThrow({ where: { id: r.id } })).origen, "APERTURA");
    const d = await reporteLibroDiario(e.db, { desde: iso(), hasta: iso() });
    assert.ok(d.filas.some((f) => String(f.cuenta).includes("Saldos iniciales del ejercicio") && f.detalle === "APERTURA"));
    assert.equal(d.filas.some((f) => String(f.cuenta).includes("Cuenta fuera del diario")), false);
    assert.ok(d.notas?.some((n) => n.includes("omiten")));
    assert.ok(d.filas.some((f) => f.documento === "DEP-55"));
  });

  it("el libro sigue cuadrado", async () => {
    assert.equal(await descuadreContable(e.db), 0);
  });
});
