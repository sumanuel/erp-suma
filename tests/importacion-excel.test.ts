import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import writeExcelFile from "write-excel-file/node";
import { importarMaestro, plantillaMaestro } from "../src/lib/maestros/importacion";
import { marcas } from "../src/lib/maestros/catalogos";
import { productos } from "../src/lib/maestros/productos";
import { bancos, transportes, vendedores } from "../src/lib/maestros/tablas";
import { clientes, proveedores } from "../src/lib/maestros/terceros";
import type { Maestro } from "../src/lib/maestros/tipos";
import { abrirEntorno, unico, type Entorno } from "./soporte/entorno";

const camposDe = async (m: Maestro, db: Entorno["db"]) => (typeof m.campos === "function" ? m.campos(db) : m.campos);

async function xlsx(filas: (string | number | boolean | null)[][]) {
  return Buffer.from(await writeExcelFile([{ data: filas.map((f) => f.map((v) => (v === null ? null : { value: v }))), sheet: "Datos" }]).toBuffer());
}

describe("Importación desde Excel de maestros", () => {
  let e: Entorno;
  before(async () => { e = await abrirEntorno(); });

  it("la plantilla es un .xlsx con los títulos de los campos", async () => {
    const campos = await camposDe(bancos, e.db);
    const buf = await plantillaMaestro(bancos, campos);
    assert.equal(buf.subarray(0, 2).toString(), "PK");
    const { readSheet } = await import("read-excel-file/node");
    const hoja = (await readSheet(buf)) as string[][];
    assert.ok(hoja[0].some((t) => t.startsWith("Código")));
    assert.ok(hoja[0].some((t) => t.startsWith("Nombre")));
  });

  it("bancos: valida sin guardar y luego importa", async () => {
    const campos = await camposDe(bancos, e.db);
    const c1 = unico("B").slice(0, 10), c2 = unico("B").slice(0, 10);
    const archivo = await xlsx([["Código", "Nombre", "Teléfono 1", "Activo"], [c1, "Banco de prueba uno", "02121112233", "Sí"], [c2, "Banco de prueba dos", null, "No"]]);
    const previa = await importarMaestro(bancos, e.db, e.actor, campos, archivo, false);
    assert.equal(previa.error, undefined);
    assert.equal(previa.validas, 2);
    assert.equal(previa.filas.length, 0);
    assert.equal(await e.db.banco.count({ where: { codigo: { in: [c1.toUpperCase(), c2.toUpperCase()] } } }), 0, "validar no guarda");
    const r = await importarMaestro(bancos, e.db, e.actor, campos, archivo, true);
    assert.equal(r.confirmada, true);
    const b = await e.db.banco.findMany({ where: { codigo: { in: [c1.toUpperCase(), c2.toUpperCase()] } }, orderBy: { codigo: "asc" } });
    assert.equal(b.length, 2);
    assert.equal(b.find((x) => x.codigo === c2.toUpperCase())?.activo, false);
    assert.equal(b.find((x) => x.codigo === c1.toUpperCase())?.telefono1, "02121112233");
    // Una auditoría por cada banco creado.
    assert.equal(await e.db.auditoriaCambio.count({ where: { entidad: "banco", accion: "crear", descripcion: { in: ["Banco de prueba uno", "Banco de prueba dos"] } } }) >= 2, true);
  });

  it("si una fila falla no se importa nada y se indica fila y motivo (incluido un código repetido en el archivo y uno ya existente)", async () => {
    const campos = await camposDe(bancos, e.db);
    const ya = unico("B").slice(0, 10);
    await e.db.banco.create({ data: { codigo: ya.toUpperCase(), nombre: "Existente" } });
    const nuevo = unico("B").slice(0, 10);
    const archivo = await xlsx([["Código", "Nombre"], [nuevo, "Nuevo bueno"], [ya, "Repetido con la base"], [nuevo, "Repetido en el archivo"], ["", "Sin código"]]);
    const r = await importarMaestro(bancos, e.db, e.actor, campos, archivo, true);
    assert.equal(r.confirmada, false);
    assert.equal(r.validas, 1);
    assert.deepEqual(r.filas.map((f) => f.fila), [3, 4, 5]);
    assert.match(r.filas[0].mensajes.join(" "), /Ya existe/);
    assert.match(r.filas[2].mensajes.join(" "), /obligatorio/i);
    assert.equal(await e.db.banco.count({ where: { codigo: nuevo.toUpperCase() } }), 0, "nada se guardó");
  });

  it("clientes: acepta selecciones por nombre, sí/no y toma los valores iniciales de lo que no viene", async () => {
    const campos = await camposDe(clientes, e.db);
    const doc = `J${Date.now().toString().slice(-8)}`;
    const archivo = await xlsx([["Razón social", "RIF / documento", "Tipo", "Lista de precios", "Contribuyente de IVA", "Teléfono"], ["Cliente importado SA", doc, "Público", "B", "No", "04141234567"]]);
    const r = await importarMaestro(clientes, e.db, e.actor, campos, archivo, true);
    assert.equal(r.confirmada, true, JSON.stringify(r.filas));
    const c = await e.db.cliente.findFirstOrThrow({ where: { documento: doc } });
    assert.equal(c.tipo, "Público");
    assert.equal(c.listaPrecio, "B");
    assert.equal(c.contribuyente, false);
    assert.equal(c.residente, true, "valor inicial");
    assert.equal(c.situacion, "NORMAL");
  });

  it("clientes: opciones que no existen, documento inválido y columnas desconocidas", async () => {
    const campos = await camposDe(clientes, e.db);
    const archivo = await xlsx([["Razón social", "RIF / documento", "Lista de precios", "Columna rara"], ["Sin lista", "J12345678", "Z", "x"], ["Documento corto", "J1", "A", "x"]]);
    const r = await importarMaestro(clientes, e.db, e.actor, campos, archivo, false);
    assert.deepEqual(r.ignoradas, ["Columna rara"]);
    assert.equal(r.filas.length, 2);
    assert.match(r.filas[0].mensajes.join(" "), /no es una opción válida/);
    assert.match(r.filas[1].mensajes.join(" "), /Documento inválido/);
  });

  it("productos: categoría y alícuota por nombre, precio con coma decimal", async () => {
    const cat = await e.db.categoria.create({ data: { codigo: unico("CT").slice(0, 10), nombre: unico("Categoría ") } });
    const campos = await camposDe(productos, e.db);
    const cod = unico("PRD").slice(0, 20);
    const archivo = await xlsx([["Código", "Descripción", "Categoría", "Alícuota de IVA", "Precio de lista A (USD)"], [cod, "Producto importado", cat.nombre, "General", "12,5"]]);
    const r = await importarMaestro(productos, e.db, e.actor, campos, archivo, true);
    assert.equal(r.confirmada, true, JSON.stringify(r.filas));
    const p = await e.db.producto.findFirstOrThrow({ where: { codigo: cod.toUpperCase() } });
    assert.equal(Number(p.precioLista), 12.5);
    assert.equal(p.categoriaId, cat.id);
  });

  it("vendedores, transportes y marcas: se importan y respetan valores iniciales y duplicados", async () => {
    const cv = unico("V").slice(0, 10), ct = unico("T").slice(0, 10), cm = unico("M").slice(0, 20);
    const rv = await importarMaestro(vendedores, e.db, e.actor, await camposDe(vendedores, e.db), await xlsx([["Código", "Nombre", "Cédula", "Es cobrador"], [cv, "Vendedora importada", "V12345678", "Sí"]]), true);
    assert.equal(rv.confirmada, true, JSON.stringify(rv.filas));
    const v = await e.db.vendedor.findFirstOrThrow({ where: { codigo: cv.toUpperCase() } });
    assert.equal(v.esVendedor, true, "valor inicial: es vendedor");
    assert.equal(v.esCobrador, true);
    const rt = await importarMaestro(transportes, e.db, e.actor, await camposDe(transportes, e.db), await xlsx([["Código", "Descripción"], [ct, "Transporte importado"]]), true);
    assert.equal(rt.confirmada, true, JSON.stringify(rt.filas));
    const campM = await camposDe(marcas, e.db);
    const rm = await importarMaestro(marcas, e.db, e.actor, campM, await xlsx([["Código", "Nombre"], [cm, "Marca importada"]]), true);
    assert.equal(rm.confirmada, true, JSON.stringify(rm.filas));
    const otra = await importarMaestro(marcas, e.db, e.actor, campM, await xlsx([["Código", "Nombre"], [cm, "Repetida"]]), true);
    assert.equal(otra.confirmada, false);
    assert.match(otra.filas[0].mensajes.join(" "), /Ya existe/);
  });

  it("proveedores: faltan columnas obligatorias", async () => {
    const campos = await camposDe(proveedores, e.db);
    const r = await importarMaestro(proveedores, e.db, e.actor, campos, await xlsx([["Teléfono"], ["04141234567"]]), false);
    assert.match(r.error ?? "", /Faltan columnas obligatorias/);
  });

  it("un archivo que no es Excel se rechaza con un mensaje claro", async () => {
    const campos = await camposDe(bancos, e.db);
    const r = await importarMaestro(bancos, e.db, e.actor, campos, Buffer.from("codigo,nombre\nA,B"), false);
    assert.match(r.error ?? "", /No se pudo leer el archivo/);
  });
});

describe("Geografía de Venezuela de fábrica", () => {
  it("cada cliente trae los 24 estados, 335 municipios y sus parroquias, enlazados", async () => {
    const e = await abrirEntorno();
    const pais = await e.db.pais.findUniqueOrThrow({ where: { codigo: "VE" } });
    assert.equal(await e.db.estado.count({ where: { paisId: pais.id } }), 24);
    assert.equal(await e.db.municipio.count({ where: { estado: { paisId: pais.id } } }), 335);
    assert.ok((await e.db.parroquia.count({ where: { municipio: { estado: { paisId: pais.id } } } })) >= 1100);
    const miranda = await e.db.estado.findFirstOrThrow({ where: { paisId: pais.id, nombre: "Miranda" }, include: { municipios: true } });
    assert.ok(miranda.municipios.some((m) => m.nombre === "Sucre"));
    assert.equal(await e.db.estado.count({ where: { nombre: "Vargas" } }), 0, "se llama La Guaira");
    assert.equal(await e.db.estado.count({ where: { nombre: "La Guaira" } }), 1);
  });
});
