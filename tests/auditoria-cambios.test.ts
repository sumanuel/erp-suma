import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { soloCambios } from "../src/lib/auditoria";
import { abrirEntorno, crearCliente, type Entorno } from "./soporte/entorno";

describe("Auditoría: solo lo que cambió", () => {
  let e: Entorno;
  before(async () => { e = await abrirEntorno(); });

  it("un decimal de la base y el mismo número del formulario no son un cambio", async () => {
    // Con un registro leído de la base, como al guardar una ficha.
    const antes = await e.db.cliente.findUniqueOrThrow({ where: { id: (await crearCliente(e.db)).id } });
    const iguales = { limiteCredito: 0, descuento1: 0, descuento2: 0, descuento3: 0, comisionVentaPct: 0, comisionCobroPct: 0, razonSocial: antes.razonSocial };
    assert.deepEqual(soloCambios(antes, { ...antes, ...iguales }), { antes: {}, despues: {} });
    const cambio = soloCambios(antes, { ...antes, ...iguales, limiteCredito: 150.5, razonSocial: "Otro nombre" });
    assert.deepEqual(Object.keys(cambio.despues).sort(), ["limiteCredito", "razonSocial"]);
    assert.deepEqual([String(cambio.antes.limiteCredito), cambio.despues.limiteCredito], ["0", 150.5]);
  });

  it("compara con toda la precisión y no confunde vacío con cero ni textos parecidos", async () => {
    const c = await e.db.cliente.update({ where: { id: (await crearCliente(e.db)).id }, data: { limiteCredito: 12.5 } });
    const cambia = (campo: string, valor: unknown, previo: Record<string, unknown> = c) => Object.keys(soloCambios(previo, { ...previo, [campo]: valor }).despues).length === 1;
    assert.equal(cambia("limiteCredito", 12.5), false);
    assert.equal(cambia("limiteCredito", "12.50"), false);
    assert.equal(cambia("limiteCredito", 12.5001), true);
    assert.equal(cambia("limiteCredito", null), true);
    assert.equal(cambia("limiteCredito", ""), true);
    // En un campo de texto, «007» y «7» sí son distintos, y vacío no es cero.
    assert.equal(cambia("codigo", "7", { codigo: "007" }), true);
    assert.equal(cambia("telefono", 0, { telefono: null }), true);
  });
});
