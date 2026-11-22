import fs from "node:fs";

// Muestra etiquetas, controles, botones y columnas de las pantallas del Lebrun cuyo nombre contenga cada argumento.
const fix = (s) => (/Ã|Â/.test(s) ? Buffer.from(s, "latin1").toString("utf8") : s);
const j = JSON.parse(fs.readFileSync("inventario.json", "utf8"));
const lim = Number(process.env.LIM ?? 1400);
for (const k of process.argv.slice(2)) {
  const e = Object.entries(j).find(([f]) => f.toLowerCase().includes(k.toLowerCase()));
  if (!e) {
    console.log("NO", k);
    continue;
  }
  const [f, v] = e;
  const t = `\n=== ${f}  «${v.titulo}»\nETIQUETAS: ${v.etiquetas.join(" | ")}\nENTRADAS: ${v.entradas.map((x) => x.split(":")[1]).join(", ")}\nBOTONES: ${v.botones.join(" | ")}\nCOLUMNAS: ${v.columnas.join(" | ")}`;
  console.log(fix(t).slice(0, lim));
}
