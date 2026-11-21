import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { anularOrden, emitirOrden, guardarOrden, recibirOrden } from "../src/lib/compras/servicio";
import { anularFacturaCompra, anularPago, registrarFacturaCompra, registrarPago } from "../src/lib/cxp/servicio";
import { anularRetencion, registrarRetencionPracticada } from "../src/lib/retenciones/servicio";
import { abrirEntorno, automatica, crearCajaTesoreria, crearProducto, crearProveedor, descuadreContable, fijarTasa, hoy, type Entorno } from "./soporte/entorno";

describe("Compras, cuentas por pagar y retenciones practicadas", () => {
  let e: Entorno;
  before(async () => {
    e = await abrirEntorno();
    await fijarTasa(e.db, 40);
    await automatica(e.db, true);
  });
  after(async () => {
    await automatica(e.db, false);
  });

  const existencia = async (codigo: string) => Number((await e.db.existencia.findUnique({ where: { almacenId_productoCodigo: { almacenId: e.almacenId, productoCodigo: codigo } } }))?.cantidad ?? 0);

  async function ordenEmitida(proveedorId: string, codigo: string, cantidad: number, costo: number) {
    const o = await guardarOrden(e.db, e.actor, null, { proveedorId, fecha: hoy(), fechaEsperada: null, observaciones: null, lineas: [{ productoCodigo: codigo, cantidad, costoUnitario: costo, descuento: 0 }] });
    assert.ok(o.ok);
    assert.ok((await emitirOrden(e.db, e.actor, o.id)).ok);
    const l = await e.db.ordenCompraLinea.findFirstOrThrow({ where: { ordenId: o.id } });
    return { id: o.id, lineaId: l.id };
  }
  const recibir = (o: { id: string; lineaId: string }, cantidad: number) => recibirOrden(e.db, e.actor, o.id, { almacenId: e.almacenId, documento: null, observaciones: null, lineas: [{ ordenLineaId: o.lineaId, cantidad }] });

  it("recepción parcial y total suma inventario y calcula el costo promedio ponderado", async () => {
    const prov = await crearProveedor(e.db);
    const p = await crearProducto(e, { existencia: 10, costo: 2 }); // 10 a 2 USD
    const o = await ordenEmitida(prov.id, p.codigo, 10, 4);
    assert.ok((await recibir(o, 4)).ok);
    assert.equal(await existencia(p.codigo), 14);
    assert.ok((await recibir(o, 6)).ok);
    assert.equal(await existencia(p.codigo), 20);
    // (10×2 + 4×4 + 6×4) / 20 = 3
    assert.equal(Number((await e.db.producto.findUniqueOrThrow({ where: { codigo: p.codigo } })).costoPromedio), 3);
    assert.equal((await e.db.ordenCompra.findUniqueOrThrow({ where: { id: o.id } })).estado, "RECIBIDA");
  });

  it("no recibe más de lo pedido y una orden anulada no se recibe", async () => {
    const prov = await crearProveedor(e.db);
    const p = await crearProducto(e);
    const o = await ordenEmitida(prov.id, p.codigo, 5, 1);
    assert.equal((await recibir(o, 6)).ok, false);
    assert.equal((await recibir(o, 0)).ok, false);
    assert.equal(await existencia(p.codigo), 0);
    assert.ok((await anularOrden(e.db, e.actor, o.id)).ok);
    assert.equal((await recibir(o, 1)).ok, false);
  });

  it("concurrencia: dos recepciones simultáneas del total de la orden solo dejan pasar una", async () => {
    const prov = await crearProveedor(e.db);
    const p = await crearProducto(e);
    const o = await ordenEmitida(prov.id, p.codigo, 5, 1);
    const rs = await Promise.all([recibir(o, 5), recibir(o, 5)]);
    assert.equal(rs.filter((r) => r.ok).length, 1);
    assert.equal(await existencia(p.codigo), 5);
  });

  const factura = (proveedorId: string, subtotal: number, iva: number, documento = `F-${Math.random()}`) =>
    registrarFacturaCompra(e.db, e.actor, { proveedorId, ordenId: null, documento, numeroControl: null, fecha: hoy(), diasCredito: 0, subtotal, iva, observaciones: null });
  const saldoCompra = async (id: string) => Number((await e.db.facturaCompra.findUniqueOrThrow({ where: { id } })).saldo);

  it("factura de proveedor: mismo documento no se repite; total = subtotal + IVA", async () => {
    const prov = await crearProveedor(e.db);
    const a = await factura(prov.id, 100, 16, "A-1");
    assert.ok(a.ok);
    assert.equal(await saldoCompra(a.id), 116);
    assert.equal((await factura(prov.id, 100, 16, "A-1")).ok, false);
    assert.equal((await factura(prov.id, -1, 0)).ok, false);
    assert.equal((await factura(prov.id, 0, 0)).ok, false);
  });

  it("pago: parcial, no paga de más, no sale de una caja sin fondos y anular restituye", async () => {
    const prov = await crearProveedor(e.db);
    const f = await factura(prov.id, 100, 16);
    assert.ok(f.ok);
    const caja = await crearCajaTesoreria(e, "USD", 200);
    const pagar = (monto: number, cuentaId = caja.id) => registrarPago(e.db, e.actor, { proveedorId: prov.id, formaPago: "TRANSFERENCIA", moneda: "USD", cuentaId, referencia: null, observaciones: null, aplicaciones: [{ facturaId: f.id, montoUsd: monto }] });
    const p1 = await pagar(50);
    assert.ok(p1.ok);
    assert.equal(await saldoCompra(f.id), 66);
    assert.equal((await pagar(66.01)).ok, false);
    const vacia = await crearCajaTesoreria(e, "USD", 10);
    assert.equal((await pagar(66, vacia.id)).ok, false);
    assert.equal(await saldoCompra(f.id), 66);
    assert.equal(Number((await e.db.cuentaTesoreria.findUniqueOrThrow({ where: { id: caja.id } })).saldo), 150);
    assert.ok((await anularPago(e.db, e.actor, p1.id, "Error")).ok);
    assert.equal(await saldoCompra(f.id), 116);
    assert.equal(Number((await e.db.cuentaTesoreria.findUniqueOrThrow({ where: { id: caja.id } })).saldo), 200);
    assert.equal((await anularPago(e.db, e.actor, p1.id, "Otra vez")).ok, false);
  });

  it("concurrencia: dos pagos simultáneos por el total solo dejan pasar uno", async () => {
    const prov = await crearProveedor(e.db);
    const f = await factura(prov.id, 100, 0);
    assert.ok(f.ok);
    const caja = await crearCajaTesoreria(e, "USD", 1000);
    const rs = await Promise.all([1, 2].map(() => registrarPago(e.db, e.actor, { proveedorId: prov.id, formaPago: "ZELLE", moneda: "USD", cuentaId: caja.id, referencia: null, observaciones: null, aplicaciones: [{ facturaId: f.id, montoUsd: 100 }] })));
    assert.equal(rs.filter((r) => r.ok).length, 1);
    assert.equal(await saldoCompra(f.id), 0);
    assert.equal(Number((await e.db.cuentaTesoreria.findUniqueOrThrow({ where: { id: caja.id } })).saldo), 900);
  });

  it("retención practicada reduce lo que se debe y se revierte al anular", async () => {
    const prov = await crearProveedor(e.db, { retencionIvaPct: 75 });
    const f = await factura(prov.id, 100, 16);
    assert.ok(f.ok);
    const r = await registrarRetencionPracticada(e.db, e.actor, { facturaId: f.id, tipo: "IVA", porcentaje: 75 }); // 12
    assert.ok(r.ok);
    assert.equal(await saldoCompra(f.id), 104);
    assert.equal((await registrarRetencionPracticada(e.db, e.actor, { facturaId: f.id, tipo: "IVA", porcentaje: 75 })).ok, false);
    const caja = await crearCajaTesoreria(e, "USD", 500);
    assert.ok((await registrarPago(e.db, e.actor, { proveedorId: prov.id, formaPago: "ZELLE", moneda: "USD", cuentaId: caja.id, referencia: null, observaciones: null, aplicaciones: [{ facturaId: f.id, montoUsd: 104 }] })).ok);
    assert.equal(await saldoCompra(f.id), 0);
    assert.ok((await anularRetencion(e.db, e.actor, r.id, "Prueba")).ok); // sin retención, los 12 USD vuelven a ser deuda
    assert.equal(await saldoCompra(f.id), 12);
    
  });

  it("anular factura de proveedor: bloqueada con pagos vigentes, permitida sin ellos", async () => {
    const prov = await crearProveedor(e.db);
    const f = await factura(prov.id, 50, 8);
    assert.ok(f.ok);
    const caja = await crearCajaTesoreria(e, "USD", 100);
    const p = await registrarPago(e.db, e.actor, { proveedorId: prov.id, formaPago: "ZELLE", moneda: "USD", cuentaId: caja.id, referencia: null, observaciones: null, aplicaciones: [{ facturaId: f.id, montoUsd: 10 }] });
    assert.ok(p.ok);
    assert.equal((await anularFacturaCompra(e.db, e.actor, f.id, "Error")).ok, false);
    assert.ok((await anularPago(e.db, e.actor, p.id, "Error")).ok);
    assert.ok((await anularFacturaCompra(e.db, e.actor, f.id, "Error")).ok);
    assert.equal(await saldoCompra(f.id), 0);
  });

  it("el libro sigue cuadrado y no hay saldos ni existencias negativas", async () => {
    assert.equal(await descuadreContable(e.db), 0);
    for (const sql of ["SELECT COUNT(*)::text AS n FROM factura_compra WHERE saldo < 0", "SELECT COUNT(*)::text AS n FROM cuenta_tesoreria WHERE saldo < 0 AND NOT permite_sobregiro", "SELECT COUNT(*)::text AS n FROM existencia WHERE cantidad < 0"]) {
      assert.equal((await e.db.$queryRawUnsafe<{ n: string }[]>(sql))[0].n, "0", sql);
    }
  });
});
