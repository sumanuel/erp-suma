import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { liquidarImportacion } from "../src/lib/importaciones/calculos";
import { anularImportacion, guardarImportacion, procesarImportacion, type DatosImportacion } from "../src/lib/importaciones/servicio";
import { abrirEntorno, crearProducto, crearProveedor, hoy, type Entorno } from "./soporte/entorno";

describe("Importaciones: liquidación del costo y entrada al inventario", () => {
  let e: Entorno;
  before(async () => {
    e = await abrirEntorno();
  });
  const existencia = async (codigo: string) => Number((await e.db.existencia.findFirst({ where: { productoCodigo: codigo, almacenId: e.almacenId } }))?.cantidad ?? 0);

  it("la fórmula del original: FOB → CIF → gastos prorrateados por valor CIF → arancel sobre la base con «otros» → costo unitario", () => {
    const r = liquidarImportacion(
      [{ cantidad: 10, fobUnitario: 5, arancelPct: 10 }, { cantidad: 20, fobUnitario: 2, arancelPct: 0 }],
      { cambioUsd: 1, factorCif: 1.1, factorOtros: 0.1, gastosUsd: 33 },
    );
    assert.deepEqual([r.filas[0].fobUsd, r.filas[0].cifUsd, r.filas[0].gastoUsd, r.filas[0].arancelUsd, r.filas[0].totalUsd], [50, 55, 18.3333, 6.05, 79.3833]);
    assert.equal(r.filas[0].costoUnitarioUsd, 7.93833333);
    assert.deepEqual([r.filas[1].cifUsd, r.filas[1].gastoUsd, r.filas[1].totalUsd, r.filas[1].costoUnitarioUsd], [44, 14.6667, 58.6667, 2.93333333]);
    assert.equal(r.totales.totalUsd, 138.05); // 79,3833 + 58,6667 = 138,05: los gastos (33) y el arancel (6,05) quedan completos en el costo
    assert.equal(r.totales.cifUsd + r.totales.gastoUsd + r.totales.arancelUsd, r.totales.totalUsd);
  });

  it("el cambio convierte el FOB de otra moneda a USD", () => {
    const r = liquidarImportacion([{ cantidad: 10, fobUnitario: 100, arancelPct: 0 }], { cambioUsd: 1.08, factorCif: 1, factorOtros: 0, gastosUsd: 0 });
    assert.equal(r.filas[0].fobUsd, 1080);
    assert.equal(r.filas[0].costoUnitarioUsd, 108);
  });

  const datos = (proveedorId: string, a: { codigo: string }, b: { codigo: string }): DatosImportacion => ({
    proveedorId, documento: "INV-2026-001", fecha: hoy(), almacenId: e.almacenId, moneda: "USD", cambioUsd: 1, factorCif: 1.1, factorOtros: 0.1, observaciones: null,
    lineas: [{ productoCodigo: a.codigo, cantidad: 10, fobUnitario: 5, arancelPct: 10 }, { productoCodigo: b.codigo, cantidad: 20, fobUnitario: 2, arancelPct: 0 }],
    gastos: [{ descripcion: "Flete interno", montoUsd: 20 }, { descripcion: "Agente aduanal", montoUsd: 13 }],
  });

  it("guardar liquida; procesar mete la mercancía al costo liquidado (costo promedio) y no se procesa dos veces; anular la saca", async () => {
    const prov = await crearProveedor(e.db);
    const a = await crearProducto(e, { existencia: 0 });
    const b = await crearProducto(e, { existencia: 0 });
    const g = await guardarImportacion(e.db, e.actor, null, datos(prov.id, a, b));
    assert.ok(g.ok, g.ok ? "" : g.error);
    const imp = await e.db.importacion.findUniqueOrThrow({ where: { id: g.id }, include: { lineas: { orderBy: { linea: "asc" } } } });
    assert.equal(Number(imp.totalUsd), 138.05);
    assert.equal(Number(imp.gastosUsd), 33);
    assert.equal(Number(imp.lineas[0].costoUnitarioUsd), 7.93833333);
    assert.equal(await existencia(a.codigo), 0); // borrador: no toca inventario
    // Editar en borrador recalcula
    const ed = await guardarImportacion(e.db, e.actor, g.id, { ...datos(prov.id, a, b), gastos: [] });
    assert.ok(ed.ok);
    assert.equal(Number((await e.db.importacion.findUniqueOrThrow({ where: { id: g.id } })).totalUsd), 105.05);
    assert.ok((await guardarImportacion(e.db, e.actor, g.id, datos(prov.id, a, b))).ok);
    const p = await procesarImportacion(e.db, e.actor, g.id);
    assert.ok(p.ok, p.ok ? "" : p.error);
    assert.equal(await existencia(a.codigo), 10);
    assert.equal(await existencia(b.codigo), 20);
    const pa = await e.db.producto.findUniqueOrThrow({ where: { codigo: a.codigo } });
    assert.equal(Math.round(Number(pa.costoPromedio) * 1e4) / 1e4, 7.9383);
    assert.equal((await procesarImportacion(e.db, e.actor, g.id)).ok, false);
    assert.equal((await guardarImportacion(e.db, e.actor, g.id, datos(prov.id, a, b))).ok, false); // ya no se edita
    assert.ok((await anularImportacion(e.db, e.actor, g.id, "factura duplicada")).ok);
    assert.equal(await existencia(a.codigo), 0);
    assert.equal((await anularImportacion(e.db, e.actor, g.id, "otra vez")).ok, false);
  });

  it("si lo importado ya se vendió, no se anula; y se rechazan datos inválidos", async () => {
    const prov = await crearProveedor(e.db);
    const a = await crearProducto(e, { existencia: 0 });
    const b = await crearProducto(e, { existencia: 0 });
    const g = await guardarImportacion(e.db, e.actor, null, datos(prov.id, a, b));
    assert.ok(g.ok);
    assert.ok((await procesarImportacion(e.db, e.actor, g.id)).ok);
    // Se vende parte del producto a:
    const { registrarMovimiento } = await import("../src/lib/inventario/movimientos");
    assert.ok((await registrarMovimiento(e.db, e.actor, { tipo: "SALIDA", almacenId: e.almacenId, productoCodigo: a.codigo, cantidad: 4, motivo: "venta" })).ok);
    const r = await anularImportacion(e.db, e.actor, g.id, "intento");
    assert.equal(r.ok, false);
    assert.equal((await e.db.importacion.findUniqueOrThrow({ where: { id: g.id } })).estado, "PROCESADA");
    assert.equal(await existencia(a.codigo), 6);
    const mal = (cambio: Partial<DatosImportacion>) => guardarImportacion(e.db, e.actor, null, { ...datos(prov.id, a, b), ...cambio });
    assert.equal((await mal({ lineas: [] })).ok, false);
    assert.equal((await mal({ cambioUsd: 0 })).ok, false);
    assert.equal((await mal({ lineas: [{ productoCodigo: a.codigo, cantidad: 1, fobUnitario: 1, arancelPct: 0 }, { productoCodigo: a.codigo, cantidad: 1, fobUnitario: 1, arancelPct: 0 }] })).ok, false);
    assert.equal((await mal({ gastos: [{ descripcion: "x", montoUsd: 0 }] })).ok, false);
    assert.equal((await mal({ moneda: "dólar" })).ok, false);
  });
});
