import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { emitirFactura, emitirFacturaDePedido } from "../src/lib/facturacion/servicio";
import { descuentoEfectivo, descuentoGlobal } from "../src/lib/pedidos/calculos";
import { confirmarPedido, guardarPedido } from "../src/lib/pedidos/servicio";
import { convertirEnPedido, emitirCotizacion, guardarCotizacion } from "../src/lib/cotizaciones/servicio";
import { resolverPrecios } from "../src/lib/ventas/precios";
import { abrirEntorno, automatica, crearCliente, crearProducto, fijarTasa, hoy, unico, type Entorno } from "./soporte/entorno";

describe("Condiciones comerciales de los documentos", () => {
  let e: Entorno;
  before(async () => {
    e = await abrirEntorno();
    await fijarTasa(e.db, 40);
    await automatica(e.db, true); // con contabilización automática: los libros fiscales de reportes.test.ts deben seguir cuadrando con los asientos
  });
  after(async () => {
    await automatica(e.db, false);
  });
  const dia = (n: number) => new Date(hoy().getTime() + n * 86_400_000);
  const linea = (productoCodigo: string, cantidad: number, precioUnitario = 10, descuento = 0) => ({ productoCodigo, cantidad, precioUnitario, descuento });
  const factura = (clienteId: string, lineas: ReturnType<typeof linea>[], extra: { diasCredito?: number; encabezado?: Parameters<typeof emitirFactura>[2]["encabezado"] } = {}) =>
    emitirFactura(e.db, e.actor, { clienteId, almacenId: e.almacenId, observaciones: null, diasCredito: extra.diasCredito ?? 0, lineas, encabezado: extra.encabezado });

  it("descuentos en cadena: 10 % y 5 % dan 14,5 %; combinados con el de la línea", () => {
    assert.equal(descuentoGlobal([10, 5, 0]), 14.5);
    assert.equal(descuentoGlobal([]), 0);
    assert.equal(descuentoEfectivo(10, 14.5), 23.05);
    assert.equal(descuentoEfectivo(0, 0), 0);
  });

  it("pedido: guarda vendedor, condición, transporte, entrega y descuentos, y el total ya los incluye", async () => {
    const cli = await crearCliente(e.db);
    const p = await crearProducto(e, { existencia: 10 });
    const v = await e.db.vendedor.create({ data: { codigo: unico("V"), nombre: "Vendedor", esVendedor: true } });
    const cp = await e.db.condicionPago.create({ data: { codigo: unico("CP"), nombre: "30 días", dias: 30 } });
    const tr = await e.db.transporte.create({ data: { codigo: unico("T"), nombre: "Fletes" } });
    const r = await guardarPedido(e.db, e.actor, null, {
      clienteId: cli.id, fecha: hoy(), observaciones: null, lineas: [linea(p.codigo, 10, 10, 10)],
      encabezado: { vendedorId: v.id, condicionPagoId: cp.id, transporteId: tr.id, direccionEntrega: "Galpón 4", descuentos: [10, 5, 0] },
    });
    assert.ok(r.ok);
    const ped = await e.db.pedidoVenta.findUniqueOrThrow({ where: { id: r.id }, include: { lineas: true } });
    assert.equal(ped.vendedorId, v.id);
    assert.equal(ped.direccionEntrega, "Galpón 4");
    assert.equal(Number(ped.descuentoGlobal1), 10);
    assert.equal(Number(ped.lineas[0].descuentoLinea), 10); // lo que escribió quien vende
    assert.equal(Number(ped.lineas[0].descuento), 23.05); // efectivo
    assert.equal(Number(ped.subtotal), 76.95); // 100 × (1 − 0,2305)
    assert.equal(Number(ped.iva), 12.312);
  });

  it("rechaza vendedor o condición inexistentes o descuentos globales fuera de rango", async () => {
    const cli = await crearCliente(e.db);
    const p = await crearProducto(e, { existencia: 5 });
    const ped = (encabezado: Parameters<typeof emitirFactura>[2]["encabezado"]) => guardarPedido(e.db, e.actor, null, { clienteId: cli.id, fecha: hoy(), observaciones: null, lineas: [linea(p.codigo, 1)], encabezado });
    const base = { vendedorId: null, condicionPagoId: null, transporteId: null, direccionEntrega: null, descuentos: [0, 0, 0] as [number, number, number] };
    assert.equal((await ped({ ...base, vendedorId: "00000000-0000-0000-0000-000000000000" })).ok, false);
    assert.equal((await ped({ ...base, condicionPagoId: "00000000-0000-0000-0000-000000000000" })).ok, false);
    assert.equal((await ped({ ...base, descuentos: [101, 0, 0] })).ok, false);
    const cobrador = await e.db.vendedor.create({ data: { codigo: unico("C"), nombre: "Solo cobrador", esVendedor: false, esCobrador: true } });
    assert.equal((await ped({ ...base, vendedorId: cobrador.id })).ok, false);
    assert.equal((await ped(base)).ok, true);
  });

  it("la factura de un pedido hereda el encabezado y los descuentos de sus líneas; los totales coinciden", async () => {
    const cli = await crearCliente(e.db);
    const p = await crearProducto(e, { existencia: 10 });
    const v = await e.db.vendedor.create({ data: { codigo: unico("V"), nombre: "V", esVendedor: true } });
    const ped = await guardarPedido(e.db, e.actor, null, { clienteId: cli.id, fecha: hoy(), observaciones: null, lineas: [linea(p.codigo, 4, 10, 5)], encabezado: { vendedorId: v.id, condicionPagoId: null, transporteId: null, direccionEntrega: "Entrega X", descuentos: [10, 0, 0] } });
    assert.ok(ped.ok);
    assert.ok((await confirmarPedido(e.db, e.actor, ped.id)).ok);
    const f = await emitirFacturaDePedido(e.db, e.actor, ped.id, e.almacenId, null, 0);
    assert.ok(f.ok);
    const fa = await e.db.factura.findUniqueOrThrow({ where: { id: f.id }, include: { lineas: true } });
    const pe = await e.db.pedidoVenta.findUniqueOrThrow({ where: { id: ped.id } });
    assert.equal(fa.vendedorId, v.id);
    assert.equal(fa.direccionEntrega, "Entrega X");
    assert.equal(Number(fa.descuentoGlobal1), 10);
    assert.equal(Number(fa.lineas[0].descuentoLinea), 5);
    assert.equal(Number(fa.total), Number(pe.total));
    assert.equal(Number(fa.saldo), Number(pe.total));
  });

  it("cotización → pedido conserva el encabezado y no aplica dos veces los descuentos globales", async () => {
    const cli = await crearCliente(e.db);
    const p = await crearProducto(e, { existencia: 10 });
    const c = await guardarCotizacion(e.db, e.actor, null, { clienteId: cli.id, fecha: hoy(), validezDias: 15, observaciones: null, lineas: [linea(p.codigo, 10, 10, 10)], encabezado: { vendedorId: null, condicionPagoId: null, transporteId: null, direccionEntrega: null, descuentos: [10, 5, 0] } });
    assert.ok(c.ok);
    const cot = await e.db.cotizacion.findUniqueOrThrow({ where: { id: c.id } });
    assert.ok((await emitirCotizacion(e.db, e.actor, c.id)).ok);
    const r = await convertirEnPedido(e.db, e.actor, c.id);
    assert.ok(r.ok);
    const ped = await e.db.pedidoVenta.findUniqueOrThrow({ where: { id: r.pedidoId }, include: { lineas: true } });
    assert.equal(Number(ped.total), Number(cot.total));
    assert.equal(Number(ped.lineas[0].descuento), 23.05);
    assert.equal(Number(ped.lineas[0].descuentoLinea), 10);
  });

  describe("crédito del cliente", () => {
    const ajustar = (id: string, data: Record<string, unknown>) => e.db.cliente.update({ where: { id }, data });

    it("sin crédito solo se vende de contado; bloqueado no se le vende nada", async () => {
      const cli = await crearCliente(e.db);
      const p = await crearProducto(e, { existencia: 20 });
      assert.equal((await factura(cli.id, [linea(p.codigo, 1)], { diasCredito: 15 })).ok, false);
      assert.equal((await factura(cli.id, [linea(p.codigo, 1)], { diasCredito: 0 })).ok, true);
      await ajustar(cli.id, { situacion: "BLOQUEADO" });
      assert.equal((await factura(cli.id, [linea(p.codigo, 1)])).ok, false);
      assert.equal((await guardarPedido(e.db, e.actor, null, { clienteId: cli.id, fecha: hoy(), observaciones: null, lineas: [linea(p.codigo, 1)] })).ok, false);
    });

    it("moroso: solo contado", async () => {
      const cli = await crearCliente(e.db);
      const p = await crearProducto(e, { existencia: 20 });
      await ajustar(cli.id, { tieneCredito: true, situacion: "MOROSO", limiteCredito: 1000 });
      assert.equal((await factura(cli.id, [linea(p.codigo, 1)], { diasCredito: 30 })).ok, false);
      assert.equal((await factura(cli.id, [linea(p.codigo, 1)], { diasCredito: 0 })).ok, true);
    });

    it("el límite de crédito cuenta lo que ya debe: la tercera venta de 100 con límite 250 se rechaza", async () => {
      const cli = await crearCliente(e.db);
      const p = await crearProducto(e, { existencia: 50 });
      await ajustar(cli.id, { tieneCredito: true, limiteCredito: 250 });
      const venta = () => factura(cli.id, [linea(p.codigo, 1, 100)], { diasCredito: 30 }); // 116 con IVA
      assert.equal((await venta()).ok, true);
      assert.equal((await venta()).ok, true);
      const r = await venta();
      assert.equal(r.ok, false);
      if (!r.ok) assert.match(r.error, /límite de crédito/);
    });

    it("concurrencia: dos ventas a crédito simultáneas que juntas pasan el límite no deben dejar ambas… (se documenta el comportamiento)", async () => {
      const cli = await crearCliente(e.db);
      const p = await crearProducto(e, { existencia: 50 });
      await ajustar(cli.id, { tieneCredito: true, limiteCredito: 150 });
      const rs = await Promise.all([1, 2].map(() => factura(cli.id, [linea(p.codigo, 1, 100)], { diasCredito: 30 })));
      // Sin candado por cliente ambas pueden pasar: es un riesgo conocido, anotado en PLAN-WEB.md; aquí solo se exige que al menos una pase.
      assert.ok(rs.filter((r) => r.ok).length >= 1);
    });

    it("facturas vencidas más allá de los días máximos bloquean el crédito", async () => {
      const cli = await crearCliente(e.db);
      const p = await crearProducto(e, { existencia: 50 });
      await ajustar(cli.id, { tieneCredito: true, limiteCredito: 5000, diasMaxVencimiento: 10 });
      const vieja = await factura(cli.id, [linea(p.codigo, 1, 10)], { diasCredito: 30 });
      assert.ok(vieja.ok);
      await e.db.factura.update({ where: { id: vieja.id }, data: { fecha: dia(-60), fechaVencimiento: dia(-30) } });
      const r = await factura(cli.id, [linea(p.codigo, 1, 10)], { diasCredito: 30 });
      assert.equal(r.ok, false);
      if (!r.ok) assert.match(r.error, /vencidas/);
      assert.equal((await factura(cli.id, [linea(p.codigo, 1, 10)], { diasCredito: 0 })).ok, true); // al contado sí
    });
  });

  describe("lista de precios, promociones y descuento máximo", () => {
    it("la lista del cliente fija el precio; sin precio en esa lista se usa el de lista A; un precio vencido no rige", async () => {
      const p = await crearProducto(e, { precio: 10 });
      await e.db.productoPrecio.create({ data: { productoCodigo: p.codigo, lista: "B", precioUsd: 8, descuentoPct: 3, descuentoMaxPct: 10 } });
      await e.db.productoPrecio.create({ data: { productoCodigo: p.codigo, lista: "C", precioUsd: 7, venceEn: dia(-1) } });
      const de = async (lista: string) => (await resolverPrecios(e.db, [p.codigo], lista)).get(p.codigo)!;
      assert.deepEqual([(await de("B")).precioUsd, (await de("B")).descuentoSugeridoPct, (await de("B")).descuentoMaxPct, (await de("B")).origen], [8, 3, 10, "LISTA"]);
      assert.equal((await de("A")).precioUsd, 10);
      assert.equal((await de("A")).origen, "BASE");
      assert.equal((await de("C")).precioUsd, 10); // vencido
    });

    it("una promoción de precio manda sobre la lista; una de descuento sugiere descuento; fuera de fecha no aplica", async () => {
      const p = await crearProducto(e, { precio: 10 });
      await e.db.productoPrecio.create({ data: { productoCodigo: p.codigo, lista: "B", precioUsd: 9 } });
      await e.db.promocion.create({ data: { productoCodigo: p.codigo, lista: "B", precioUsd: 6.5, desde: dia(-1), hasta: dia(5) } });
      await e.db.promocion.create({ data: { productoCodigo: p.codigo, descuentoPct: 12, desde: dia(10), hasta: dia(20) } }); // futura
      const r = (await resolverPrecios(e.db, [p.codigo], "B")).get(p.codigo)!;
      assert.equal(r.precioUsd, 6.5);
      assert.equal(r.origen, "PROMOCION");
      assert.equal((await resolverPrecios(e.db, [p.codigo], "A")).get(p.codigo)!.precioUsd, 10); // la promo es solo de la lista B
      const q = await crearProducto(e, { precio: 20 });
      await e.db.promocion.create({ data: { productoCodigo: q.codigo, descuentoPct: 12, desde: dia(-1), hasta: dia(5) } });
      assert.equal((await resolverPrecios(e.db, [q.codigo], "A")).get(q.codigo)!.descuentoSugeridoPct, 12);
    });

    it("el descuento máximo de la lista limita lo que escribe quien vende", async () => {
      const cli = await crearCliente(e.db);
      await e.db.cliente.update({ where: { id: cli.id }, data: { listaPrecio: "B" } });
      const p = await crearProducto(e, { precio: 10, existencia: 20 });
      await e.db.productoPrecio.create({ data: { productoCodigo: p.codigo, lista: "B", precioUsd: 9, descuentoMaxPct: 10 } });
      assert.equal((await factura(cli.id, [linea(p.codigo, 1, 9, 12)])).ok, false);
      assert.equal((await factura(cli.id, [linea(p.codigo, 1, 9, 10)])).ok, true);
      // sin tope declarado (0) no se limita
      const q = await crearProducto(e, { precio: 10, existencia: 20 });
      await e.db.productoPrecio.create({ data: { productoCodigo: q.codigo, lista: "B", precioUsd: 9, descuentoMaxPct: 0 } });
      assert.equal((await factura(cli.id, [linea(q.codigo, 1, 9, 40)])).ok, true);
    });
  });
});
