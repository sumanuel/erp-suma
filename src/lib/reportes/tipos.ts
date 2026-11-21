// Tipos comunes de los reportes. Cada reporte devuelve un `Resultado` genérico: la misma tabla se ve en pantalla, se imprime y se exporta a CSV,
// así lo que ve el usuario y lo que descarga nunca difieren.
export type TipoColumna = "texto" | "entero" | "numero" | "moneda" | "fecha";
export type Columna = { clave: string; titulo: string; tipo: TipoColumna };
/** `_nivel` sangra la primera columna; `_negrita` resalta títulos y subtotales. */
export type Fila = Record<string, string | number | boolean | Date | null | undefined> & { _nivel?: number; _negrita?: boolean };
export type Resultado = { columnas: Columna[]; filas: Fila[]; totales?: Record<string, number>; notas?: string[] };

export type Opcion = { valor: string; etiqueta: string };
export type Parametro =
  | { id: string; etiqueta: string; tipo: "fecha"; defecto: "inicioMes" | "hoy" | "inicioAnio" }
  | { id: string; etiqueta: string; tipo: "opciones"; opciones: Opcion[]; defecto: string };

export type MetaReporte = { id: string; titulo: string; descripcion: string; grupo: "Ventas" | "Inventario" | "Cobranza y pagos" | "Contabilidad" | "Fiscal" };

const nf = (min: number, max: number) => new Intl.NumberFormat("es-VE", { minimumFractionDigits: min, maximumFractionDigits: max });
const moneda = nf(2, 2), numero = nf(0, 4), entero = nf(0, 0);
const fechaUtc = new Intl.DateTimeFormat("es-VE", { dateStyle: "short", timeZone: "UTC" });

/** Texto de una celda para pantalla. */
export function textoCelda(valor: Fila[string], tipo: TipoColumna): string {
  if (valor === null || valor === undefined || valor === "") return "";
  if (tipo === "fecha") return valor instanceof Date ? fechaUtc.format(valor) : String(valor);
  if (typeof valor === "number") return tipo === "moneda" ? moneda.format(valor) : tipo === "entero" ? entero.format(valor) : numero.format(valor);
  return String(valor);
}
