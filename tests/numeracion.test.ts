import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { emitirFactura } from "../src/lib/facturacion/servicio";
import { guardarPedido } from "../src/lib/pedidos/servicio";
import { tiposDocumento } from "../src/lib/maestros/numeracion";
import { siguienteNumero } from "../src/lib/numeracion";
import { abrirEntorno, crearCliente, crearProducto, fijarTasa, type Entorno } from "./soporte/entorno";

describe("Numeración por tipo de documento", () => {
  let e: Entorno;
  before(async () => { e = await abrirEntorno(); await fijarTasa(e.db, 40); });
  after(async () => { await e.db.tipoDocumento.update({ where: { codigo: "FACTURA" }, data: { fiscalAutomatico: false } }); });

  const tipo = (codigo: string) => e.db.tipoDocumento.findUniqueOrThrow({ where: { codigo } });
  const facturar = async (clienteId: string, codigo: string, cantidad = 1) =>
    emitirFactura(e.db, e.actor, { clienteId, almacenId: e.almacenId, observaciones: null, diasCredito: 0, lineas: [{ productoCodigo: codigo, cantidad, precioUnitario: 10, descuento: 0 }] });

  it("vienen de fábrica los cinco tipos, con el contador en el número más alto que ya existe", async () => {
    const t = await e.db.tipoDocumento.findMany({ orderBy: { codigo: "asc" } });
    assert.deepEqual(t.map((x) => x.codigo), ["COTIZACION", "FACTURA", "NOTA_VENTA", "ORDEN_COMPRA", "PEDIDO"]);
  });

  it("la factura toma el número del contador; subirlo salta números y avanza de a uno", async () => {
    const cli = await crearCliente(e.db);
    const p = await crearProducto(e, { existencia: 50, precio: 10, costo: 4, exento: true });
    const salto = (await tipo("FACTURA")).ultimoNumero + 500;
    await e.db.tipoDocumento.update({ where: { codigo: "FACTURA" }, data: { ultimoNumero: salto } });
    const a = await facturar(cli.id, p.codigo);
    const b = await facturar(cli.id, p.codigo);
    assert.ok(a.ok && b.ok);
    const fa = await e.db.factura.findUniqueOrThrow({ where: { id: a.id } });
    const fb = await e.db.factura.findUniqueOrThrow({ where: { id: b.id } });
    assert.equal(fa.numero, salto + 1);
    assert.equal(fb.numero, salto + 2);
    assert.equal((await tipo("FACTURA")).ultimoNumero, salto + 2);
  });

  it("una emisión rechazada no gasta el número (sin saltos)", async () => {
    const cli = await crearCliente(e.db);
    const p = await crearProducto(e, { existencia: 2, precio: 10, costo: 4, exento: true });
    const antes = (await tipo("FACTURA")).ultimoNumero;
    const mala = await facturar(cli.id, p.codigo, 99);
    assert.equal(mala.ok, false);
    assert.equal((await tipo("FACTURA")).ultimoNumero, antes, "el contador no avanzó");
    const buena = await facturar(cli.id, p.codigo, 1);
    assert.ok(buena.ok);
    assert.equal((await e.db.factura.findUniqueOrThrow({ where: { id: buena.id } })).numero, antes + 1);
  });

  it("ocho transacciones simultáneas reciben ocho números distintos y consecutivos", async () => {
    const antes = (await tipo("COTIZACION")).ultimoNumero;
    const nums = await Promise.all(Array.from({ length: 8 }, () => e.db.$transaction(async (tx) => siguienteNumero(tx, "COTIZACION"))));
    assert.deepEqual([...nums].sort((x, y) => x - y), Array.from({ length: 8 }, (_, i) => antes + 1 + i));
  });

  it("si alguien creó documentos por fuera con un número más alto, el contador no lo repite", async () => {
    const cli = await crearCliente(e.db);
    const mayor = (await e.db.pedidoVenta.aggregate({ _max: { numero: true } }))._max.numero ?? 0;
    await e.db.pedidoVenta.create({ data: { numero: mayor + 40, clienteId: cli.id, fecha: new Date(), subtotal: 0, iva: 0, total: 0, creadoPorId: e.actor.id, creadoPorNombre: e.actor.nombre } });
    const p = await crearProducto(e, { existencia: 5, precio: 10, costo: 4, exento: true });
    const r = await guardarPedido(e.db, e.actor, null, { clienteId: cli.id, fecha: new Date(), observaciones: null, lineas: [{ productoCodigo: p.codigo, cantidad: 1, precioUnitario: 10, descuento: 0 }] });
    assert.ok(r.ok, r.ok ? "" : r.error);
    assert.equal((await e.db.pedidoVenta.findUniqueOrThrow({ where: { id: r.id } })).numero, mayor + 41);
  });

  it("numeración fiscal automática: asigna factura y control sin saltos y esquiva los que ya se registraron a mano", async () => {
    const cli = await crearCliente(e.db);
    const p = await crearProducto(e, { existencia: 50, precio: 10, costo: 4, exento: true });
    const base = 900_000 + Math.floor(Math.random() * 50_000);
    // Uno ya registrado a mano con el número que tocaría después.
    const previa = await facturar(cli.id, p.codigo);
    assert.ok(previa.ok);
    await e.db.factura.update({ where: { id: previa.id }, data: { numeroFiscal: String(base + 2).padStart(8, "0") } });
    await e.db.tipoDocumento.update({ where: { codigo: "FACTURA" }, data: { fiscalAutomatico: true, ultimoFiscal: base, ultimoControl: base } });
    const a = await facturar(cli.id, p.codigo);
    const b = await facturar(cli.id, p.codigo);
    assert.ok(a.ok && b.ok);
    const fa = await e.db.factura.findUniqueOrThrow({ where: { id: a.id } });
    const fb = await e.db.factura.findUniqueOrThrow({ where: { id: b.id } });
    assert.equal(fa.numeroFiscal, String(base + 1).padStart(8, "0"));
    assert.equal(fb.numeroFiscal, String(base + 3).padStart(8, "0"), "salta el +2 que ya estaba en otra factura");
    assert.equal(fa.numeroControl, `00-${String(base + 1).padStart(8, "0")}`);
    assert.equal(fb.numeroControl, `00-${String(base + 2).padStart(8, "0")}`);
    // Apagada, las facturas nuevas salen sin número fiscal (se registra a mano).
    await e.db.tipoDocumento.update({ where: { codigo: "FACTURA" }, data: { fiscalAutomatico: false } });
    const c = await facturar(cli.id, p.codigo);
    assert.ok(c.ok);
    assert.equal((await e.db.factura.findUniqueOrThrow({ where: { id: c.id } })).numeroFiscal, null);
  });

  it("validación del maestro: el último número no puede quedar por debajo del más alto existente ni usar fiscal en otros documentos", async () => {
    const f = await tipo("FACTURA");
    const mayor = (await e.db.factura.aggregate({ _max: { numero: true } }))._max.numero ?? 0;
    const bajo = await tiposDocumento.validar!(e.db, { ultimoNumero: Math.max(mayor - 1, 0), ultimoFiscal: 0, ultimoControl: 0 }, true, f.id);
    assert.match(bajo?.ultimoNumero ?? "", /Ya existe el número/);
    const ok = await tiposDocumento.validar!(e.db, { ultimoNumero: mayor, ultimoFiscal: 0, ultimoControl: 0 }, true, f.id);
    assert.equal(ok, null);
    const ped = await tipo("PEDIDO");
    const malo = await tiposDocumento.validar!(e.db, { ultimoNumero: ped.ultimoNumero, fiscalAutomatico: true, ultimoFiscal: 0, ultimoControl: 0 }, true, ped.id);
    assert.match(malo?.fiscalAutomatico ?? "", /solo aplica a las facturas/);
  });
});
