import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { registrarFacturaCompra, registrarPago } from "../src/lib/cxp/servicio";
import { agregarChequera, cambiarActivaChequera, eliminarChequera } from "../src/lib/tesoreria/chequeras";
import { crearCuenta, editarCuenta, registrarMovimientoManual } from "../src/lib/tesoreria/movimientos";
import { abrirEntorno, automatica, crearProveedor, descuadreContable, fijarTasa, hoy, unico, type Entorno } from "./soporte/entorno";

describe("Cuentas bancarias, chequeras, ITF y pagos con cheque", () => {
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
  const contable = async () => (await e.db.cuentaContable.findFirstOrThrow({ where: { codigo: "1.1.01" } })).id;
  const capital = async () => (await e.db.cuentaContable.findFirstOrThrow({ where: { codigo: "3.1.01" } })).id;

  async function banco(extra: Record<string, unknown> = {}, saldo = 0) {
    const catalogo = await e.db.banco.create({ data: { codigo: unico("B"), nombre: "Banco de prueba" } });
    const r = await crearCuenta(e.db, e.actor, {
      codigo: unico("BCO"), nombre: "Cuenta corriente", tipo: "BANCO", moneda: "VES", banco: null, numeroCuenta: "01020000000000000000", saldoInicial: saldo, permiteSobregiro: false, activo: true,
      cuentaContableId: await contable(), contrapartidaId: saldo > 0 ? await capital() : null, bancoId: catalogo.id, titular: "Suma C.A.", sucursal: "Chacao", tipoCuentaBancaria: "CORRIENTE", ...extra,
    });
    assert.ok(r.ok, JSON.stringify(r));
    return { id: r.id, catalogoId: catalogo.id };
  }
  const saldo = async (id: string) => Number((await e.db.cuentaTesoreria.findUniqueOrThrow({ where: { id } })).saldo);
  async function factura(proveedorId: string, subtotal: number) {
    const f = await registrarFacturaCompra(e.db, e.actor, { proveedorId, ordenId: null, documento: unico("F"), numeroControl: null, fecha: hoy(), diasCredito: 0, subtotal, iva: 0, observaciones: null });
    assert.ok(f.ok);
    return f.id;
  }
  const pagar = (proveedorId: string, cuentaId: string, facturaId: string, montoUsd: number, extra: Record<string, unknown> = {}) =>
    registrarPago(e.db, e.actor, { proveedorId, formaPago: "TRANSFERENCIA", moneda: "VES", cuentaId, referencia: null, observaciones: null, aplicaciones: [{ facturaId, montoUsd }], ...extra });

  it("la cuenta guarda banco del catálogo, titular, sucursal y tipo; el texto del banco se llena solo", async () => {
    const { id, catalogoId } = await banco();
    const c = await e.db.cuentaTesoreria.findUniqueOrThrow({ where: { id } });
    assert.equal(c.bancoId, catalogoId);
    assert.equal(c.banco, "Banco de prueba");
    assert.equal(c.titular, "Suma C.A.");
    assert.equal(c.tipoCuentaBancaria, "CORRIENTE");
    assert.equal(c.aceptaDepositos && c.aceptaPagos, true);
    const ed = await editarCuenta(e.db, e.actor, id, { nombre: "Cuenta de ahorro", banco: null, numeroCuenta: null, permiteSobregiro: false, activo: true, cuentaContableId: c.cuentaContableId, tipoCuentaBancaria: "AHORRO", titular: "Otro titular", itfPorcentaje: 0.3 });
    assert.ok(ed.ok);
    assert.equal((await e.db.cuentaTesoreria.findUniqueOrThrow({ where: { id } })).tipoCuentaBancaria, "AHORRO");
  });

  it("rechaza ITF fuera de rango, período invertido, tipo de cuenta o banco inválidos", async () => {
    const base = { codigo: unico("X"), nombre: "X", tipo: "BANCO", moneda: "VES", banco: null, numeroCuenta: null, saldoInicial: 0, permiteSobregiro: false, activo: true };
    assert.equal((await crearCuenta(e.db, e.actor, { ...base, itfPorcentaje: 101 })).ok, false);
    assert.equal((await crearCuenta(e.db, e.actor, { ...base, codigo: unico("X"), itfPorcentaje: 0.3, itfDesde: dia(5), itfHasta: dia(1) })).ok, false);
    assert.equal((await crearCuenta(e.db, e.actor, { ...base, codigo: unico("X"), tipoCuentaBancaria: "VIRTUAL" })).ok, false);
    assert.equal((await crearCuenta(e.db, e.actor, { ...base, codigo: unico("X"), bancoId: "00000000-0000-0000-0000-000000000000" })).ok, false);
  });

  it("una cuenta que no acepta depósitos o pagos los rechaza", async () => {
    const sinDep = await banco({ aceptaDepositos: false });
    const sinPago = await banco({ aceptaPagos: false }, 1000);
    const ing = await registrarMovimientoManual(e.db, e.actor, { cuentaId: sinDep.id, tipo: "INGRESO", monto: 10, descripcion: "Depósito", documento: null, contrapartidaId: await capital() });
    assert.equal(ing.ok, false);
    const prov = await crearProveedor(e.db);
    const r = await pagar(prov.id, sinPago.id, await factura(prov.id, 10), 10);
    assert.equal(r.ok, false);
    assert.equal(await saldo(sinPago.id), 1000);
  });

  it("ITF: se carga sobre pagos y egresos dentro de su vigencia, con su asiento", async () => {
    const { id } = await banco({ itfPorcentaje: 0.3, itfDesde: dia(-1), itfHasta: dia(1) }, 10_000);
    const prov = await crearProveedor(e.db);
    const r = await pagar(prov.id, id, await factura(prov.id, 100), 100); // 4.000 Bs.
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(await saldo(id), 10_000 - 4000 - 12);
    const egreso = await registrarMovimientoManual(e.db, e.actor, { cuentaId: id, tipo: "EGRESO", monto: 1000, descripcion: "Gasto", documento: null, contrapartidaId: await capital() });
    assert.ok(egreso.ok);
    assert.equal(await saldo(id), 10_000 - 4000 - 12 - 1000 - 3);
    const itf = await e.db.movimientoTesoreria.findMany({ where: { cuentaId: id, tipo: "IMPUESTO_ITF" } });
    assert.deepEqual(itf.map((m) => Number(m.monto)).sort((a, b) => a - b), [-12, -3]);
    assert.equal(await descuadreContable(e.db), 0);
    const gasto = await e.db.$queryRawUnsafe<{ d: string }[]>("SELECT COALESCE(SUM(l.debe),0)::text AS d FROM asiento_linea l JOIN cuenta_contable c ON c.id = l.cuenta_id WHERE c.codigo = '6.1.03'");
    assert.ok(Number(gasto[0].d) >= 15);
  });

  it("ITF fuera de su vigencia no se carga; sin saldo para el ITF se deshace todo el pago", async () => {
    const vencido = await banco({ itfPorcentaje: 0.3, itfDesde: dia(-10), itfHasta: dia(-5) }, 5000);
    const prov = await crearProveedor(e.db);
    assert.ok((await pagar(prov.id, vencido.id, await factura(prov.id, 100), 100)).ok);
    assert.equal(await saldo(vencido.id), 1000);
    const justa = await banco({ itfPorcentaje: 0.3 }, 4000); // alcanza para el pago, no para el ITF
    const f = await factura(prov.id, 100);
    const r = await pagar(prov.id, justa.id, f, 100);
    assert.equal(r.ok, false);
    assert.equal(await saldo(justa.id), 4000);
    assert.equal(Number((await e.db.facturaCompra.findUniqueOrThrow({ where: { id: f } })).saldo), 100);
  });

  it("chequeras: rango válido, sin cruces, una sola activa, no se borra una usada", async () => {
    const { id } = await banco();
    const c1 = await agregarChequera(e.db, e.actor, { cuentaId: id, desde: 1001, hasta: 1100, ultimoCheque: null, activa: true });
    assert.ok(c1.ok);
    assert.equal((await agregarChequera(e.db, e.actor, { cuentaId: id, desde: 1090, hasta: 1200, ultimoCheque: null, activa: false })).ok, false); // cruce
    assert.equal((await agregarChequera(e.db, e.actor, { cuentaId: id, desde: 50, hasta: 10, ultimoCheque: null, activa: false })).ok, false);
    assert.equal((await agregarChequera(e.db, e.actor, { cuentaId: id, desde: 2001, hasta: 2100, ultimoCheque: 3000, activa: false })).ok, false);
    assert.equal((await agregarChequera(e.db, e.actor, { cuentaId: id, desde: 2001, hasta: 2100, ultimoCheque: null, activa: true })).ok, false); // otra activa
    const c2 = await agregarChequera(e.db, e.actor, { cuentaId: id, desde: 2001, hasta: 2100, ultimoCheque: null, activa: false });
    assert.ok(c2.ok);
    assert.ok((await cambiarActivaChequera(e.db, e.actor, c2.id, true)).ok); // pasa la activa a la otra
    assert.equal((await e.db.chequera.findUniqueOrThrow({ where: { id: c1.id } })).activa, false);
    assert.equal((await e.db.chequera.count({ where: { cuentaId: id, activa: true } })), 1);
    assert.ok((await eliminarChequera(e.db, e.actor, c1.id)).ok);
    const caja = await e.db.cuentaTesoreria.create({ data: { codigo: unico("CJ"), nombre: "Caja", tipo: "CAJA", moneda: "VES" } });
    assert.equal((await agregarChequera(e.db, e.actor, { cuentaId: caja.id, desde: 1, hasta: 10, ultimoCheque: null, activa: false })).ok, false); // una caja no tiene chequera
  });

  it("pago con cheque: toma el siguiente número, a nombre del proveedor (o del portador indicado) y con comprobante", async () => {
    const { id } = await banco({}, 10_000);
    const ch = await agregarChequera(e.db, e.actor, { cuentaId: id, desde: 501, hasta: 600, ultimoCheque: 510, activa: true });
    assert.ok(ch.ok);
    const prov = await crearProveedor(e.db);
    const r1 = await pagar(prov.id, id, await factura(prov.id, 10), 10, { formaPago: "CHEQUE", comprobante: "EGR-0001" });
    assert.ok(r1.ok, JSON.stringify(r1));
    const p1 = await e.db.pagoProveedor.findUniqueOrThrow({ where: { id: r1.id } });
    assert.equal(p1.numeroCheque, 511);
    assert.equal(p1.portador, "Proveedor de prueba");
    assert.equal(p1.comprobante, "EGR-0001");
    const r2 = await pagar(prov.id, id, await factura(prov.id, 10), 10, { formaPago: "CHEQUE", portador: "Juan Pérez" });
    assert.ok(r2.ok);
    assert.equal((await e.db.pagoProveedor.findUniqueOrThrow({ where: { id: r2.id } })).numeroCheque, 512);
    assert.equal((await e.db.pagoProveedor.findUniqueOrThrow({ where: { id: r2.id } })).portador, "Juan Pérez");
    assert.equal((await e.db.chequera.findUniqueOrThrow({ where: { id: ch.id } })).ultimoCheque, 512);
  });

  it("sin chequera activa (o agotada) el pago con cheque se rechaza y no queda nada", async () => {
    const { id } = await banco({}, 1000);
    const prov = await crearProveedor(e.db);
    const f = await factura(prov.id, 10);
    assert.equal((await pagar(prov.id, id, f, 10, { formaPago: "CHEQUE" })).ok, false);
    await agregarChequera(e.db, e.actor, { cuentaId: id, desde: 1, hasta: 5, ultimoCheque: 5, activa: false }); // agotada
    assert.equal((await cambiarActivaChequera(e.db, e.actor, (await e.db.chequera.findFirstOrThrow({ where: { cuentaId: id } })).id, true)).ok, false);
    assert.equal(await saldo(id), 1000);
    assert.equal(Number((await e.db.facturaCompra.findUniqueOrThrow({ where: { id: f } })).saldo), 10);
  });

  it("concurrencia: 6 pagos con cheque sobre una chequera de 3 → solo 3, con números distintos y consecutivos", async () => {
    const { id } = await banco({}, 10_000);
    await agregarChequera(e.db, e.actor, { cuentaId: id, desde: 9001, hasta: 9003, ultimoCheque: null, activa: true });
    const prov = await crearProveedor(e.db);
    const facturas = await Promise.all(Array.from({ length: 6 }, () => factura(prov.id, 5)));
    const rs = await Promise.all(facturas.map((f) => pagar(prov.id, id, f, 5, { formaPago: "CHEQUE" })));
    assert.equal(rs.filter((r) => r.ok).length, 3);
    const nums = (await e.db.pagoProveedor.findMany({ where: { cuentaId: id, formaPago: "CHEQUE" }, select: { numeroCheque: true } })).map((p) => p.numeroCheque).sort();
    assert.deepEqual(nums, [9001, 9002, 9003]);
  });

  it("el libro sigue cuadrado", async () => {
    assert.equal(await descuadreContable(e.db), 0);
  });
});
