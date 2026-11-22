import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { abrirEntorno, unico, type Entorno } from "./soporte/entorno";
import { aplicarCambio, calcularCambio } from "../src/lib/productos/precios-masivos";
import { relacionesProducto } from "../src/lib/maestros/productos";

describe("Productos: cambio masivo de precios y relaciones", () => {
  let e: Entorno;
  let categoriaId: string;
  let ivaId: string;
  before(async () => {
    e = await abrirEntorno();
    categoriaId = (await e.db.categoria.create({ data: { codigo: unico("CM"), nombre: "Masivo" } })).id;
    ivaId = (await e.db.alicuotaIva.create({ data: { nombre: unico("IVA") } })).id;
  });
  const crear = (extra: Record<string, unknown> = {}) =>
    e.db.producto.create({ data: { codigo: unico("PM"), descripcion: "Producto masivo", categoriaId, alicuotaIvaId: ivaId, ...extra } });
  const rechaza = (p: Promise<unknown>) => assert.rejects(p);

  it("porcentaje: sube el precio de lista A y también el del producto", async () => {
    const marca = await e.db.marca.create({ data: { codigo: unico("MK"), nombre: "Marca" } });
    const a = await crear({ marcaId: marca.id, precioLista: 10, costoPromedio: 5 });
    const b = await crear({ marcaId: marca.id, precioLista: 20 });
    const r = await aplicarCambio(e.db, e.actor, { marcaId: marca.id }, { lista: "A", modo: "PORCENTAJE", valor: 10, decimales: 2 });
    assert.deepEqual({ ok: r.ok, n: r.ok ? r.cambiados : -1 }, { ok: true, n: 2 });
    assert.equal(Number((await e.db.producto.findUnique({ where: { codigo: a.codigo } }))!.precioLista), 11);
    assert.equal(Number((await e.db.producto.findUnique({ where: { codigo: b.codigo } }))!.precioLista), 22);
    const fila = await e.db.productoPrecio.findFirst({ where: { productoCodigo: a.codigo, lista: "A", presentacionId: null } });
    assert.equal(Number(fila!.precioUsd), 11);
    assert.equal(Number(fila!.utilidadPct), 120);
    // Queda en la auditoría.
    assert.ok(await e.db.auditoriaCambio.findFirst({ where: { entidad: "cambio_precios" } }));
  });

  it("otra lista: no toca el precio de lista del producto y parte del precio de la lista A", async () => {
    const marca = await e.db.marca.create({ data: { codigo: unico("MK"), nombre: "Marca B" } });
    const p = await crear({ marcaId: marca.id, precioLista: 50 });
    await aplicarCambio(e.db, e.actor, { marcaId: marca.id }, { lista: "B", modo: "MONTO", valor: -5, decimales: 2 });
    assert.equal(Number((await e.db.producto.findUnique({ where: { codigo: p.codigo } }))!.precioLista), 50);
    assert.equal(Number((await e.db.productoPrecio.findFirst({ where: { productoCodigo: p.codigo, lista: "B" } }))!.precioUsd), 45);
  });

  it("margen sobre costo: omite sin costo, respeta el precio máximo y redondea", async () => {
    const marca = await e.db.marca.create({ data: { codigo: unico("MK"), nombre: "Marca C" } });
    const conCosto = await crear({ marcaId: marca.id, costoPromedio: 3.333, precioLista: 1 });
    const sinCosto = await crear({ marcaId: marca.id, precioLista: 1 });
    const regulado = await crear({ marcaId: marca.id, costoPromedio: 10, precioMaximoPublico: 12, precioLista: 1 });
    const c = await calcularCambio(e.db, { marcaId: marca.id }, { lista: "A", modo: "MARGEN_COSTO", valor: 50, decimales: 2 });
    assert.equal(c.omitidos.sinCosto, 1);
    assert.equal(c.filas.find((f) => f.codigo === conCosto.codigo)!.nuevo, 5);
    const r = c.filas.find((f) => f.codigo === regulado.codigo)!;
    assert.deepEqual({ nuevo: r.nuevo, limitado: r.limitado }, { nuevo: 12, limitado: true });
    assert.ok(!c.filas.some((f) => f.codigo === sinCosto.codigo));
  });

  it("no deja precios negativos ni reglas inválidas, y la vista previa no guarda nada", async () => {
    const marca = await e.db.marca.create({ data: { codigo: unico("MK"), nombre: "Marca D" } });
    const p = await crear({ marcaId: marca.id, precioLista: 3 });
    const c = await calcularCambio(e.db, { marcaId: marca.id }, { lista: "A", modo: "MONTO", valor: -10, decimales: 2 });
    assert.equal(c.omitidos.negativos, 1);
    await calcularCambio(e.db, { marcaId: marca.id }, { lista: "A", modo: "PORCENTAJE", valor: 50, decimales: 2 });
    assert.equal(Number((await e.db.producto.findUnique({ where: { codigo: p.codigo } }))!.precioLista), 3);
    for (const regla of [{ lista: "Z", modo: "PORCENTAJE", valor: 1, decimales: 2 }, { lista: "A", modo: "PORCENTAJE", valor: -100, decimales: 2 }, { lista: "A", modo: "PORCENTAJE", valor: 1, decimales: 9 }] as const) {
      const r = await aplicarCambio(e.db, e.actor, { marcaId: marca.id }, { ...regla });
      assert.equal(r.ok, false);
    }
  });

  it("relaciones: la base rechaza consigo mismo, tipo inválido y duplicados; el borrado en cascada", async () => {
    const a = await crear();
    const b = await crear();
    await rechaza(e.db.productoRelacion.create({ data: { productoCodigo: a.codigo, relacionadoCodigo: a.codigo, tipo: "SUSTITUTO" } }));
    await rechaza(e.db.productoRelacion.create({ data: { productoCodigo: a.codigo, relacionadoCodigo: b.codigo, tipo: "OTRO" } }));
    await rechaza(e.db.productoRelacion.create({ data: { productoCodigo: a.codigo, relacionadoCodigo: b.codigo, tipo: "COMPONENTE", cantidad: 0 } }));
    await e.db.productoRelacion.create({ data: { productoCodigo: a.codigo, relacionadoCodigo: b.codigo, tipo: "COMPONENTE", cantidad: 2 } });
    await rechaza(e.db.productoRelacion.create({ data: { productoCodigo: a.codigo, relacionadoCodigo: b.codigo, tipo: "COMPONENTE" } }));
    // El componente no se puede borrar mientras forme parte de un kit; el kit sí, con sus relaciones.
    await rechaza(e.db.producto.delete({ where: { codigo: b.codigo } }));
    await e.db.producto.delete({ where: { codigo: a.codigo } });
    assert.equal(await e.db.productoRelacion.count({ where: { productoCodigo: a.codigo } }), 0);
  });

  it("relaciones: un kit no puede contenerse a sí mismo, ni por un camino indirecto", async () => {
    const [a, b, c] = [await crear(), await crear(), await crear()];
    await e.db.productoRelacion.create({ data: { productoCodigo: a.codigo, relacionadoCodigo: b.codigo, tipo: "COMPONENTE" } });
    await e.db.productoRelacion.create({ data: { productoCodigo: b.codigo, relacionadoCodigo: c.codigo, tipo: "COMPONENTE" } });
    const ciclo = await relacionesProducto.validar!(e.db, { productoCodigo: c.codigo, relacionadoCodigo: a.codigo, tipo: "COMPONENTE", cantidad: 1 }, false);
    assert.ok(ciclo?.relacionadoCodigo);
    const sustituto = await relacionesProducto.validar!(e.db, { productoCodigo: c.codigo, relacionadoCodigo: a.codigo, tipo: "SUSTITUTO", cantidad: 1 }, false);
    assert.equal(sustituto, null);
    const noExiste = await relacionesProducto.validar!(e.db, { productoCodigo: c.codigo, relacionadoCodigo: "NOEXISTE", tipo: "SUSTITUTO", cantidad: 1 }, false);
    assert.ok(noExiste?.relacionadoCodigo);
  });
});
