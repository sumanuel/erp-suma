import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { anularCotizacion, convertirEnPedido, emitirCotizacion, guardarCotizacion, rechazarCotizacion } from "../src/lib/cotizaciones/servicio";
import { emitirFacturaDePedido } from "../src/lib/facturacion/servicio";
import { anularPedido, confirmarPedido, disponibles, guardarPedido } from "../src/lib/pedidos/servicio";
import { abrirEntorno, automatica, crearCliente, crearProducto, fijarTasa, hoy, type Entorno } from "./soporte/entorno";

describe("Cotizaciones y pedidos", () => {
  let e: Entorno;
  before(async () => {
    e = await abrirEntorno();
    await fijarTasa(e.db, 40);
    await automatica(e.db, false);
  });

  const linea = (productoCodigo: string, cantidad: number, precioUnitario = 10) => ({ productoCodigo, cantidad, precioUnitario, descuento: 0 });
  const cotizar = (clienteId: string, lineas: ReturnType<typeof linea>[], validezDias = 15) => guardarCotizacion(e.db, e.actor, null, { clienteId, fecha: hoy(), validezDias, observaciones: null, lineas });
  const pedido = (clienteId: string, lineas: ReturnType<typeof linea>[]) => guardarPedido(e.db, e.actor, null, { clienteId, fecha: hoy(), observaciones: null, lineas });
  const libre = async (codigo: string) => (await disponibles(e.db, [codigo])).get(codigo) ?? 0;

  it("cotización: ciclo de estados, no se emite dos veces y no se edita después de emitida", async () => {
    const cli = await crearCliente(e.db);
    const p = await crearProducto(e);
    const c = await cotizar(cli.id, [linea(p.codigo, 2)]);
    assert.ok(c.ok);
    assert.ok((await emitirCotizacion(e.db, e.actor, c.id)).ok);
    assert.equal((await emitirCotizacion(e.db, e.actor, c.id)).ok, false);
    assert.equal(Number((await e.db.cotizacion.findUniqueOrThrow({ where: { id: c.id } })).tasaUsd), 40);
    assert.equal((await guardarCotizacion(e.db, e.actor, c.id, { clienteId: cli.id, fecha: hoy(), validezDias: 15, observaciones: null, lineas: [linea(p.codigo, 5)] })).ok, false);
    assert.equal((await rechazarCotizacion(e.db, e.actor, c.id, "")).ok, false);
    assert.ok((await rechazarCotizacion(e.db, e.actor, c.id, "Muy cara")).ok);
    assert.equal((await anularCotizacion(e.db, e.actor, c.id)).ok, false);
    assert.equal((await convertirEnPedido(e.db, e.actor, c.id)).ok, false);
  });

  it("convertir en pedido conserva precios y solo una de dos conversiones simultáneas procede", async () => {
    const cli = await crearCliente(e.db);
    const p = await crearProducto(e, { precio: 99 });
    const c = await cotizar(cli.id, [linea(p.codigo, 3, 12.5)]);
    assert.ok(c.ok);
    assert.ok((await emitirCotizacion(e.db, e.actor, c.id)).ok);
    const rs = await Promise.all([convertirEnPedido(e.db, e.actor, c.id), convertirEnPedido(e.db, e.actor, c.id)]);
    assert.equal(rs.filter((r) => r.ok).length, 1);
    const ok = rs.find((r) => r.ok)!;
    assert.ok(ok.ok);
    const l = await e.db.pedidoVentaLinea.findFirstOrThrow({ where: { pedidoId: ok.pedidoId } });
    assert.equal(Number(l.precioUnitario), 12.5);
    assert.equal((await e.db.cotizacion.findUniqueOrThrow({ where: { id: c.id } })).estado, "ACEPTADA");
  });

  it("una cotización vencida no se convierte y no deja pedido", async () => {
    const cli = await crearCliente(e.db);
    const p = await crearProducto(e);
    const c = await cotizar(cli.id, [linea(p.codigo, 1)]);
    assert.ok(c.ok);
    assert.ok((await emitirCotizacion(e.db, e.actor, c.id)).ok);
    await e.db.cotizacion.update({ where: { id: c.id }, data: { fechaVencimiento: new Date("2020-01-01T00:00:00.000Z") } });
    const antes = await e.db.pedidoVenta.count();
    assert.equal((await convertirEnPedido(e.db, e.actor, c.id)).ok, false);
    assert.equal(await e.db.pedidoVenta.count(), antes);
    assert.equal((await e.db.cotizacion.findUniqueOrThrow({ where: { id: c.id } })).estado, "EMITIDA");
  });

  it("rechaza líneas inválidas (cantidad, precio, producto inexistente, sin líneas)", async () => {
    const cli = await crearCliente(e.db);
    const p = await crearProducto(e);
    for (const ls of [[linea(p.codigo, 0)], [linea(p.codigo, -1)], [linea(p.codigo, 1, -1)], [linea("NOEXISTE", 1)], []]) {
      assert.equal((await pedido(cli.id, ls)).ok, false);
      assert.equal((await cotizar(cli.id, ls)).ok, false);
    }
  });

  it("confirmar reserva existencia; anular la libera; no se confirma de más", async () => {
    const cli = await crearCliente(e.db);
    const p = await crearProducto(e, { existencia: 10 });
    const a = await pedido(cli.id, [linea(p.codigo, 6)]);
    assert.ok(a.ok);
    assert.equal(await libre(p.codigo), 10); // borrador no reserva
    assert.ok((await confirmarPedido(e.db, e.actor, a.id)).ok);
    assert.equal(await libre(p.codigo), 4);
    const b = await pedido(cli.id, [linea(p.codigo, 5)]);
    assert.ok(b.ok);
    assert.equal((await confirmarPedido(e.db, e.actor, b.id)).ok, false);
    assert.equal(await libre(p.codigo), 4);
    assert.ok((await anularPedido(e.db, e.actor, a.id)).ok);
    assert.equal(await libre(p.codigo), 10);
    assert.equal((await anularPedido(e.db, e.actor, a.id)).ok, false);
  });

  it("concurrencia: 5 pedidos de 3 confirmados a la vez sobre 10 → solo 3 se confirman, nunca se sobrereserva", async () => {
    const cli = await crearCliente(e.db);
    const p = await crearProducto(e, { existencia: 10 });
    const ids = await Promise.all(Array.from({ length: 5 }, async () => {
      const r = await pedido(cli.id, [linea(p.codigo, 3)]);
      assert.ok(r.ok);
      return r.id;
    }));
    const rs = await Promise.all(ids.map((id) => confirmarPedido(e.db, e.actor, id)));
    assert.equal(rs.filter((r) => r.ok).length, 3);
    assert.equal(await libre(p.codigo), 1);
  });

  it("facturar un pedido consume su reserva, no se factura dos veces y anular la factura lo reabre", async () => {
    const { anularFactura } = await import("../src/lib/facturacion/servicio");
    const cli = await crearCliente(e.db);
    const p = await crearProducto(e, { existencia: 10 });
    const a = await pedido(cli.id, [linea(p.codigo, 4)]);
    assert.ok(a.ok);
    assert.ok((await confirmarPedido(e.db, e.actor, a.id)).ok);
    const rs = await Promise.all([1, 2].map(() => emitirFacturaDePedido(e.db, e.actor, a.id, e.almacenId, null, 0)));
    assert.equal(rs.filter((r) => r.ok).length, 1);
    assert.equal(await libre(p.codigo), 6);
    const f = rs.find((r) => r.ok)!;
    assert.ok(f.ok);
    assert.equal((await e.db.pedidoVenta.findUniqueOrThrow({ where: { id: a.id } })).estado, "FACTURADO");
    assert.ok((await anularFactura(e.db, e.actor, f.id, "Error de captura")).ok);
    assert.equal((await e.db.pedidoVenta.findUniqueOrThrow({ where: { id: a.id } })).estado, "CONFIRMADO");
    assert.equal(await libre(p.codigo), 6); // mercancía devuelta, pero el pedido vuelve a reservar 4
  });

  after(async () => {
    await automatica(e.db, false);
  });
});
