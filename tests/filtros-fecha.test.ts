import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { entreDiasCaracas, diaDeCaracas, rangoDeFechas } from "../src/lib/filtros-fecha";

const f = (s: string) => new Date(`${s}T00:00:00.000Z`);
const ahora = f("2026-11-25");
const limites = (min: string | null, max: string | null) => ({ _min: { fecha: min ? f(min) : null }, _max: { fecha: max ? f(max) : null } });
const ver = (r: ReturnType<typeof rangoDeFechas>) => [r.desde, r.hasta, r.restringe];

describe("Rango de fechas de los filtros", () => {
  it("los calendarios nunca quedan vacíos y «todas» no deja nada fuera", () => {
    assert.deepEqual(ver(rangoDeFechas({}, "todas", limites("2025-03-10", "2026-11-20"), ahora)), ["2025-03-10", "2026-11-25", false]);
    assert.deepEqual(ver(rangoDeFechas({}, "todas", limites(null, null), ahora)), ["2026-11-25", "2026-11-25", false]);
    // Con un documento de fecha futura, el rango llega hasta él.
    assert.deepEqual(ver(rangoDeFechas({}, "todas", limites("2026-11-01", "2026-12-24"), ahora)), ["2026-11-01", "2026-12-24", false]);
    assert.deepEqual(ver(rangoDeFechas({ desde: "", hasta: "" }, "mes", limites("2025-03-10", "2026-11-20"), ahora)), ["2025-03-10", "2026-11-25", false]);
    assert.deepEqual(ver(rangoDeFechas({ desde: "no-es", hasta: "2026-02-31" }, "todas", limites("2025-03-10", null), ahora)), ["2025-03-10", "2026-11-25", false]);
  });

  it("con hora, el día es el de Caracas: las 9 de la noche siguen siendo del mismo día", () => {
    assert.equal(diaDeCaracas(new Date("2026-11-26T01:00:00.000Z")).toISOString().slice(0, 10), "2026-11-25");
    const r = entreDiasCaracas(f("2026-11-25"), f("2026-11-25"));
    assert.deepEqual([r.gte?.toISOString(), r.lt?.toISOString()], ["2026-11-25T04:00:00.000Z", "2026-11-26T04:00:00.000Z"]);
  });

  it("el mes en curso solo filtra si hay algo anterior; lo pedido se respeta", () => {
    assert.deepEqual(ver(rangoDeFechas({}, "mes", limites("2025-03-10", "2026-11-20"), ahora)), ["2026-11-01", "2026-11-25", true]);
    assert.deepEqual(ver(rangoDeFechas({}, "mes", limites("2026-11-05", "2026-11-20"), ahora)), ["2026-11-01", "2026-11-25", false]);
    const r = rangoDeFechas({ desde: "2000-01-01", hasta: "2000-01-31" }, "todas", limites("2025-03-10", "2026-11-20"), ahora);
    assert.deepEqual([r.desde, r.hasta, r.desdeFecha, r.hastaFecha?.toISOString().slice(0, 10)], ["2000-01-01", "2000-01-31", undefined, "2000-01-31"]);
  });
});
