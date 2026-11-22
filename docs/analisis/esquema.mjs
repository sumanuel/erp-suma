import fs from "node:fs";

// Lee el respaldo MySQL del Lebrun y deja { base.tabla: [columnas con tipo] } en esquema.json.
const SQL = fs.readFileSync("D:/lebrun_20220627/lebrun_20220627/respaldo_bd_local/antes_N2_restantes_2026-10-23.sql", "utf8").replace(/\r\n/g, "\n");
const salida = {};
let base = "";
for (const bloque of SQL.split(/\n(?=USE `|CREATE TABLE `)/)) {
  const u = bloque.match(/^USE `(\w+)`/);
  if (u) base = u[1];
  const t = bloque.match(/^CREATE TABLE `(\w+)` \(\n([\s\S]*?)\n\) ENGINE/);
  if (!t) continue;
  const cols = [];
  for (const l of t[2].split("\n")) {
    const c = l.match(/^\s+`(\w+)` ([^,]*?)(?:,)?$/);
    if (c) cols.push(`${c[1]} ${c[2].replace(/ COLLATE \w+| CHARACTER SET \w+/g, "")}`);
  }
  salida[`${base}.${t[1]}`] = cols;
}
fs.writeFileSync("D:/Mis proyectos/erp/analisis/esquema.json", JSON.stringify(salida, null, 1));
console.log(Object.keys(salida).length, "tablas");
