import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { anularFactura, emitirFactura, emitirFacturaDePedido } from "../src/lib/facturacion/servicio";
import { confirmarPedido, guardarPedido, presentacionesVenta } from "../src/lib/pedidos/servicio";
import { convertirEnPedido, emitirCotizacion, guardarCotizacion } from "../src/lib/cotizaciones/servicio";
import { enUnidadDeLinea } from "../src/lib/ventas/presentaciones";
import { abrirEntorno, automatica, crearCliente, crearProducto, fijarTasa, hoy, unico, type Entorno } from "./soporte/entorno";

describe("Documentos de venta: unidad de venta por línea (presentaciones)", () => {
  let e: Entorno;
  before(async () => {
    e = await abrirEntorno();
    await fijarTasa(e.db, 40);
    await automatica(e.db, true);
  });
  after(async () => {
    await automatica(e.db, false);
  });
  const existencia = async (codigo: string) => Number((await e.db.existencia.findFirst({ where: { productoCodigo: codigo, almacenId: e.almacenId } }))?.cantidad ?? 0);
  const caja = async (codigo: string, extra: Record<string, unknown> = {}) => {
    const unidad = await e.db.unidadMedida.create({ data: { codigo: unico("U"), nombre: unico("Unidad") } });
    return e.db.productoPresentacion.create({ data: { productoCodigo: codigo, unidadMedidaId: unidad.id, nombre: "Caja x 12", cantidad: 12, visibleVentas: true, ...extra } });
  };

  it("2 cajas de 12 a 120: la línea queda en 24 unidades a 10, los totales cuadran, reserva y factura mueven 24 y anular las devuelve", async () => {
    const cli = await crearCliente(e.db);
    const p = await crearProducto(e, { existencia: 30, precio: 10 });
    const c = await caja(p.codigo);
    const r = await guardarPedido(e.db, e.actor, null, { clienteId: cli.id, fecha: hoy(), observaciones: null, lineas: [{ productoCodigo: p.codigo, presentacionId: c.id, cantidad: 2, precioUnitario: 120, descuento: 0 }] });
    assert.ok(r.ok);
    const ped = await e.db.pedidoVenta.findUniqueOrThrow({ where: { id: r.id }, include: { lineas: true } });
    assert.equal(Number(ped.lineas[0].cantidad), 24);
    assert.equal(Number(ped.lineas[0].factor), 12);
    assert.equal(ped.lineas[0].presentacionId, c.id);
    assert.equal(Number(ped.subtotal), 240);
    assert.deepEqual(enUnidadDeLinea(ped.lineas[0]), { cantidad: "2", precioUnitario: "120" });
    assert.ok((await confirmarPedido(e.db, e.actor, r.id)).ok);
    const f = await emitirFacturaDePedido(e.db, e.actor, r.id, e.almacenId, null, 0);
    assert.ok(f.ok);
    assert.equal(await existencia(p.codigo), 6);
    const fac = await e.db.factura.findUniqueOrThrow({ where: { id: f.id }, include: { lineas: true } });
    assert.equal(Number(fac.subtotal), 240);
    assert.equal(fac.lineas[0].presentacionId, c.id);
    assert.ok((await anularFactura(e.db, e.actor, f.id, "prueba de unidad")).ok);
    assert.equal(await existencia(p.codigo), 30);
  });

  it("un precio por caja que no divide exacto (100 / 12) no pierde centavos", async () => {
    const cli = await crearCliente(e.db);
    const p = await crearProducto(e, { existencia: 50, precio: 8.3333 });
    const c = await caja(p.codigo);
    const f = await emitirFactura(e.db, e.actor, { clienteId: cli.id, almacenId: e.almacenId, observaciones: null, diasCredito: 0, lineas: [{ productoCodigo: p.codigo, presentacionId: c.id, cantidad: 3, precioUnitario: 100, descuento: 0 }] });
    assert.ok(f.ok);
    const fac = await e.db.factura.findUniqueOrThrow({ where: { id: f.id } });
    assert.equal(Number(fac.subtotal), 300);
    assert.equal(await existencia(p.codigo), 14);
  });

  it("valida la presentación: debe ser del producto y venderse; y sin permiso de precio rige el de la presentación", async () => {
    const cli = await crearCliente(e.db);
    const p = await crearProducto(e, { existencia: 50, precio: 10 });
    const otro = await crearProducto(e, { existencia: 50, precio: 10 });
    const ajena = await caja(otro.codigo);
    const oculta = await caja(p.codigo, { visibleVentas: false });
    const buena = await caja(p.codigo, { nombre: "Bulto", cantidad: 6 });
    const g = (presentacionId: string, precioUnitario: number, sinCambiarPrecio = false) =>
      guardarPedido(e.db, e.actor, null, { clienteId: cli.id, fecha: hoy(), observaciones: null, sinCambiarPrecio, lineas: [{ productoCodigo: p.codigo, presentacionId, cantidad: 1, precioUnitario, descuento: 0 }] });
    assert.equal((await g(ajena.id, 120)).ok, false);
    assert.equal((await g(oculta.id, 120)).ok, false);
    assert.equal((await g("00000000-0000-0000-0000-000000000000", 60)).ok, false);
    assert.equal((await g(buena.id, 50, true)).ok, false); // lista: 10 × 6 = 60
    assert.equal((await g(buena.id, 60, true)).ok, true);
    assert.equal((await g(buena.id, 50, false)).ok, true); // con permiso de precio sí puede
  });

  it("si la presentación tiene precio propio, ese es el de lista; presentacionesVenta la ofrece sin repetir la unidad base", async () => {
    const p = await crearProducto(e, { existencia: 5, precio: 10 });
    await caja(p.codigo, { precioVenta: 100 });
    const unidad = await e.db.unidadMedida.create({ data: { codigo: unico("U"), nombre: unico("Unidad") } });
    await e.db.productoPresentacion.create({ data: { productoCodigo: p.codigo, unidadMedidaId: unidad.id, nombre: "Unidad suelta", cantidad: 1 } });
    const o = (await presentacionesVenta(e.db, [p.codigo], "A")).get(p.codigo)!;
    assert.equal(o.presentaciones.length, 1);
    assert.deepEqual([o.presentaciones[0].factor, o.presentaciones[0].precio, o.precioUnidad], [12, 100, 10]);
  });

  it("cotización → pedido conserva la unidad y la cantidad por caja", async () => {
    const cli = await crearCliente(e.db);
    const p = await crearProducto(e, { existencia: 100, precio: 10 });
    const c = await caja(p.codigo);
    const cot = await guardarCotizacion(e.db, e.actor, null, { clienteId: cli.id, fecha: hoy(), validezDias: 10, observaciones: null, lineas: [{ productoCodigo: p.codigo, presentacionId: c.id, cantidad: 3, precioUnitario: 120, descuento: 0 }] });
    assert.ok(cot.ok);
    assert.ok((await emitirCotizacion(e.db, e.actor, cot.id)).ok);
    const ped = await convertirEnPedido(e.db, e.actor, cot.id);
    assert.ok(ped.ok);
    const l = await e.db.pedidoVentaLinea.findFirstOrThrow({ where: { pedidoId: ped.pedidoId } });
    assert.deepEqual([Number(l.cantidad), Number(l.factor), l.presentacionId], [36, 12, c.id]);
    assert.equal(Number((await e.db.pedidoVenta.findUniqueOrThrow({ where: { id: ped.pedidoId } })).subtotal), 360);
  });

  it("no hay existencia para las cajas pedidas: se compara en unidades base", async () => {
    const cli = await crearCliente(e.db);
    const p = await crearProducto(e, { existencia: 20, precio: 10 });
    const c = await caja(p.codigo);
    const f = await emitirFactura(e.db, e.actor, { clienteId: cli.id, almacenId: e.almacenId, observaciones: null, diasCredito: 0, lineas: [{ productoCodigo: p.codigo, presentacionId: c.id, cantidad: 2, precioUnitario: 120, descuento: 0 }] });
    assert.equal(f.ok, false); // 24 > 20
    assert.equal(await existencia(p.codigo), 20);
  });
});
