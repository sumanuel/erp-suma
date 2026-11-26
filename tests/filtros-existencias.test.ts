import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { existencias, movimientos } from "../src/lib/maestros/existencias";
import { abrirEntorno, crearProducto, type Entorno } from "./soporte/entorno";

describe("Filtros de existencias y movimientos", () => {
  let e: Entorno;
  before(async () => { e = await abrirEntorno(); });

  const donde = async (m: typeof existencias, filtro: string, valor: string) => {
    const f = (await m.filtrosDe!(e.db)).find((x) => x.id === filtro)!;
    return f.opciones.find((o) => o.valor === valor)?.donde as object;
  };
  const codigos = async (condiciones: object[], entre: string[]) =>
    (await e.db.existencia.findMany({ where: { AND: [...condiciones, { productoCodigo: { in: entre } }] }, select: { productoCodigo: true } })).map((x) => x.productoCodigo).sort();

  it("«Bajo mínimo» trae solo lo que está por debajo; sin nada bajo mínimo no trae nada", async () => {
    const poco = await crearProducto(e, { existencia: 3 });
    const mucho = await crearProducto(e, { existencia: 30 });
    const entre = [poco.codigo, mucho.codigo];
    await e.db.producto.updateMany({ data: { existenciaMinima: 0 } });
    assert.deepEqual(await codigos([await donde(existencias, "saldo", "bajo")], entre), []);
    await e.db.producto.updateMany({ where: { codigo: { in: entre } }, data: { existenciaMinima: 10 } });
    assert.deepEqual(await codigos([await donde(existencias, "saldo", "bajo")], entre), [poco.codigo]);
    // Se combina con el almacén.
    assert.deepEqual(await codigos([await donde(existencias, "saldo", "bajo"), await donde(existencias, "almacen", e.almacenId)], entre), [poco.codigo]);
    assert.deepEqual(await codigos([await donde(existencias, "categoria", poco.categoriaId)], entre), entre.sort());
  });

  it("los movimientos se filtran por almacén y por quien los hizo", async () => {
    const p = await crearProducto(e, { existencia: 5 });
    const contar = async (condicion: object) => e.db.movimientoInventario.count({ where: { AND: [condicion, { productoCodigo: p.codigo }] } });
    assert.equal(await contar(await donde(movimientos, "almacen", e.almacenId)), 1);
    assert.equal(await contar(await donde(movimientos, "usuario", e.actor.nombre)), 1);
  });
});
