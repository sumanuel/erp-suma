import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { emitirFactura, registrarNumerosFiscales } from "../src/lib/facturacion/servicio";
import { anularNotaVenta, crearNotaVenta, registrarDatosFiscalesNota } from "../src/lib/notas/servicio";
import { abrirEntorno, crearCliente, crearProducto, fijarTasa, unico, type Entorno } from "./soporte/entorno";

describe("Datos fiscales de facturas y notas (número, control e impresora)", () => {
  let e: Entorno;
  before(async () => { e = await abrirEntorno(); await fijarTasa(e.db, 40); });
  after(async () => { await e.db.tipoDocumento.update({ where: { codigo: "FACTURA" }, data: { fiscalAutomatico: false, serieFiscalId: null } }); });

  const factura = async () => {
    const cli = await crearCliente(e.db);
    const p = await crearProducto(e, { existencia: 20, precio: 10, costo: 4, exento: true });
    const f = await emitirFactura(e.db, e.actor, { clienteId: cli.id, almacenId: e.almacenId, observaciones: null, diasCredito: 0, lineas: [{ productoCodigo: p.codigo, cantidad: 10, precioUnitario: 10, descuento: 0 }] });
    assert.ok(f.ok, f.ok ? "" : f.error);
    return f.id;
  };
  const nota = async (facturaId: string, tipo: "CREDITO" | "DEBITO") => {
    const r = await crearNotaVenta(e.db, e.actor, { modo: tipo === "CREDITO" ? "AJUSTE" : "CARGO", tipo, facturaId, motivo: "Prueba fiscal", base: 1, ivaPorcentaje: 0 } as Parameters<typeof crearNotaVenta>[2]);
    assert.ok(r.ok, r.ok ? "" : r.error);
    return r.id;
  };
  const sinNumeros = { numeroFiscal: null, numeroControl: null };

  it("la factura guarda número e impresora; el mismo número se admite en otra impresora y se rechaza en la misma", async () => {
    const numero = unico("F").slice(0, 20), serialA = unico("SA").slice(0, 20), serialB = unico("SB").slice(0, 20);
    const a = await factura(), b = await factura(), c = await factura();
    assert.ok((await registrarNumerosFiscales(e.db, e.actor, a, { ...sinNumeros, numeroFiscal: numero, impresoraSerial: serialA, impresoraModelo: "PF-300" })).ok);
    const fa = await e.db.factura.findUniqueOrThrow({ where: { id: a } });
    assert.deepEqual([fa.numeroFiscal, fa.impresoraSerial, fa.impresoraModelo], [numero, serialA, "PF-300"]);
    assert.ok((await registrarNumerosFiscales(e.db, e.actor, b, { ...sinNumeros, numeroFiscal: numero, impresoraSerial: serialB })).ok, "otra impresora");
    const rep = await registrarNumerosFiscales(e.db, e.actor, c, { ...sinNumeros, numeroFiscal: numero, impresoraSerial: serialA });
    assert.equal(rep.ok, false);
    assert.match(rep.ok ? "" : rep.error, /ya está en otra factura/);
  });

  it("cada dato se escribe una sola vez, pero se puede completar lo que falta; completar con una impresora no puede crear un repetido", async () => {
    const numero = unico("F").slice(0, 20), serial = unico("S").slice(0, 20);
    const a = await factura(), b = await factura();
    assert.ok((await registrarNumerosFiscales(e.db, e.actor, a, { ...sinNumeros, numeroFiscal: numero })).ok);
    assert.equal((await registrarNumerosFiscales(e.db, e.actor, a, { ...sinNumeros, numeroFiscal: "OTRO1" })).ok, false, "no se cambia");
    assert.ok((await registrarNumerosFiscales(e.db, e.actor, a, { ...sinNumeros, impresoraSerial: serial })).ok, "completa el serial");
    assert.equal((await registrarNumerosFiscales(e.db, e.actor, a, { ...sinNumeros, impresoraSerial: "OTROSERIAL" })).ok, false);
    // b tiene el mismo número sin serial (permitido); ponerle el serial de «a» lo duplicaría.
    assert.ok((await registrarNumerosFiscales(e.db, e.actor, b, { ...sinNumeros, numeroFiscal: numero })).ok);
    assert.equal((await registrarNumerosFiscales(e.db, e.actor, b, { ...sinNumeros, impresoraSerial: serial })).ok, false);
    assert.equal((await registrarNumerosFiscales(e.db, e.actor, b, sinNumeros)).ok, false, "sin ningún dato");
    assert.equal((await registrarNumerosFiscales(e.db, e.actor, b, { ...sinNumeros, impresoraSerial: "con espacio" })).ok, false);
  });

  it("la base impide dos facturas con el mismo número en la misma impresora aunque se salte el servicio", async () => {
    const numero = unico("F").slice(0, 20), serial = unico("S").slice(0, 20);
    const a = await factura(), b = await factura();
    await e.db.factura.update({ where: { id: a }, data: { numeroFiscal: numero, impresoraSerial: serial } });
    await assert.rejects(e.db.factura.update({ where: { id: b }, data: { numeroFiscal: numero, impresoraSerial: serial } }));
  });

  it("las notas guardan sus datos fiscales; crédito y débito pueden repetir número, el mismo tipo no, y una anulada no admite datos", async () => {
    const numero = unico("N").slice(0, 20), serial = unico("S").slice(0, 20);
    const f = await factura();
    const nc = await nota(f, "CREDITO"), nd = await nota(f, "DEBITO"), nc2 = await nota(f, "CREDITO");
    const datos = { numeroFiscal: numero, numeroControl: unico("C").slice(0, 20), impresoraSerial: serial, impresoraModelo: "PF-300" };
    assert.ok((await registrarDatosFiscalesNota(e.db, e.actor, nc, datos)).ok);
    const n = await e.db.notaVenta.findUniqueOrThrow({ where: { id: nc } });
    assert.deepEqual([n.numeroFiscal, n.numeroControl, n.impresoraSerial, n.impresoraModelo], [numero, datos.numeroControl, serial, "PF-300"]);
    assert.ok((await registrarDatosFiscalesNota(e.db, e.actor, nd, { ...sinNumeros, numeroFiscal: numero, impresoraSerial: serial })).ok, "la de débito es otra serie");
    assert.equal((await registrarDatosFiscalesNota(e.db, e.actor, nc2, { ...sinNumeros, numeroFiscal: numero, impresoraSerial: serial })).ok, false);
    assert.equal((await registrarDatosFiscalesNota(e.db, e.actor, nc, { ...sinNumeros, numeroFiscal: "OTRO2" })).ok, false, "una sola vez");
    assert.ok(await e.db.auditoriaCambio.findFirst({ where: { entidad: "nota_venta", entidadId: nc, accion: "editar" } }), "queda auditado");
    assert.ok((await anularNotaVenta(e.db, e.actor, nc2, "Prueba")).ok);
    const r = await registrarDatosFiscalesNota(e.db, e.actor, nc2, { ...sinNumeros, numeroFiscal: unico("N").slice(0, 20) });
    assert.match(r.ok ? "" : r.error, /anulada/);
  });

  it("con numeración automática la factura copia el serial y el modelo de la serie elegida", async () => {
    const serie = await e.db.serieFiscal.create({ data: { serie: unico("SR").slice(0, 10), serial: unico("Z").slice(0, 20), impresora: "Modelo de prueba", documento: "FACTURA" } });
    const base = 700_000 + Math.floor(Math.random() * 50_000);
    await e.db.tipoDocumento.update({ where: { codigo: "FACTURA" }, data: { fiscalAutomatico: true, serieFiscalId: serie.id, ultimoFiscal: base, ultimoControl: base } });
    const id = await factura();
    const f = await e.db.factura.findUniqueOrThrow({ where: { id } });
    assert.equal(f.numeroFiscal, String(base + 1).padStart(8, "0"));
    assert.deepEqual([f.impresoraSerial, f.impresoraModelo], [serie.serial, "Modelo de prueba"]);
  });
});
