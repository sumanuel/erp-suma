import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { emitirFactura } from "../src/lib/facturacion/servicio";
import { reporteVentas } from "../src/lib/reportes/ventas";
import { abrirEntorno, automatica, crearCliente, crearProducto, fijarTasa, hoy, unico, type Entorno } from "./soporte/entorno";

describe("Reporte de ventas por vendedor", () => {
  let e: Entorno;
  before(async () => {
    e = await abrirEntorno();
    await fijarTasa(e.db, 40);
    await automatica(e.db, true);
  });
  after(async () => {
    await automatica(e.db, false);
  });

  it("agrupa las facturas emitidas por el vendedor del documento y las sin vendedor aparte", async () => {
    const cli = await crearCliente(e.db);
    const p = await crearProducto(e, { existencia: 100, precio: 10, exento: true });
    const v1 = await e.db.vendedor.create({ data: { codigo: unico("V"), nombre: "Vendedora Uno", esVendedor: true } });
    const v2 = await e.db.vendedor.create({ data: { codigo: unico("V"), nombre: "Vendedor Dos", esVendedor: true } });
    const f = (vendedorId: string | null, cantidad: number) => emitirFactura(e.db, e.actor, { clienteId: cli.id, almacenId: e.almacenId, observaciones: null, diasCredito: 0, encabezado: { vendedorId, condicionPagoId: null, transporteId: null, direccionEntrega: null, descuentos: [0, 0, 0] }, lineas: [{ productoCodigo: p.codigo, cantidad, precioUnitario: 10, descuento: 0 }] });
    assert.ok((await f(v1.id, 3)).ok);
    assert.ok((await f(v1.id, 2)).ok);
    assert.ok((await f(v2.id, 1)).ok);
    assert.ok((await f(null, 4)).ok);
    const d = hoy().toISOString().slice(0, 10);
    const r = await reporteVentas(e.db, { desde: d, hasta: d, agrupar: "vendedor" });
    const fila = (n: string) => r.filas.find((x) => String(x.grupo).includes(n));
    assert.equal(fila("Vendedora Uno")?.facturas, 2);
    assert.equal(fila("Vendedora Uno")?.ventas, 50);
    assert.equal(fila("Vendedor Dos")?.ventas, 10);
    assert.ok(r.filas.some((x) => x.grupo === "Sin vendedor"));
  });
});
