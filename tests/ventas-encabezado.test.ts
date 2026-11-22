import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { emitirFactura, emitirFacturaDePedido } from "../src/lib/facturacion/servicio";
import { confirmarPedido, guardarPedido } from "../src/lib/pedidos/servicio";
import { errorProntoPago, prontoPagoAplicable } from "../src/lib/ventas/condiciones";
import { condicionesPago } from "../src/lib/maestros/tablas";
import { tienePermisoEspecial } from "../src/lib/permisos";
import { abrirEntorno, automatica, crearCliente, crearProducto, fijarTasa, hoy, unico, type Entorno } from "./soporte/entorno";

describe("Documentos de venta: origen, bultos, kilos, pronto pago y permiso de cambiar precio", () => {
  let e: Entorno;
  before(async () => {
    e = await abrirEntorno();
    await fijarTasa(e.db, 40);
    await automatica(e.db, true); // las facturas que emite esta suite deben quedar contabilizadas para que los libros de reportes.test.ts cuadren
  });
  after(async () => {
    await automatica(e.db, false);
  });
  const base = { vendedorId: null, condicionPagoId: null, transporteId: null, direccionEntrega: null, descuentos: [0, 0, 0] as [number, number, number] };
  const ped = (clienteId: string, codigo: string, extra: Record<string, unknown> = {}, precio = 10) =>
    guardarPedido(e.db, e.actor, null, { clienteId, fecha: hoy(), observaciones: null, lineas: [{ productoCodigo: codigo, cantidad: 1, precioUnitario: precio, descuento: 0 }], ...extra });

  it("guarda origen de venta, bultos y kilos, y los hereda la factura del pedido", async () => {
    const cli = await crearCliente(e.db);
    const p = await crearProducto(e, { existencia: 5 });
    const origen = await e.db.origenVenta.create({ data: { codigo: unico("OV"), nombre: "Mostrador" } });
    const r = await ped(cli.id, p.codigo, { encabezado: { ...base, origenVentaId: origen.id, bultos: 3, kilos: 12.5 } });
    assert.ok(r.ok);
    const doc = await e.db.pedidoVenta.findUniqueOrThrow({ where: { id: r.id } });
    assert.deepEqual({ o: doc.origenVentaId, b: doc.bultos, k: Number(doc.kilos) }, { o: origen.id, b: 3, k: 12.5 });
    assert.ok((await confirmarPedido(e.db, e.actor, r.id)).ok);
    const f = await emitirFacturaDePedido(e.db, e.actor, r.id, e.almacenId, null, 0);
    assert.ok(f.ok);
    const fac = await e.db.factura.findUniqueOrThrow({ where: { id: f.id } });
    assert.deepEqual({ o: fac.origenVentaId, b: fac.bultos, k: Number(fac.kilos) }, { o: origen.id, b: 3, k: 12.5 });
  });

  it("rechaza origen inactivo o inexistente, bultos fraccionarios y kilos negativos", async () => {
    const cli = await crearCliente(e.db);
    const p = await crearProducto(e, { existencia: 5 });
    const inactivo = await e.db.origenVenta.create({ data: { codigo: unico("OV"), nombre: "Viejo", activo: false } });
    for (const enc of [{ origenVentaId: inactivo.id }, { origenVentaId: "00000000-0000-0000-0000-000000000000" }, { bultos: 1.5 }, { bultos: -1 }, { kilos: -2 }]) {
      assert.equal((await ped(cli.id, p.codigo, { encabezado: { ...base, ...enc } })).ok, false, JSON.stringify(enc));
    }
    assert.equal((await ped(cli.id, p.codigo, { encabezado: { ...base, bultos: null, kilos: null } })).ok, true);
  });

  it("la base impide bultos o kilos negativos y un origen que no existe", async () => {
    const cli = await crearCliente(e.db);
    const p = await crearProducto(e, { existencia: 5 });
    const r = await ped(cli.id, p.codigo);
    assert.ok(r.ok);
    await assert.rejects(e.db.pedidoVenta.update({ where: { id: r.id }, data: { bultos: -1 } }));
    await assert.rejects(e.db.pedidoVenta.update({ where: { id: r.id }, data: { origenVentaId: "00000000-0000-0000-0000-000000000000" } }));
  });

  it("pronto pago: se toma de la condición de pago, se puede cambiar y valida los escalones", async () => {
    assert.equal(errorProntoPago([8, 5, 15, 3]), null);
    assert.ok(errorProntoPago([8, 5, 8, 3]), "el segundo escalón debe ser más lejano");
    assert.ok(errorProntoPago([0, 5, 0, 0]), "porcentaje sin días");
    assert.ok(errorProntoPago([8, 0, 0, 0]), "días sin porcentaje");
    assert.ok(errorProntoPago([8, 101, 0, 0]));
    const cli = await crearCliente(e.db);
    const p = await crearProducto(e, { existencia: 5 });
    const cp = await e.db.condicionPago.create({ data: { codigo: unico("CP"), nombre: "30 días", dias: 30, prontoPagoDias1: 8, prontoPagoPct1: 5, prontoPagoDias2: 15, prontoPagoPct2: 2 } });
    const r = await ped(cli.id, p.codigo, { encabezado: { ...base, condicionPagoId: cp.id } });
    assert.ok(r.ok);
    const doc = await e.db.pedidoVenta.findUniqueOrThrow({ where: { id: r.id } });
    assert.deepEqual([doc.prontoPagoDias1, Number(doc.prontoPagoPct1), doc.prontoPagoDias2, Number(doc.prontoPagoPct2)], [8, 5, 15, 2]);
    // Lo que manda el formulario gana sobre la condición.
    const r2 = await ped(cli.id, p.codigo, { encabezado: { ...base, condicionPagoId: cp.id, prontoPago: [10, 4, 0, 0] } });
    assert.ok(r2.ok);
    const doc2 = await e.db.pedidoVenta.findUniqueOrThrow({ where: { id: r2.id } });
    assert.deepEqual([doc2.prontoPagoDias1, Number(doc2.prontoPagoPct1), doc2.prontoPagoDias2], [10, 4, 0]);
    assert.equal((await ped(cli.id, p.codigo, { encabezado: { ...base, prontoPago: [5, 0, 0, 0] } })).ok, false);
  });

  it("el pronto pago aplicable depende de los días transcurridos desde la factura", () => {
    const fecha = hoy();
    const f = { fecha, prontoPagoDias1: 8, prontoPagoPct1: 5, prontoPagoDias2: 15, prontoPagoPct2: 2 };
    const dia = (n: number) => new Date(fecha.getTime() + n * 86_400_000);
    assert.equal(prontoPagoAplicable(f, dia(0)).porcentaje, 5);
    assert.equal(prontoPagoAplicable(f, dia(8)).porcentaje, 5);
    assert.equal(prontoPagoAplicable(f, dia(9)).porcentaje, 2);
    assert.equal(prontoPagoAplicable(f, dia(15)).porcentaje, 2);
    assert.equal(prontoPagoAplicable(f, dia(16)).porcentaje, 0);
    assert.equal(prontoPagoAplicable(f, dia(-1)).porcentaje, 0);
    assert.equal(prontoPagoAplicable({ ...f, prontoPagoDias1: 0, prontoPagoPct1: 0, prontoPagoDias2: 0, prontoPagoPct2: 0 }, dia(1)).porcentaje, 0);
  });

  it("la condición de pago rechaza pronto pago incoherente y la base también", async () => {
    const validar = condicionesPago.validar!;
    const ok = await validar(e.db, { dias: 30, diasMora: 0, prontoPagoDias1: 8, prontoPagoPct1: 5, prontoPagoDias2: 0, prontoPagoPct2: 0 }, false);
    assert.equal(ok, null);
    const mal = await validar(e.db, { dias: 30, diasMora: 0, prontoPagoDias1: 8, prontoPagoPct1: 0, prontoPagoDias2: 0, prontoPagoPct2: 0 }, false);
    assert.ok(mal?.prontoPagoDias1);
    await assert.rejects(e.db.condicionPago.create({ data: { codigo: unico("CP"), nombre: "Mala", dias: 30, prontoPagoDias1: 8, prontoPagoPct1: 0 } }));
    await assert.rejects(e.db.condicionPago.create({ data: { codigo: unico("CP"), nombre: "Mala", dias: 30, prontoPagoDias1: 8, prontoPagoPct1: 5, prontoPagoDias2: 5, prontoPagoPct2: 1 } }));
  });

  it("sin permiso de cambiar precio solo se vende al precio de la lista; con permiso se puede cambiar", async () => {
    const cli = await crearCliente(e.db);
    const p = await crearProducto(e, { precio: 10, existencia: 10 });
    const sin = (precio: number) => ped(cli.id, p.codigo, { sinCambiarPrecio: true }, precio);
    assert.equal((await sin(10)).ok, true);
    assert.equal((await sin(9)).ok, false);
    assert.equal((await ped(cli.id, p.codigo, {}, 9)).ok, true);
    const linea = (precioUnitario: number) => [{ productoCodigo: p.codigo, cantidad: 1, precioUnitario, descuento: 0 }];
    const fac = (precio: number, sinCambiarPrecio: boolean) => emitirFactura(e.db, e.actor, { clienteId: cli.id, almacenId: e.almacenId, observaciones: null, diasCredito: 0, lineas: linea(precio), sinCambiarPrecio });
    assert.equal((await fac(8, true)).ok, false);
    assert.equal((await fac(10, true)).ok, true);
    assert.equal((await fac(8, false)).ok, true);
  });

  it("el administrador siempre puede cambiar precio; los demás solo con el permiso marcado", () => {
    const u = (esAdministrador: boolean, permisos: string[]) => ({ usuario: { esAdministrador, permisos: new Set(permisos) } });
    assert.equal(tienePermisoEspecial(u(true, []), "ventas.cambiar_precio"), true);
    assert.equal(tienePermisoEspecial(u(false, []), "ventas.cambiar_precio"), false);
    assert.equal(tienePermisoEspecial(u(false, ["facturacion.crear"]), "ventas.cambiar_precio"), false);
    assert.equal(tienePermisoEspecial(u(false, ["ventas.cambiar_precio"]), "ventas.cambiar_precio"), true);
  });
});
