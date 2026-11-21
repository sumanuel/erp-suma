import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { anularFacturaCompra, registrarFacturaCompra } from "../src/lib/cxp/servicio";
import { emitirFactura } from "../src/lib/facturacion/servicio";
import { anularNotaCompra, anularNotaVenta, crearNotaCompra, crearNotaVenta } from "../src/lib/notas/servicio";
import { anularEntero, enterarRetenciones, registrarRetencionPracticada } from "../src/lib/retenciones/servicio";
import { abrirEntorno, automatica, crearCajaTesoreria, crearCliente, crearProducto, crearProveedor, descuadreContable, fijarTasa, hoy, type Entorno } from "./soporte/entorno";

describe("Notas de crédito/débito y entero de retenciones", () => {
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
  const saldoVenta = async (id: string) => Number((await e.db.factura.findUniqueOrThrow({ where: { id } })).saldo);
  const saldoCompra = async (id: string) => Number((await e.db.facturaCompra.findUniqueOrThrow({ where: { id } })).saldo);
  async function facturaVenta(cantidad: number) {
    const cli = await crearCliente(e.db);
    const p = await crearProducto(e, { existencia: 20, costo: 4 });
    const f = await emitirFactura(e.db, e.actor, { clienteId: cli.id, almacenId: e.almacenId, observaciones: null, diasCredito: 0, lineas: [{ productoCodigo: p.codigo, cantidad, precioUnitario: 10, descuento: 0 }] });
    assert.ok(f.ok);
    const fl = await e.db.facturaLinea.findFirstOrThrow({ where: { facturaId: f.id } });
    return { id: f.id, codigo: p.codigo, lineaId: fl.id };
  }

  it("nota de crédito por devolución: regresa mercancía, baja el saldo y no devuelve más de lo vendido", async () => {
    const f = await facturaVenta(10); // total 116
    assert.equal(await existencia(f.codigo), 10);
    const n = await crearNotaVenta(e.db, e.actor, { tipo: "CREDITO", modo: "DEVOLUCION", facturaId: f.id, motivo: "Devolución", almacenId: e.almacenId, lineas: [{ facturaLineaId: f.lineaId, cantidad: 4 }] });
    assert.ok(n.ok);
    assert.equal(await existencia(f.codigo), 14);
    assert.equal(await saldoVenta(f.id), 69.6);
    assert.equal((await crearNotaVenta(e.db, e.actor, { tipo: "CREDITO", modo: "DEVOLUCION", facturaId: f.id, motivo: "Devolución", almacenId: e.almacenId, lineas: [{ facturaLineaId: f.lineaId, cantidad: 7 }] })).ok, false);
    assert.equal(await existencia(f.codigo), 14);
    assert.ok((await anularNotaVenta(e.db, e.actor, n.id, "Error")).ok);
    assert.equal(await existencia(f.codigo), 10);
    assert.equal(await saldoVenta(f.id), 116);
    assert.equal((await anularNotaVenta(e.db, e.actor, n.id, "Otra vez")).ok, false);
  });

  it("nota de crédito por ajuste no supera el saldo y la de débito lo aumenta", async () => {
    const f = await facturaVenta(10); // 100 + 16
    const credito = (base: number) => crearNotaVenta(e.db, e.actor, { tipo: "CREDITO", modo: "AJUSTE", facturaId: f.id, motivo: "Descuento", base, ivaPorcentaje: 16 });
    assert.equal((await credito(200)).ok, false);
    assert.equal(await saldoVenta(f.id), 116);
    assert.ok((await credito(50)).ok); // 58
    assert.equal(await saldoVenta(f.id), 58);
    const d = await crearNotaVenta(e.db, e.actor, { tipo: "DEBITO", modo: "CARGO", facturaId: f.id, motivo: "Flete", base: 10, ivaPorcentaje: 16 });
    assert.ok(d.ok);
    assert.equal(await saldoVenta(f.id), 69.6);
    assert.equal((await crearNotaVenta(e.db, e.actor, { tipo: "CREDITO", modo: "AJUSTE", facturaId: f.id, motivo: "Descuento", base: 10, ivaPorcentaje: 16 })).ok, true);
    assert.equal((await crearNotaVenta(e.db, e.actor, { tipo: "CREDITO", modo: "AJUSTE", facturaId: f.id, motivo: "", base: 10, ivaPorcentaje: 16 })).ok, false);
    assert.equal((await crearNotaVenta(e.db, e.actor, { tipo: "CREDITO", modo: "AJUSTE", facturaId: f.id, motivo: "iva", base: 10, ivaPorcentaje: 150 })).ok, false);
  });

  it("concurrencia: dos notas de crédito que juntas exceden el saldo → solo una procede", async () => {
    const f = await facturaVenta(10); // 116
    const rs = await Promise.all([1, 2].map(() => crearNotaVenta(e.db, e.actor, { tipo: "CREDITO", modo: "AJUSTE", facturaId: f.id, motivo: "Descuento", base: 80, ivaPorcentaje: 16 }))); // 92,80 c/u
    assert.equal(rs.filter((r) => r.ok).length, 1);
    assert.equal(await saldoVenta(f.id), 23.2);
  });

  it("notas de compra: la nota del proveedor ajusta el saldo, no se repite y la factura con notas vigentes no se anula", async () => {
    const prov = await crearProveedor(e.db);
    const fc = await registrarFacturaCompra(e.db, e.actor, { proveedorId: prov.id, ordenId: null, documento: `FC-${Math.random()}`, numeroControl: null, fecha: hoy(), diasCredito: 0, subtotal: 100, iva: 16, observaciones: null });
    assert.ok(fc.ok);
    const nota = (tipo: string, documento: string, subtotal: number, iva: number) => crearNotaCompra(e.db, e.actor, { tipo, facturaId: fc.id, documento, numeroControl: null, fecha: hoy(), motivo: "Ajuste", subtotal, iva });
    const nc = await nota("CREDITO", "NC-1", 50, 8);
    assert.ok(nc.ok);
    assert.equal(await saldoCompra(fc.id), 58);
    assert.equal((await nota("CREDITO", "NC-1", 1, 0)).ok, false);
    assert.equal((await nota("CREDITO", "NC-2", 100, 16)).ok, false);
    assert.equal((await anularFacturaCompra(e.db, e.actor, fc.id, "Error")).ok, false);
    assert.ok((await anularNotaCompra(e.db, e.actor, nc.id, "Error")).ok);
    assert.equal(await saldoCompra(fc.id), 116);
    assert.ok((await nota("DEBITO", "ND-1", 10, 1.6)).ok);
    assert.equal(await saldoCompra(fc.id), 127.6);
  });

  describe("entero de retenciones al fisco", () => {
    async function retencionPracticada() {
      const prov = await crearProveedor(e.db, { retencionIvaPct: 75 });
      const fc = await registrarFacturaCompra(e.db, e.actor, { proveedorId: prov.id, ordenId: null, documento: `FC-${Math.random()}`, numeroControl: null, fecha: hoy(), diasCredito: 0, subtotal: 100, iva: 16, observaciones: null });
      assert.ok(fc.ok);
      const r = await registrarRetencionPracticada(e.db, e.actor, { facturaId: fc.id, tipo: "IVA", porcentaje: 75 }); // 12 USD = 480 Bs.
      assert.ok(r.ok);
      return r.id;
    }
    const saldoCaja = async (id: string) => Number((await e.db.cuentaTesoreria.findUniqueOrThrow({ where: { id } })).saldo);

    it("se entera una vez, en bolívares y con fondos; anular lo deja de nuevo por enterar", async () => {
      const id = await retencionPracticada();
      const usd = await crearCajaTesoreria(e, "USD", 100);
      const pobre = await crearCajaTesoreria(e, "VES", 10);
      const caja = await crearCajaTesoreria(e, "VES", 1000);
      assert.equal((await enterarRetenciones(e.db, e.actor, { tipo: "IVA", retencionIds: [id], cuentaId: usd.id, referencia: null })).ok, false);
      assert.equal((await enterarRetenciones(e.db, e.actor, { tipo: "IVA", retencionIds: [id], cuentaId: pobre.id, referencia: null })).ok, false);
      assert.equal((await enterarRetenciones(e.db, e.actor, { tipo: "ISLR", retencionIds: [id], cuentaId: caja.id, referencia: null })).ok, false);
      assert.equal((await enterarRetenciones(e.db, e.actor, { tipo: "IVA", retencionIds: [], cuentaId: caja.id, referencia: null })).ok, false);
      assert.equal((await e.db.retencion.findUniqueOrThrow({ where: { id } })).enteroId, null);
      const rs = await Promise.all([1, 2].map(() => enterarRetenciones(e.db, e.actor, { tipo: "IVA", retencionIds: [id], cuentaId: caja.id, referencia: "PLANILLA" })));
      assert.equal(rs.filter((r) => r.ok).length, 1);
      assert.equal(await saldoCaja(caja.id), 520);
      const ok = rs.find((r) => r.ok)!;
      assert.ok(ok.ok);
      assert.ok((await anularEntero(e.db, e.actor, ok.id, "Error")).ok);
      assert.equal(await saldoCaja(caja.id), 1000);
      assert.equal((await e.db.retencion.findUniqueOrThrow({ where: { id } })).enteroId, null);
      assert.equal((await anularEntero(e.db, e.actor, ok.id, "Otra vez")).ok, false);
      assert.ok((await enterarRetenciones(e.db, e.actor, { tipo: "IVA", retencionIds: [id], cuentaId: caja.id, referencia: null })).ok);
    });
  });

  it("el libro sigue cuadrado y no hay saldos negativos", async () => {
    assert.equal(await descuadreContable(e.db), 0);
    assert.equal((await e.db.$queryRawUnsafe<{ n: string }[]>("SELECT COUNT(*)::text AS n FROM factura WHERE saldo < 0"))[0].n, "0");
    assert.equal((await e.db.$queryRawUnsafe<{ n: string }[]>("SELECT COUNT(*)::text AS n FROM factura_compra WHERE saldo < 0"))[0].n, "0");
  });
});
