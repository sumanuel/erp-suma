import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CampoForm } from "../src/lib/formularios";
import { bloquesDe, resumenBloque } from "../src/lib/secciones-ficha";

const campo = (nombre: string, extra: Partial<CampoForm> = {}): CampoForm => ({ nombre, etiqueta: nombre, tipo: "texto", ...extra }) as CampoForm;
const forma = (c: CampoForm[]) => bloquesDe(c).map((b) => [b.titulo, b.campos.map((x) => x.nombre)]);

describe("Secciones de las fichas", () => {
  it("un título nuevo abre sección; los campos sin título siguen en la que está abierta", () => {
    assert.deepEqual(forma([campo("a", { seccion: "Identificación" }), campo("b"), campo("c", { seccion: "Contacto" }), campo("d", { seccion: "Contacto" }), campo("e")]), [["Identificación", ["a", "b"]], ["Contacto", ["c", "d", "e"]]]);
    // Sin título al principio, esos campos son la parte básica y el primer título ya se puede cerrar.
    assert.deepEqual(forma([campo("a"), campo("b", { seccion: "Pronto pago" })]), [[null, ["a"]], ["Pronto pago", ["b"]]]);
    assert.deepEqual(forma([campo("a")]), [[null, ["a"]]]);
  });

  it("el resumen cuenta lo escrito y los obligatorios vacíos", () => {
    const c = [campo("texto"), campo("cero"), campo("marca", { tipo: "booleano" }), campo("obligatorio", { requerido: true })];
    assert.deepEqual(resumenBloque(c, { texto: "x", cero: "0", marca: false, obligatorio: "" }), { conDatos: 1, faltan: 1 });
    assert.deepEqual(resumenBloque(c, { marca: true, obligatorio: "y" }), { conDatos: 2, faltan: 0 });
  });
});
