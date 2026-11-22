import fs from "node:fs";
import path from "node:path";

// Extrae de los .Designer.cs del Lebrun original, por pantalla: título, etiquetas, controles de entrada, botones y columnas de grillas.
const RAIZ = "D:/lebrun_20220627/lebrun_20220627/lebrun";
const csproj = fs.readFileSync(path.join(RAIZ, "lebrun.csproj"), "utf8");
const incl = [...csproj.matchAll(/Compile Include="([^"]+\.[dD]esigner\.cs)"/g)].map((m) => m[1].replaceAll("\\", "/"));
const todos = ["parametrosContables.Designer.cs", "Principal.Designer.cs", "frmLogin.designer.cs", ...incl];
const lee = (f) => {
  try {
    return fs.readFileSync(path.join(RAIZ, f), "latin1");
  } catch {
    return null;
  }
};
const TXT = /this\.(\w+)\.Text\s*=\s*"((?:[^"\\]|\\.)*)"/g;
const salida = {};
for (const f of new Set(todos)) {
  if (/Copia de|Malo_|NewFolder/.test(f)) continue;
  const s = lee(f);
  if (!s) continue;
  const tipos = {};
  for (const m of s.matchAll(/private\s+(?:System\.Windows\.Forms\.|System\.)?([\w.]+)\s+(\w+)\s*;/g)) tipos[m[2]] = m[1];
  const textos = {};
  for (const m of s.matchAll(TXT)) textos[m[1]] = m[2];
  const titulo = (s.match(/this\.Text\s*=\s*"((?:[^"\\]|\\.)*)"/) || [])[1] || "";
  const etiquetas = [], entradas = [], botones = [], columnas = [];
  for (const [n, t] of Object.entries(tipos)) {
    if (t === "Label" && textos[n]) etiquetas.push(textos[n]);
    else if (/^(TextBox|ComboBox|DateTimePicker|CheckBox|RadioButton|NumericUpDown|MaskedTextBox|RichTextBox|CheckedListBox|ListBox)$/.test(t)) entradas.push(`${t}:${n}${textos[n] ? `="${textos[n]}"` : ""}`);
    else if (t === "Button") botones.push(textos[n] || n);
  }
  for (const m of s.matchAll(/this\.(\w+)\.HeaderText\s*=\s*"((?:[^"\\]|\\.)*)"/g)) columnas.push(m[2]);
  for (const m of s.matchAll(/new System\.Windows\.Forms\.ColumnHeader\(\)/g)) void m;
  for (const [n, t] of Object.entries(tipos)) if (t === "ColumnHeader" && textos[n]) columnas.push(textos[n]);
  salida[f] = { titulo, etiquetas, entradas, botones, columnas };
}
fs.writeFileSync("D:/Mis proyectos/erp/analisis/inventario.json", JSON.stringify(salida, null, 1));
console.log(Object.keys(salida).length, "formularios");
