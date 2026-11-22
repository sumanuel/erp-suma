import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { emitirFactura } from "../src/lib/facturacion/servicio";
import { abrirEntorno, automatica, crearCliente, crearProducto, descuadreContable, fijarTasa, unico, type Entorno } from "./soporte/entorno";

describe("Cuentas contables propias del cliente y del almacén al asentar", () => {
  let e: Entorno;
  before(async () => { e = await abrirEntorno(); await fijarTasa(e.db, 40); await automatica(e.db, true); });
  after(async () => { await automatica(e.db, false); });

  it("la factura usa la cuenta por cobrar del cliente y la de inventario del almacén cuando las tienen", async () => {
    const mayor = await e.db.cuentaContable.findUniqueOrThrow({ where: { codigo: "1.1.02" } });
    const cxcCli = await e.db.cuentaContable.create({ data: { codigo: unico("1.1.02.9").slice(0, 20).replace(/[^0-9.]/g, "") + "1", nombre: "CxC cliente propio", tipo: "ACTIVO", padreId: mayor.id, nivel: 4, posteable: true } });
    const almacen = await e.db.almacen.create({ data: { codigo: unico("AL"), nombre: "Con cuenta propia" } });
    const invAlm = await e.db.cuentaContable.create({ data: { codigo: "1.1.03" + "." + String(Math.floor(Math.random() * 9e5) + 1e5), nombre: "Inventario del almacén", tipo: "ACTIVO", padreId: (await e.db.cuentaContable.findUniqueOrThrow({ where: { codigo: "1.1.03" } })).id, nivel: 4, posteable: true } });
    await e.db.almacen.update({ where: { id: almacen.id }, data: { cuentaInventarioId: invAlm.id } });
    const cli = await crearCliente(e.db);
    await e.db.cliente.update({ where: { id: cli.id }, data: { cuentaContableId: cxcCli.id } });
    const p = await crearProducto(e, { existencia: 5, precio: 10, costo: 4, exento: true });
    const { registrarMovimiento } = await import("../src/lib/inventario/movimientos");
    assert.ok((await registrarMovimiento(e.db, e.actor, { tipo: "ENTRADA", almacenId: almacen.id, productoCodigo: p.codigo, cantidad: 5, costoUnitario: 4 })).ok);
    const f = await emitirFactura(e.db, e.actor, { clienteId: cli.id, almacenId: almacen.id, observaciones: null, diasCredito: 0, lineas: [{ productoCodigo: p.codigo, cantidad: 2, precioUnitario: 10, descuento: 0 }] });
    assert.ok(f.ok, f.ok ? "" : f.error);
    const fac = await e.db.factura.findUniqueOrThrow({ where: { id: f.id } });
    const a = await e.db.asiento.findFirstOrThrow({ where: { origen: "FACTURA", referencia: `FAC-${String(fac.numero).padStart(6, "0")}` }, include: { lineas: true } });
    assert.ok(a.lineas.some((l) => l.cuentaId === cxcCli.id && Number(l.debe) > 0));
    assert.ok(a.lineas.some((l) => l.cuentaId === invAlm.id && Number(l.haber) > 0));
    assert.equal(await descuadreContable(e.db), 0);
  });
});
