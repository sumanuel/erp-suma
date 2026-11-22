import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { emitirOrden, guardarOrden, recibirOrden, type EncabezadoCompra } from "../src/lib/compras/servicio";
import { registrarFacturaCompra } from "../src/lib/cxp/servicio";
import { reporteLibroCompras } from "../src/lib/reportes/fiscal";
import { abrirEntorno, automatica, crearProducto, crearProveedor, descuadreContable, fijarTasa, hoy, unico, type Entorno } from "./soporte/entorno";

describe("Orden de compra y documento del proveedor con sus campos completos", () => {
  let e: Entorno;
  before(async () => {
    e = await abrirEntorno();
    await fijarTasa(e.db, 40);
    await automatica(e.db, true);
  });
  after(async () => {
    await automatica(e.db, false);
  });
  const dia = (n: number) => new Date(hoy().getTime() + n * 86_400_000);
  const base: EncabezadoCompra = { condicionPagoId: null, transporteId: null, centroCostoId: null, referencia: null, moneda: "USD", valorCambio: null, descuentos: [0, 0, 0] };

  it("orden: condición, transporte, centro de costo, referencia y descuentos en cadena (3 por línea + 3 del documento)", async () => {
    const prov = await crearProveedor(e.db);
    const p = await crearProducto(e);
    const cp = await e.db.condicionPago.create({ data: { codigo: unico("CP"), nombre: "30 días", dias: 30 } });
    const tr = await e.db.transporte.create({ data: { codigo: unico("T"), nombre: "Fletes" } });
    const cc = await e.db.centroCosto.create({ data: { codigo: unico("CC"), nombre: "Almacén central" } });
    const ar = await e.db.arancel.create({ data: { codigo: unico("A"), descripcion: "Tornillos", porcentaje: 15, impuesto: 0, kilos: 0 } });
    const r = await guardarOrden(e.db, e.actor, null, {
      proveedorId: prov.id, fecha: hoy(), fechaEsperada: null, observaciones: null,
      lineas: [{ productoCodigo: p.codigo, cantidad: 10, costoUnitario: 10, descuento: 10, descuento2: 5, descuento3: 0, arancelId: ar.id }],
      encabezado: { ...base, condicionPagoId: cp.id, transporteId: tr.id, centroCostoId: cc.id, referencia: "PROF-77", descuentos: [10, 0, 0] },
    });
    assert.ok(r.ok, JSON.stringify(r));
    const o = await e.db.ordenCompra.findUniqueOrThrow({ where: { id: r.id }, include: { lineas: true } });
    assert.equal(o.condicionPagoId, cp.id);
    assert.equal(o.referencia, "PROF-77");
    assert.equal(Number(o.descuentoGlobal1), 10);
    const l = o.lineas[0];
    assert.deepEqual([Number(l.descuento1), Number(l.descuento2), Number(l.descuento3)], [10, 5, 0]);
    assert.equal(Number(l.descuento), 23.05); // 10 % y 5 % → 14,5 %; con el 10 % del documento → 23,05 %
    assert.equal(Number(l.arancelPct), 15);
    assert.equal(Number(o.subtotal), 76.95);
  });

  it("rechaza condición, transporte, centro o arancel inexistentes y descuentos fuera de rango", async () => {
    const prov = await crearProveedor(e.db);
    const p = await crearProducto(e);
    const orden = (enc: Partial<EncabezadoCompra>, linea: Record<string, unknown> = {}) =>
      guardarOrden(e.db, e.actor, null, { proveedorId: prov.id, fecha: hoy(), fechaEsperada: null, observaciones: null, lineas: [{ productoCodigo: p.codigo, cantidad: 1, costoUnitario: 5, descuento: 0, ...linea }], encabezado: { ...base, ...enc } });
    const nulo = "00000000-0000-0000-0000-000000000000";
    assert.equal((await orden({ condicionPagoId: nulo })).ok, false);
    assert.equal((await orden({ transporteId: nulo })).ok, false);
    assert.equal((await orden({ centroCostoId: nulo })).ok, false);
    assert.equal((await orden({}, { arancelId: nulo })).ok, false);
    assert.equal((await orden({ descuentos: [101, 0, 0] })).ok, false);
    assert.equal((await orden({}, { descuento2: 120 })).ok, false);
    assert.equal((await orden({ moneda: "EUR" as never })).ok, false);
    assert.equal((await orden({})).ok, true);
  });

  it("orden en bolívares: el costo se convierte a USD con el valor de cambio, guarda el original y la recepción costea en USD", async () => {
    const prov = await crearProveedor(e.db);
    const p = await crearProducto(e);
    const r = await guardarOrden(e.db, e.actor, null, { proveedorId: prov.id, fecha: hoy(), fechaEsperada: null, observaciones: null, lineas: [{ productoCodigo: p.codigo, cantidad: 10, costoUnitario: 400, descuento: 0 }], encabezado: { ...base, moneda: "VES", valorCambio: 40 } });
    assert.ok(r.ok, JSON.stringify(r));
    const o = await e.db.ordenCompra.findUniqueOrThrow({ where: { id: r.id }, include: { lineas: true } });
    assert.equal(o.moneda, "VES");
    assert.equal(Number(o.valorCambio), 40);
    assert.equal(Number(o.lineas[0].costoUnitario), 10);
    assert.equal(Number(o.lineas[0].costoMoneda), 400);
    assert.ok((await emitirOrden(e.db, e.actor, r.id)).ok);
    const rec = await recibirOrden(e.db, e.actor, r.id, { almacenId: e.almacenId, documento: null, observaciones: null, lineas: [{ ordenLineaId: o.lineas[0].id, cantidad: 10 }] });
    assert.ok(rec.ok);
    assert.equal(Number((await e.db.producto.findUniqueOrThrow({ where: { codigo: p.codigo } })).costoPromedio), 10);
  });

  const factura = (proveedorId: string, extra: Record<string, unknown>) =>
    registrarFacturaCompra(e.db, e.actor, { proveedorId, ordenId: null, documento: unico("F"), numeroControl: null, fecha: hoy(), diasCredito: 0, subtotal: 0, iva: 0, observaciones: null, ...extra });

  it("tipo de documento: un pagaré es un documento por pagar sin IVA que se paga como cualquier factura", async () => {
    const prov = await crearProveedor(e.db);
    const f = await factura(prov.id, { tipoDocumento: "PAGARE", subtotal: 250 });
    assert.ok(f.ok, JSON.stringify(f));
    const d = await e.db.facturaCompra.findUniqueOrThrow({ where: { id: f.id } });
    assert.deepEqual([d.tipoDocumento, Number(d.total), Number(d.saldo)], ["PAGARE", 250, 250]);
    const normal = await factura(prov.id, { subtotal: 10 });
    assert.ok(normal.ok);
    assert.equal((await e.db.facturaCompra.findUniqueOrThrow({ where: { id: normal.id } })).tipoDocumento, "FACTURA");
  });

  it("documento con desglose por alícuota (exento + reducida + general): totales, libro y asiento coinciden", async () => {
    const prov = await crearProveedor(e.db);
    const f = await factura(prov.id, { desglose: [{ porcentaje: 0, base: 100, iva: 0 }, { porcentaje: 8, base: 200, iva: 16 }, { porcentaje: 16, base: 300, iva: 48 }] });
    assert.ok(f.ok, JSON.stringify(f));
    const d = await e.db.facturaCompra.findUniqueOrThrow({ where: { id: f.id }, include: { lineas: true } });
    assert.equal(Number(d.subtotal), 600);
    assert.equal(Number(d.iva), 64);
    assert.equal(Number(d.total), 664);
    assert.equal(d.lineas.length, 3);
    const libro = await reporteLibroCompras(e.db, { desde: hoy().toISOString().slice(0, 10), hasta: hoy().toISOString().slice(0, 10) });
    const fila = libro.filas.find((x) => x.numero === d.documento)!;
    assert.equal(Number(fila.exenta), 4000); // 100 USD × 40
    assert.equal(Number(fila["base_8"]), 8000);
    assert.equal(Number(fila["iva_8"]), 640);
    assert.equal(Number(fila["base_16"]), 12000);
    assert.equal(Number(fila["iva_16"]), 1920);
    assert.equal(Number(fila.total), 26560);
    assert.equal(await descuadreContable(e.db), 0);
  });

  it("valida el desglose: IVA que no corresponde, alícuota repetida, exento con IVA, vacío", async () => {
    const prov = await crearProveedor(e.db);
    assert.equal((await factura(prov.id, { desglose: [{ porcentaje: 16, base: 100, iva: 20 }] })).ok, false);
    assert.equal((await factura(prov.id, { desglose: [{ porcentaje: 16, base: 100, iva: 16 }, { porcentaje: 16, base: 50, iva: 8 }] })).ok, false);
    assert.equal((await factura(prov.id, { desglose: [{ porcentaje: 0, base: 100, iva: 5 }] })).ok, false);
    assert.equal((await factura(prov.id, { desglose: [] })).ok, false);
    assert.equal((await factura(prov.id, { desglose: [{ porcentaje: 16, base: 100, iva: 16.01 }] })).ok, true); // redondeo del proveedor
  });

  it("fechas: recepción no futura ni anterior a la emisión; la del libro manda sobre el período del libro", async () => {
    const prov = await crearProveedor(e.db);
    const emision = dia(-10);
    const usd = await e.db.moneda.findUniqueOrThrow({ where: { codigo: "USD" } });
    await e.db.tasaCambio.create({ data: { monedaId: usd.id, fecha: dia(-20), valor: 40 } }); // tasa vigente a la fecha de emisión
    assert.equal((await factura(prov.id, { fecha: emision, subtotal: 10, fechaRecepcion: dia(-11) })).ok, false);
    assert.equal((await factura(prov.id, { fecha: emision, subtotal: 10, fechaRecepcion: dia(3) })).ok, false);
    assert.equal((await factura(prov.id, { fecha: emision, subtotal: 10, fechaLibro: dia(-12) })).ok, false);
    const f = await factura(prov.id, { fecha: emision, subtotal: 10, fechaRecepcion: dia(-8), fechaLibro: dia(-2), recibidoPor: "Almacenista", planillaImportacion: "PL-1" });
    assert.ok(f.ok, JSON.stringify(f));
    const d = await e.db.facturaCompra.findUniqueOrThrow({ where: { id: f.id } });
    assert.equal(d.recibidoPor, "Almacenista");
    // En el libro del período de la fecha de emisión NO aparece; en el de la fecha del libro, sí.
    const enEmision = await reporteLibroCompras(e.db, { desde: emision.toISOString().slice(0, 10), hasta: emision.toISOString().slice(0, 10) });
    assert.equal(enEmision.filas.some((x) => x.numero === d.documento), false);
    const enLibro = await reporteLibroCompras(e.db, { desde: dia(-2).toISOString().slice(0, 10), hasta: dia(-2).toISOString().slice(0, 10) });
    assert.equal(enLibro.filas.some((x) => x.numero === d.documento), true);
  });

  it("cuenta contable del documento: la base va a ella (no al inventario) y debe poder recibir movimientos", async () => {
    const prov = await crearProveedor(e.db);
    const gasto = await e.db.cuentaContable.findFirstOrThrow({ where: { codigo: "6.1.01" } });
    const agrupadora = await e.db.cuentaContable.findFirstOrThrow({ where: { posteable: false } });
    assert.equal((await factura(prov.id, { subtotal: 50, cuentaGastoId: agrupadora.id })).ok, false);
    const f = await factura(prov.id, { subtotal: 50, iva: 8, cuentaGastoId: gasto.id });
    assert.ok(f.ok, JSON.stringify(f));
    const d = await e.db.facturaCompra.findUniqueOrThrow({ where: { id: f.id } });
    const a = await e.db.asiento.findFirstOrThrow({ where: { origen: "FACTURA_COMPRA", referencia: `FC-${String(d.numero).padStart(6, "0")}` }, include: { lineas: true } });
    assert.equal(Number(a.lineas.find((l) => l.cuentaId === gasto.id)!.debe), 2000);
  });

  it("condición, transporte y centro de costo del documento se validan", async () => {
    const prov = await crearProveedor(e.db);
    const nulo = "00000000-0000-0000-0000-000000000000";
    assert.equal((await factura(prov.id, { subtotal: 10, condicionPagoId: nulo })).ok, false);
    assert.equal((await factura(prov.id, { subtotal: 10, transporteId: nulo })).ok, false);
    assert.equal((await factura(prov.id, { subtotal: 10, centroCostoId: nulo })).ok, false);
    const cp = await e.db.condicionPago.create({ data: { codigo: unico("CP"), nombre: "15 días", dias: 15 } });
    const f = await factura(prov.id, { subtotal: 10, condicionPagoId: cp.id });
    assert.ok(f.ok);
  });

  it("el libro sigue cuadrado", async () => {
    assert.equal(await descuadreContable(e.db), 0);
  });
});
