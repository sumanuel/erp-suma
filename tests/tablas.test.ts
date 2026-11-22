import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { abrirEntorno, unico, type Entorno } from "./soporte/entorno";

// Las reglas de las tablas base las hace cumplir la propia base de datos (aunque alguien se salte la pantalla).
describe("Tablas base", () => {
  let e: Entorno;
  before(async () => {
    e = await abrirEntorno();
  });
  const rechaza = (p: Promise<unknown>) => assert.rejects(p);

  it("el código no se repite en ningún catálogo", async () => {
    const c = unico("C");
    await e.db.condicionPago.create({ data: { codigo: c, nombre: "A" } });
    await rechaza(e.db.condicionPago.create({ data: { codigo: c, nombre: "B" } }));
    await e.db.vendedor.create({ data: { codigo: c, nombre: "V" } });
    await rechaza(e.db.vendedor.create({ data: { codigo: c, nombre: "V2" } }));
    await e.db.banco.create({ data: { codigo: c, nombre: "Banco" } });
    await rechaza(e.db.banco.create({ data: { codigo: c, nombre: "Banco 2" } }));
  });

  it("condición de pago: los días deben estar entre 0 y 365", async () => {
    for (const dias of [-1, 366]) await rechaza(e.db.condicionPago.create({ data: { codigo: unico("D"), nombre: "X", dias } }));
    await e.db.condicionPago.create({ data: { codigo: unico("D"), nombre: "30 días", dias: 30, diasMora: 5 } });
  });

  it("vendedor: debe ser vendedor, cobrador o ambos", async () => {
    await rechaza(e.db.vendedor.create({ data: { codigo: unico("V"), nombre: "Nadie", esVendedor: false, esCobrador: false } }));
    await e.db.vendedor.create({ data: { codigo: unico("V"), nombre: "Cobrador", esVendedor: false, esCobrador: true } });
  });

  it("tipo de negocio: descuentos y leyendas entre 0 y 100", async () => {
    await rechaza(e.db.tipoNegocio.create({ data: { codigo: unico("T"), nombre: "X", descuento1: 101 } }));
    await rechaza(e.db.tipoNegocio.create({ data: { codigo: unico("T"), nombre: "X", segundaLeyendaPct: -1 } }));
    await e.db.tipoNegocio.create({ data: { codigo: unico("T"), nombre: "Mayorista", descuento1: 10, descuento2: 5, primeraLeyendaDias: 8, primeraLeyendaPct: 2 } });
  });

  it("tarifa de ISLR: porcentaje 0–100, tipo de persona y residencia válidos, concepto único", async () => {
    const codigo = Math.floor(Math.random() * 1e8) + 1000;
    await rechaza(e.db.tarifaRetencion.create({ data: { codigo, descripcion: "X", porcentaje: 120 } }));
    await rechaza(e.db.tarifaRetencion.create({ data: { codigo, descripcion: "X", tipoPersona: "OTRA" } }));
    await rechaza(e.db.tarifaRetencion.create({ data: { codigo, descripcion: "X", residente: "TAL VEZ" } }));
    await e.db.tarifaRetencion.create({ data: { codigo, descripcion: "Honorarios profesionales", tipoPersona: "NATURAL", residente: "SI", porcentaje: 3 } });
    await rechaza(e.db.tarifaRetencion.create({ data: { codigo, descripcion: "Repetida" } }));
  });

  it("transporte: puede ligarse a un proveedor y no se pierde al borrar el transporte", async () => {
    const p = await e.db.proveedor.create({ data: { documento: unico("P"), razonSocial: "Fletes SA" } });
    const t = await e.db.transporte.create({ data: { codigo: unico("TR"), nombre: "Fletes", proveedorId: p.id } });
    assert.equal((await e.db.transporte.findUniqueOrThrow({ where: { id: t.id } })).proveedorId, p.id);
  });

  it("geografía: el código es único dentro de su padre y no se borra un padre con hijos", async () => {
    const pais = await e.db.pais.create({ data: { codigo: unico("P"), nombre: "País de prueba" } });
    const estado = await e.db.estado.create({ data: { paisId: pais.id, codigo: "01", nombre: "Estado 1" } });
    await rechaza(e.db.estado.create({ data: { paisId: pais.id, codigo: "01", nombre: "Repetido" } }));
    const pais2 = await e.db.pais.create({ data: { codigo: unico("P"), nombre: "Otro país" } });
    await e.db.estado.create({ data: { paisId: pais2.id, codigo: "01", nombre: "Mismo código, otro país" } });
    const mun = await e.db.municipio.create({ data: { estadoId: estado.id, codigo: "01", nombre: "Municipio" } });
    await e.db.parroquia.create({ data: { municipioId: mun.id, codigo: "01", nombre: "Parroquia" } });
    await rechaza(e.db.pais.delete({ where: { id: pais.id } }));
    await rechaza(e.db.estado.delete({ where: { id: estado.id } }));
    await rechaza(e.db.municipio.delete({ where: { id: mun.id } }));
  });
});
