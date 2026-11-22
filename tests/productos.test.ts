import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { registrarMovimiento } from "../src/lib/inventario/movimientos";
import { abrirEntorno, crearProducto, unico, type Entorno } from "./soporte/entorno";

describe("Productos: marca, método de costo, precios por lista y promociones", () => {
  let e: Entorno;
  before(async () => {
    e = await abrirEntorno();
  });
  const rechaza = (p: Promise<unknown>) => assert.rejects(p);
  const hoy = () => new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(new Date())}T00:00:00.000Z`);
  const dia = (n: number) => new Date(hoy().getTime() + n * 86_400_000);

  it("marca: código único y el producto la lleva; borrar la marca no borra el producto", async () => {
    const codigo = unico("M");
    const marca = await e.db.marca.create({ data: { codigo, nombre: "Stanley" } });
    await rechaza(e.db.marca.create({ data: { codigo, nombre: "Otra" } }));
    const p = await crearProducto(e);
    await e.db.producto.update({ where: { codigo: p.codigo }, data: { marcaId: marca.id, utilizacion: "Carpintería", contenido: 12.5, requiereMedida: true, descripcionEditable: true } });
    const leido = await e.db.producto.findUniqueOrThrow({ where: { codigo: p.codigo }, include: { marca: true } });
    assert.equal(leido.marca?.nombre, "Stanley");
    assert.equal(Number(leido.contenido), 12.5);
    await e.db.marca.delete({ where: { id: marca.id } });
    assert.equal((await e.db.producto.findUniqueOrThrow({ where: { codigo: p.codigo } })).marcaId, null);
  });

  it("método de costo: promedio pondera, último costo toma el de la última compra", async () => {
    const entrada = (codigo: string, cantidad: number, costo: number) => registrarMovimiento(e.db, e.actor, { tipo: "ENTRADA", almacenId: e.almacenId, productoCodigo: codigo, cantidad, costoUnitario: costo });
    const prom = await crearProducto(e);
    const ult = await crearProducto(e);
    await e.db.producto.update({ where: { codigo: ult.codigo }, data: { metodoCosto: "ULTIMO" } });
    for (const p of [prom, ult]) {
      assert.ok((await entrada(p.codigo, 10, 2)).ok);
      assert.ok((await entrada(p.codigo, 10, 4)).ok);
    }
    const costo = async (codigo: string) => Number((await e.db.producto.findUniqueOrThrow({ where: { codigo } })).costoPromedio);
    assert.equal(await costo(prom.codigo), 3);
    assert.equal(await costo(ult.codigo), 4);
  });

  it("método de costo inválido se rechaza", async () => {
    const p = await crearProducto(e);
    await rechaza(e.db.producto.update({ where: { codigo: p.codigo }, data: { metodoCosto: "FIFO" } }));
    await rechaza(e.db.producto.update({ where: { codigo: p.codigo }, data: { contenido: -1 } }));
  });

  it("precio por lista: uno por producto/presentación/lista, validaciones y presentación propia", async () => {
    const p = await crearProducto(e);
    const unidad = await e.db.unidadMedida.findFirstOrThrow();
    const pres = await e.db.productoPresentacion.create({ data: { productoCodigo: p.codigo, unidadMedidaId: unidad.id, nombre: "Caja x 12", cantidad: 12, visibleVentas: true, visibleCompras: false } });
    assert.equal(pres.visibleCompras, false);
    const nuevo = (extra = {}) => e.db.productoPrecio.create({ data: { productoCodigo: p.codigo, lista: "B", precioUsd: 9.5, utilidadPct: 30, descuentoMaxPct: 10, ...extra } });
    await nuevo();
    await rechaza(nuevo()); // mismo producto, base, lista B
    await nuevo({ presentacionId: pres.id }); // otra presentación sí
    await rechaza(nuevo({ presentacionId: pres.id }));
    await nuevo({ lista: "C", venceEn: dia(30) });
    for (const mal of [{ lista: "b" }, { lista: "AB" }, { precioUsd: -1 }, { descuentoPct: 101 }, { utilidadPct: -5 }]) await rechaza(nuevo({ ...mal, lista: (mal as { lista?: string }).lista ?? "D" }));
  });

  it("promoción: vigencia coherente y al menos un beneficio", async () => {
    const p = await crearProducto(e);
    const base = { productoCodigo: p.codigo, desde: dia(0), hasta: dia(10) };
    await e.db.promocion.create({ data: { ...base, precioUsd: 7.5 } });
    await e.db.promocion.create({ data: { ...base, descuentoPct: 15, lista: "A" } });
    await e.db.promocion.create({ data: { ...base, cantidadRequerida: 10, cantidadOtorgada: 1, multiplo: 10 } });
    await rechaza(e.db.promocion.create({ data: { ...base, hasta: dia(-1) } })); // hasta antes de desde
    await rechaza(e.db.promocion.create({ data: { ...base } })); // sin beneficio
    await rechaza(e.db.promocion.create({ data: { ...base, descuentoPct: 120 } }));
    await rechaza(e.db.promocion.create({ data: { ...base, precioUsd: 5, lista: "xx" } }));
    await rechaza(e.db.promocion.create({ data: { ...base, precioUsd: 5, cantidadRequerida: -1 } }));
  });

  it("no se borra una presentación en uso por error: sus precios y promociones se van con ella", async () => {
    const p = await crearProducto(e);
    const unidad = await e.db.unidadMedida.findFirstOrThrow();
    const pres = await e.db.productoPresentacion.create({ data: { productoCodigo: p.codigo, unidadMedidaId: unidad.id, cantidad: 1 } });
    await e.db.productoPrecio.create({ data: { productoCodigo: p.codigo, presentacionId: pres.id, lista: "A", precioUsd: 5 } });
    await e.db.promocion.create({ data: { productoCodigo: p.codigo, presentacionId: pres.id, precioUsd: 4, desde: dia(0), hasta: dia(3) } });
    await e.db.productoPresentacion.delete({ where: { id: pres.id } });
    assert.equal(await e.db.productoPrecio.count({ where: { productoCodigo: p.codigo } }), 0);
    assert.equal(await e.db.promocion.count({ where: { productoCodigo: p.codigo } }), 0);
  });
});
