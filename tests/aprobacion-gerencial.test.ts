import { siguienteNumero } from "../src/lib/numeracion";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { emitirFacturaDePedido } from "../src/lib/facturacion/servicio";
import { anularPedido, confirmarPedido, guardarPedido, resolverAprobacion } from "../src/lib/pedidos/servicio";
import { abrirEntorno, automatica, crearCliente, crearProducto, fijarTasa, hoy, type Entorno } from "./soporte/entorno";

describe("Aprobación gerencial de pedidos (reglas + pedido por aprobar)", () => {
  let e: Entorno;
  before(async () => {
    e = await abrirEntorno();
    await fijarTasa(e.db, 40);
    await automatica(e.db, true);
  });
  after(async () => {
    await e.db.reglaAprobacion.updateMany({ data: { activa: false, monto: 0 } });
    await automatica(e.db, false);
  });
  const regla = (id: number, activa: boolean, monto = 0) => e.db.reglaAprobacion.update({ where: { id }, data: { activa, monto } });
  const linea = (productoCodigo: string, cantidad: number, descuento = 0) => ({ productoCodigo, cantidad, precioUnitario: 10, descuento });
  const pedido = async (clienteId: string, lineas: ReturnType<typeof linea>[], extra: Record<string, unknown> = {}) => {
    const r = await guardarPedido(e.db, e.actor, null, { clienteId, fecha: hoy(), observaciones: null, lineas, ...extra });
    assert.ok(r.ok);
    return r.id;
  };
  const estado = async (id: string) => (await e.db.pedidoVenta.findUniqueOrThrow({ where: { id } })).estado;

  it("con el interruptor apagado no se revisa nada, aunque las demás reglas estén activas", async () => {
    await regla(1, false);
    await regla(5, true, 5);
    const cli = await crearCliente(e.db);
    const p = await crearProducto(e, { existencia: 20 });
    const id = await pedido(cli.id, [linea(p.codigo, 1, 50)]);
    const r = await confirmarPedido(e.db, e.actor, id);
    assert.ok(r.ok && !r.porAprobar);
    assert.equal(await estado(id), "CONFIRMADO");
  });

  it("descuento máximo: un pedido que lo supera queda por aprobar con su regla; el gerente lo aprueba y al cerrar de nuevo se confirma", async () => {
    await regla(1, true);
    await regla(5, true, 5);
    const cli = await crearCliente(e.db);
    const p = await crearProducto(e, { existencia: 20 });
    const id = await pedido(cli.id, [linea(p.codigo, 1, 20)]);
    const r = await confirmarPedido(e.db, e.actor, id);
    assert.ok(r.ok && r.porAprobar && /Dtco/.test(r.porAprobar));
    const ped = await e.db.pedidoVenta.findUniqueOrThrow({ where: { id } });
    assert.equal(ped.estado, "POR_APROBAR");
    assert.equal(ped.reglaRechazoId, 5);
    assert.equal(ped.tasaUsd, null); // no se reservó ni se fijó tasa
    // Aprobar
    assert.ok((await resolverAprobacion(e.db, e.actor, id, "APROBADO", "Cliente estratégico")).ok);
    const ap = await e.db.pedidoVenta.findUniqueOrThrow({ where: { id } });
    assert.deepEqual([ap.estado, ap.aprobacionEstado, ap.aprobadoPorNombre], ["BORRADOR", "APROBADO", e.actor.nombre]);
    const c = await confirmarPedido(e.db, e.actor, id);
    assert.ok(c.ok && !c.porAprobar);
    assert.equal(await estado(id), "CONFIRMADO");
    // Ya no está por aprobar: no se puede decidir otra vez
    assert.equal((await resolverAprobacion(e.db, e.actor, id, "RECHAZADO", "tarde")).ok, false);
  });

  it("rechazar exige motivo, devuelve el pedido a borrador y al cerrar de nuevo se vuelve a revisar; editar borra una aprobación vieja", async () => {
    await regla(1, true);
    await regla(5, true, 5);
    const cli = await crearCliente(e.db);
    const p = await crearProducto(e, { existencia: 20 });
    const id = await pedido(cli.id, [linea(p.codigo, 1, 20)]);
    await confirmarPedido(e.db, e.actor, id);
    assert.equal((await resolverAprobacion(e.db, e.actor, id, "RECHAZADO", "")).ok, false);
    assert.ok((await resolverAprobacion(e.db, e.actor, id, "RECHAZADO", "Descuento excesivo")).ok);
    assert.equal(await estado(id), "BORRADOR");
    assert.equal((await confirmarPedido(e.db, e.actor, id)).ok && (await estado(id)) === "POR_APROBAR", true);
    // Aprobado, pero luego se edita: la aprobación se pierde y se vuelve a revisar.
    await resolverAprobacion(e.db, e.actor, id, "APROBADO", null);
    assert.ok((await guardarPedido(e.db, e.actor, id, { clienteId: cli.id, fecha: hoy(), observaciones: null, lineas: [linea(p.codigo, 2, 20)] })).ok);
    assert.equal((await e.db.pedidoVenta.findUniqueOrThrow({ where: { id } })).aprobacionEstado, null);
    await confirmarPedido(e.db, e.actor, id);
    assert.equal(await estado(id), "POR_APROBAR");
    assert.ok((await anularPedido(e.db, e.actor, id)).ok); // un pedido por aprobar se puede anular
  });

  it("mora y límite de crédito: se revisan solo si su regla está activa", async () => {
    await regla(1, true);
    await regla(5, false);
    const p = await crearProducto(e, { existencia: 50 });
    // Límite: total 100 (10 u. a 10) + IVA supera un límite de 50
    const limitado = await e.db.cliente.create({ data: { documento: `J${Math.random().toString().slice(2, 9)}`, razonSocial: "Límite bajo", tipo: "Privado", tieneCredito: true, limiteCredito: 50 } });
    await regla(4, false);
    const a = await pedido(limitado.id, [linea(p.codigo, 10)]);
    await confirmarPedido(e.db, e.actor, a);
    assert.equal(await estado(a), "CONFIRMADO");
    await regla(4, true);
    const b = await pedido(limitado.id, [linea(p.codigo, 10)]);
    const r = await confirmarPedido(e.db, e.actor, b);
    assert.ok(r.ok && r.porAprobar && /crédito/i.test(r.porAprobar));
    assert.equal((await e.db.pedidoVenta.findUniqueOrThrow({ where: { id: b } })).reglaRechazoId, 4);
    await regla(4, false);
    // Mora: una factura vencida con saldo
    const moroso = await crearCliente(e.db);
    const ayer = new Date(hoy().getTime() - 5 * 86_400_000);
    const f = await e.db.factura.create({ data: { numero: await e.db.$transaction((tx) => siguienteNumero(tx, "FACTURA")), clienteId: moroso.id, almacenId: e.almacenId, fecha: ayer, fechaVencimiento: ayer, diasCredito: 1, subtotal: 10, iva: 0, total: 10, saldo: 10, tasaUsd: 40, totalBs: 400, estado: "EMITIDA", creadoPorNombre: "x" } });
    assert.ok(f.id);
    await regla(3, true);
    try {
      const c = await pedido(moroso.id, [linea(p.codigo, 1)]);
      await confirmarPedido(e.db, e.actor, c);
      assert.equal(await estado(c), "POR_APROBAR");
    } finally {
      await e.db.factura.delete({ where: { id: f.id } }); // sintética: se quita para no ensuciar los libros de las otras pruebas
    }
  });

  it("un pedido aprobado por gerencia se factura aunque el cliente exceda el control de crédito, a nombre del gerente", async () => {
    await regla(1, true);
    await regla(3, false);
    await regla(4, true);
    const p = await crearProducto(e, { existencia: 50 });
    const cli = await e.db.cliente.create({ data: { documento: `J${Math.random().toString().slice(2, 9)}`, razonSocial: "Sin crédito", tipo: "Privado", tieneCredito: false, limiteCredito: 5 } });
    const id = await pedido(cli.id, [linea(p.codigo, 10)]);
    await confirmarPedido(e.db, e.actor, id);
    assert.equal(await estado(id), "POR_APROBAR");
    await resolverAprobacion(e.db, e.actor, id, "APROBADO", "Cliente de confianza");
    assert.ok((await confirmarPedido(e.db, e.actor, id)).ok);
    const f = await emitirFacturaDePedido(e.db, e.actor, id, e.almacenId, null, 30);
    assert.ok(f.ok, f.ok ? "" : f.error);
    const fac = await e.db.factura.findUniqueOrThrow({ where: { id: f.id } });
    assert.equal(fac.aprobadoPorNombre, e.actor.nombre);
    assert.match(fac.aprobacionMotivo ?? "", /aprobado por gerencia/);
  });
});
