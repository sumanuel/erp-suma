import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { anularFactura, emitirFactura, emitirFacturaDePedido } from "../src/lib/facturacion/servicio";
import { registrarMovimiento } from "../src/lib/inventario/movimientos";
import { confirmarPedido, guardarPedido } from "../src/lib/pedidos/servicio";
import { convertirEnPedido, emitirCotizacion, guardarCotizacion } from "../src/lib/cotizaciones/servicio";
import { cantidadBonificada } from "../src/lib/ventas/precios";
import { abrirEntorno, automatica, crearCliente, crearProducto, fijarTasa, hoy, unico, type Entorno } from "./soporte/entorno";

describe("Documentos de venta: bonificaciones, almacén por línea y aprobación gerencial", () => {
  let e: Entorno;
  before(async () => {
    e = await abrirEntorno();
    await fijarTasa(e.db, 40);
    await automatica(e.db, true); // las facturas deben quedar contabilizadas para que los libros de reportes.test.ts cuadren
  });
  after(async () => {
    await automatica(e.db, false);
  });
  const dia = (n: number) => new Date(hoy().getTime() + n * 86_400_000);
  const promo = (productoCodigo: string, extra: Record<string, unknown> = {}) =>
    e.db.promocion.create({ data: { productoCodigo, cantidadRequerida: 10, cantidadOtorgada: 1, multiplo: 10, desde: dia(-1), hasta: dia(30), ...extra } });
  const linea = (productoCodigo: string, cantidad: number, extra: Record<string, unknown> = {}) => ({ productoCodigo, cantidad, precioUnitario: 10, descuento: 0, ...extra });
  const existencia = async (codigo: string, almacenId: string) => Number((await e.db.existencia.findFirst({ where: { productoCodigo: codigo, almacenId } }))?.cantidad ?? 0);

  it("la regla «compra N, llévate M»: por cada múltiplo comprado, una sola vez si no hay múltiplo, nada si no llega", () => {
    const p = { requerida: 10, otorgada: 1, multiplo: 10 };
    assert.equal(cantidadBonificada(p, 9), 0);
    assert.equal(cantidadBonificada(p, 10), 1);
    assert.equal(cantidadBonificada(p, 25), 2);
    assert.equal(cantidadBonificada({ requerida: 5, otorgada: 2, multiplo: 0 }, 50), 2);
    assert.equal(cantidadBonificada({ requerida: 0, otorgada: 2, multiplo: 0 }, 50), 0);
    assert.equal(cantidadBonificada({ requerida: 5, otorgada: 0, multiplo: 0 }, 50), 0);
  });

  it("un pedido agrega solo la línea regalada (precio 0), los totales no cambian y al facturar sale del inventario", async () => {
    const cli = await crearCliente(e.db);
    const p = await crearProducto(e, { existencia: 30 });
    await promo(p.codigo);
    const r = await guardarPedido(e.db, e.actor, null, { clienteId: cli.id, fecha: hoy(), observaciones: null, lineas: [linea(p.codigo, 25)] });
    assert.ok(r.ok);
    const ped = await e.db.pedidoVenta.findUniqueOrThrow({ where: { id: r.id }, include: { lineas: { orderBy: { linea: "asc" } } } });
    assert.equal(ped.lineas.length, 2);
    assert.deepEqual(ped.lineas.map((l) => [Number(l.cantidad), Number(l.precioUnitario), l.bonificacion]), [[25, 10, false], [2, 0, true]]);
    assert.equal(Number(ped.subtotal), 250);
    // Reservar y facturar: salen 27 unidades.
    assert.ok((await confirmarPedido(e.db, e.actor, r.id)).ok);
    const f = await emitirFacturaDePedido(e.db, e.actor, r.id, e.almacenId, null, 0);
    assert.ok(f.ok);
    assert.equal(await existencia(p.codigo, e.almacenId), 3);
    const fac = await e.db.factura.findUniqueOrThrow({ where: { id: f.id }, include: { lineas: true } });
    assert.equal(Number(fac.subtotal), 250);
    assert.equal(fac.lineas.filter((l) => l.bonificacion).length, 1);
    // Anular devuelve las 27.
    assert.ok((await anularFactura(e.db, e.actor, f.id, "prueba de anulación")).ok);
    assert.equal(await existencia(p.codigo, e.almacenId), 30);
  });

  it("no hay bonificación sin llegar a la cantidad, con la promoción vencida ni en otra lista; editar no la duplica", async () => {
    const cli = await crearCliente(e.db);
    const p = await crearProducto(e, { existencia: 50 });
    const cuenta = async (cantidad: number) => {
      const r = await guardarPedido(e.db, e.actor, null, { clienteId: cli.id, fecha: hoy(), observaciones: null, lineas: [linea(p.codigo, cantidad)] });
      assert.ok(r.ok);
      return { id: r.id, n: await e.db.pedidoVentaLinea.count({ where: { pedidoId: r.id } }) };
    };
    await promo(p.codigo, { desde: dia(-30), hasta: dia(-2) }); // vencida
    assert.equal((await cuenta(20)).n, 1);
    await promo(p.codigo, { lista: "Z" }); // otra lista (el cliente es de la A)
    assert.equal((await cuenta(20)).n, 1);
    await promo(p.codigo);
    assert.equal((await cuenta(9)).n, 1);
    const x = await cuenta(10);
    assert.equal(x.n, 2);
    // Se edita el pedido: se recalcula, no se acumula.
    const r2 = await guardarPedido(e.db, e.actor, x.id, { clienteId: cli.id, fecha: hoy(), observaciones: null, lineas: [linea(p.codigo, 20)] });
    assert.ok(r2.ok);
    const ls = await e.db.pedidoVentaLinea.findMany({ where: { pedidoId: x.id }, orderBy: { linea: "asc" } });
    assert.deepEqual(ls.map((l) => Number(l.cantidad)), [20, 2]);
  });

  it("cotización → pedido no arrastra la bonificación vieja: se vuelve a calcular", async () => {
    const cli = await crearCliente(e.db);
    const p = await crearProducto(e, { existencia: 50 });
    await promo(p.codigo);
    const c = await guardarCotizacion(e.db, e.actor, null, { clienteId: cli.id, fecha: hoy(), validezDias: 10, observaciones: null, lineas: [linea(p.codigo, 10)] });
    assert.ok(c.ok);
    assert.equal(await e.db.cotizacionLinea.count({ where: { cotizacionId: c.id } }), 2);
    assert.ok((await emitirCotizacion(e.db, e.actor, c.id)).ok);
    const ped = await convertirEnPedido(e.db, e.actor, c.id);
    assert.ok(ped.ok);
    assert.deepEqual((await e.db.pedidoVentaLinea.findMany({ where: { pedidoId: ped.pedidoId }, orderBy: { linea: "asc" } })).map((l) => [Number(l.cantidad), l.bonificacion]), [[10, false], [1, true]]);
  });

  it("factura directa: la existencia debe alcanzar para lo vendido más lo regalado", async () => {
    const cli = await crearCliente(e.db);
    const p = await crearProducto(e, { existencia: 26 });
    await promo(p.codigo);
    const f = (cantidad: number) => emitirFactura(e.db, e.actor, { clienteId: cli.id, almacenId: e.almacenId, observaciones: null, diasCredito: 0, lineas: [linea(p.codigo, cantidad)] });
    assert.equal((await f(25)).ok, false); // 25 + 2 regaladas = 27 > 26
    assert.equal((await f(20)).ok, true); // 20 + 2 = 22
    assert.equal(await existencia(p.codigo, e.almacenId), 4);
  });

  it("almacén por línea: la mercancía sale del almacén de la línea y la anulación la devuelve ahí", async () => {
    const cli = await crearCliente(e.db);
    const p = await crearProducto(e, { existencia: 5 });
    const otro = await e.db.almacen.create({ data: { codigo: unico("AL"), nombre: "Almacén secundario" } });
    const m = await registrarMovimiento(e.db, e.actor, { tipo: "ENTRADA", almacenId: otro.id, productoCodigo: p.codigo, cantidad: 8, costoUnitario: 1 });
    assert.ok(m.ok);
    const f = await emitirFactura(e.db, e.actor, { clienteId: cli.id, almacenId: e.almacenId, observaciones: null, diasCredito: 0, lineas: [linea(p.codigo, 6, { almacenId: otro.id })] });
    assert.ok(f.ok);
    assert.equal(await existencia(p.codigo, otro.id), 2);
    assert.equal(await existencia(p.codigo, e.almacenId), 5);
    const fac = await e.db.factura.findUniqueOrThrow({ where: { id: f.id }, include: { lineas: true } });
    assert.equal(fac.lineas[0].almacenId, otro.id);
    assert.ok((await anularFactura(e.db, e.actor, f.id, "prueba de almacén")).ok);
    assert.equal(await existencia(p.codigo, otro.id), 8);
    assert.equal(await existencia(p.codigo, e.almacenId), 5);
  });

  it("almacén por línea: rechaza uno inexistente o inactivo y no deja sacar más de lo que tiene ese almacén", async () => {
    const cli = await crearCliente(e.db);
    const p = await crearProducto(e, { existencia: 20 });
    const inactivo = await e.db.almacen.create({ data: { codigo: unico("AL"), nombre: "Cerrado", activo: false } });
    const vacio = await e.db.almacen.create({ data: { codigo: unico("AL"), nombre: "Vacío" } });
    const f = (almacenId: string) => emitirFactura(e.db, e.actor, { clienteId: cli.id, almacenId: e.almacenId, observaciones: null, diasCredito: 0, lineas: [linea(p.codigo, 1, { almacenId })] });
    assert.equal((await f("00000000-0000-0000-0000-000000000000")).ok, false);
    assert.equal((await f(inactivo.id)).ok, false);
    assert.equal((await f(vacio.id)).ok, false); // hay 20 en total, pero 0 en ese almacén
    assert.equal(await existencia(p.codigo, e.almacenId), 20);
  });

  it("aprobación gerencial: sin ella el crédito rechaza; con ella pasa y queda registrado quién y por qué; el bloqueo no se aprueba", async () => {
    const p = await crearProducto(e, { existencia: 20 });
    const sinCredito = await e.db.cliente.create({ data: { documento: unico("J"), razonSocial: "Sin crédito", tipo: "Privado", tieneCredito: false } });
    const f = (clienteId: string, aprobacion?: { motivo: string }) => emitirFactura(e.db, e.actor, { clienteId, almacenId: e.almacenId, observaciones: null, diasCredito: 30, lineas: [linea(p.codigo, 1)], aprobacion });
    const no = await f(sinCredito.id);
    assert.ok(!no.ok && /aprobación gerencial/i.test(no.error));
    const si = await f(sinCredito.id, { motivo: "Cliente histórico, lo autoriza gerencia" });
    assert.ok(si.ok);
    const fac = await e.db.factura.findUniqueOrThrow({ where: { id: si.id } });
    assert.equal(fac.aprobadoPorNombre, e.actor.nombre);
    assert.match(fac.aprobacionMotivo ?? "", /histórico/);
    assert.ok(await e.db.auditoriaCambio.findFirst({ where: { entidadId: si.id } }));
    // Un cliente con crédito no deja rastro de aprobación aunque se pida.
    const conCredito = await e.db.cliente.create({ data: { documento: unico("J"), razonSocial: "Con crédito", tipo: "Privado", tieneCredito: true, limiteCredito: 0 } });
    const normal = await f(conCredito.id, { motivo: "no hacía falta" });
    assert.ok(normal.ok);
    assert.equal((await e.db.factura.findUniqueOrThrow({ where: { id: normal.id } })).aprobadoPorNombre, null);
    // Bloqueado: ni con aprobación.
    const bloqueado = await e.db.cliente.create({ data: { documento: unico("J"), razonSocial: "Bloqueado", tipo: "Privado", situacion: "BLOQUEADO" } });
    assert.equal((await f(bloqueado.id, { motivo: "intento" })).ok, false);
  });
});
