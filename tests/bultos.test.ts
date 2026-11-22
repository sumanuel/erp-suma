import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { asignarBultos, guardarPedido } from "../src/lib/pedidos/servicio";
import { abrirEntorno, crearCliente, crearProducto, hoy } from "./soporte/entorno";

describe("Bultos del pedido (lista de empaque)", () => {
  it("asigna cada línea a un bulto, el pedido toma el mayor y se rechazan líneas ajenas o valores inválidos", async () => {
    const e = await abrirEntorno();
    const cli = await crearCliente(e.db);
    const a = await crearProducto(e, { existencia: 10 }), b = await crearProducto(e, { existencia: 10 });
    const r = await guardarPedido(e.db, e.actor, null, { clienteId: cli.id, fecha: hoy(), observaciones: null, lineas: [{ productoCodigo: a.codigo, cantidad: 1, precioUnitario: 10, descuento: 0 }, { productoCodigo: b.codigo, cantidad: 1, precioUnitario: 10, descuento: 0 }] });
    assert.ok(r.ok);
    const ls = await e.db.pedidoVentaLinea.findMany({ where: { pedidoId: r.id }, orderBy: { linea: "asc" } });
    assert.ok((await asignarBultos(e.db, e.actor, r.id, [{ lineaId: ls[0].id, bulto: 1 }, { lineaId: ls[1].id, bulto: 3 }])).ok);
    assert.equal((await e.db.pedidoVenta.findUniqueOrThrow({ where: { id: r.id } })).bultos, 3);
    assert.equal((await asignarBultos(e.db, e.actor, r.id, [{ lineaId: ls[0].id, bulto: 0 }])).ok, false);
    assert.equal((await asignarBultos(e.db, e.actor, r.id, [{ lineaId: "00000000-0000-0000-0000-000000000000", bulto: 1 }])).ok, false);
  });
});
