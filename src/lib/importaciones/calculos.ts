// Liquidación de una importación (original: frmProductosImportacion, columnas C a L), en USD:
//   FOB   = cantidad × precio FOB × cambio a USD
//   CIF   = FOB × factor CIF                         (flete y seguro)
//   gasto = CIF × factor de gastos                   (factor de gastos = gastos totales ÷ CIF total: prorratea los gastos según el valor de cada producto)
//   base  = CIF × (1 + factor de otros)              (base del arancel)
//   arancel = base × % de arancel ÷ 100
//   total = CIF + gasto + arancel;  costo unitario = total ÷ cantidad

export type LineaImportacion = { cantidad: number; fobUnitario: number; arancelPct: number };
export type ParametrosImportacion = { cambioUsd: number; factorCif: number; factorOtros: number; gastosUsd: number };
export type ResultadoLinea = { fobUsd: number; cifUsd: number; gastoUsd: number; arancelUsd: number; totalUsd: number; costoUnitarioUsd: number };

const r4 = (n: number) => Math.round((n + Number.EPSILON) * 1e4) / 1e4;
const r8 = (n: number) => Math.round((n + Number.EPSILON) * 1e8) / 1e8;

export function liquidarImportacion(lineas: LineaImportacion[], p: ParametrosImportacion) {
  const base = lineas.map((l) => {
    const fob = l.cantidad * l.fobUnitario * p.cambioUsd;
    return { fob, cif: fob * p.factorCif };
  });
  const cifTotal = base.reduce((s, x) => s + x.cif, 0);
  const factorGasto = cifTotal > 0 ? p.gastosUsd / cifTotal : 0;
  const filas: ResultadoLinea[] = lineas.map((l, i) => {
    const { fob, cif } = base[i];
    const gasto = cif * factorGasto;
    const arancel = (cif * (1 + p.factorOtros) * l.arancelPct) / 100;
    const total = cif + gasto + arancel;
    return { fobUsd: r4(fob), cifUsd: r4(cif), gastoUsd: r4(gasto), arancelUsd: r4(arancel), totalUsd: r4(total), costoUnitarioUsd: l.cantidad > 0 ? r8(total / l.cantidad) : 0 };
  });
  const suma = (k: keyof ResultadoLinea) => r4(filas.reduce((s, f) => s + f[k], 0));
  return { filas, factorGasto, totales: { fobUsd: suma("fobUsd"), cifUsd: suma("cifUsd"), gastoUsd: suma("gastoUsd"), arancelUsd: suma("arancelUsd"), totalUsd: suma("totalUsd") } };
}

export const numeroImportacion = (n: number) => `IMP-${String(n).padStart(6, "0")}`;

export const ESTADOS_IMPORTACION = {
  BORRADOR: { etiqueta: "Borrador", tono: "neutro" },
  PROCESADA: { etiqueta: "Procesada", tono: "exito" },
  ANULADA: { etiqueta: "Anulada", tono: "error" },
} as const;
export type EstadoImportacion = keyof typeof ESTADOS_IMPORTACION;
