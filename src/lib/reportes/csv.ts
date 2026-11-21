import type { Resultado } from "./tipos";

// CSV para Excel en configuración regional venezolana: separador «;», decimal «,», UTF-8 con BOM. Los montos salen como números (sin separador de miles)
// para que Excel pueda sumarlos.
const celda = (s: string) => (/[;"\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s);
const fechaUtc = (d: Date) => `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;

export function aCsv(r: Resultado, titulo: string): string {
  const num = (n: number, tipo: string) => (tipo === "moneda" ? n.toFixed(2) : tipo === "entero" ? n.toFixed(0) : String(Number(n.toFixed(4)))).replace(".", ",");
  const lineas: string[] = [celda(titulo), r.columnas.map((c) => celda(c.titulo)).join(";")];
  for (const f of r.filas) {
    lineas.push(
      r.columnas
        .map((c, i) => {
          const v = f[c.clave];
          if (v === null || v === undefined || v === "") return "";
          if (v instanceof Date) return fechaUtc(v);
          if (typeof v === "number") return num(v, c.tipo);
          const sangria = i === 0 && f._nivel ? "  ".repeat(f._nivel) : "";
          return celda(sangria + String(v));
        })
        .join(";"),
    );
  }
  if (r.totales) lineas.push(r.columnas.map((c, i) => (i === 0 ? "Totales" : c.clave in (r.totales ?? {}) ? num(r.totales![c.clave], c.tipo) : "")).join(";"));
  for (const n of r.notas ?? []) lineas.push(celda(n));
  return `\uFEFF${lineas.join("\r\n")}\r\n`;
}
