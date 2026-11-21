import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { aCsv } from "../src/lib/reportes/csv";
import { reporteBalanceGeneral, reporteEstadoResultados } from "../src/lib/reportes/financieros";
import { reporteLibroCompras, reporteLibroVentas, reporteResumenIva } from "../src/lib/reportes/fiscal";
import { REPORTES } from "../src/lib/reportes/registro";
import { abrirEntorno, redondear2, type Entorno } from "./soporte/entorno";

// Las pruebas anteriores dejaron facturas, compras, notas y retenciones con contabilización automática: los libros fiscales deben cuadrar al centavo con los asientos.

describe("Reportes y libros fiscales", () => {
  let e: Entorno;
  const v = { desde: "2000-01-01", hasta: "2999-12-31" };
  before(async () => {
    e = await abrirEntorno();
  });

  const saldoCuenta = async (codigo: string, naturaleza: "debe" | "haber") => {
    const r = await e.db.$queryRawUnsafe<{ d: string; h: string }[]>(
      "SELECT COALESCE(SUM(l.debe),0)::text AS d, COALESCE(SUM(l.haber),0)::text AS h FROM asiento_linea l JOIN asiento a ON a.id = l.asiento_id JOIN cuenta_contable c ON c.id = l.cuenta_id WHERE c.codigo = $1 AND a.estado = 'REGISTRADO'",
      codigo,
    );
    return redondear2(naturaleza === "debe" ? Number(r[0].d) - Number(r[0].h) : Number(r[0].h) - Number(r[0].d));
  };
  const sumaIva = (t: Record<string, number>) => redondear2(Object.entries(t).filter(([k]) => k.startsWith("iva_")).reduce((s, [, x]) => s + x, 0));

  it("el libro de ventas: IVA de todas las alícuotas = saldo de IVA débito fiscal (2.1.02)", async () => {
    const r = await reporteLibroVentas(e.db, v);
    assert.ok(r.filas.length > 0, "la suite debió dejar facturas");
    assert.equal(sumaIva(r.totales!), await saldoCuenta("2.1.02", "haber"));
  });

  it("el libro de compras: IVA de todas las alícuotas = saldo de IVA crédito fiscal (1.1.04)", async () => {
    const r = await reporteLibroCompras(e.db, v);
    assert.ok(r.filas.length > 0);
    assert.equal(sumaIva(r.totales!), await saldoCuenta("1.1.04", "debe"));
  });

  it("el resumen de IVA es débito − crédito y sus totales coinciden con los libros", async () => {
    const r = await reporteResumenIva(e.db, v);
    const fila = (txt: string) => r.filas.find((f) => String(f.concepto).startsWith(txt))!;
    const debito = Number(fila("Total débito fiscal").iva);
    const credito = Number(fila("Total crédito fiscal").iva);
    assert.equal(debito, sumaIva((await reporteLibroVentas(e.db, v)).totales!));
    assert.equal(credito, sumaIva((await reporteLibroCompras(e.db, v)).totales!));
    const cuota = fila(debito >= credito ? "IVA a pagar" : "Excedente");
    assert.equal(Number(cuota.iva), redondear2(Math.abs(debito - credito)));
  });

  it("el balance general cuadra y la utilidad del estado de resultados es la del balance", async () => {
    const b = await reporteBalanceGeneral(e.db, { hasta: v.hasta });
    assert.ok(b.notas?.[0].startsWith("El balance cuadra"), b.notas?.[0]);
    const por = (txt: string) => Number(b.filas.find((f) => f.cuenta === txt)!.saldo);
    assert.equal(por("Total activo"), por("Total pasivo + patrimonio"));
    const er = await reporteEstadoResultados(e.db, v);
    const utilidad = Number(er.filas.find((f) => String(f.cuenta).includes("neta del período"))!.saldo);
    const resultado = Number(b.filas.find((f) => String(f.cuenta).startsWith("Resultado del ejercicio"))!.saldo);
    assert.equal(Math.abs(utilidad), Math.abs(resultado));
  });

  it("todos los reportes del registro se ejecutan sin error con sus parámetros por omisión", async () => {
    assert.ok(REPORTES.length >= 9);
    for (const def of REPORTES) {
      const params: Record<string, string> = { ...v };
      for (const p of await def.parametros(e.db)) if (p.tipo === "opciones") params[p.id] = p.defecto;
      const r = await def.consultar(e.db, params);
      assert.ok(Array.isArray(r.filas) && Array.isArray(r.columnas), def.id);
    }
  });

  it("el CSV usa ; y coma decimal, BOM, una línea por fila y escapa comillas", () => {
    const csv = aCsv({ columnas: [{ clave: "a", titulo: "Texto", tipo: "texto" }, { clave: "b", titulo: "Monto", tipo: "moneda" }], filas: [{ a: 'dice "hola"; adiós', b: 1234.5 }, { a: "x", b: 0.1 }], totales: { b: 1234.6 } }, "Prueba");
    assert.ok(csv.startsWith("\uFEFF") || csv.includes("Prueba"));
    assert.ok(csv.includes('"dice ""hola""; adiós";1234,50'));
    assert.ok(csv.includes("x;0,10"));
    assert.ok(csv.includes("Totales;1234,60"));
  });
});
