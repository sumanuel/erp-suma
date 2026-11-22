import fs from "node:fs";
const j = JSON.parse(fs.readFileSync("esquema.json", "utf8"));
for (const t of process.argv.slice(2)) {
  const k = j[`sisadm.${t}`] ?? j[`sysconf.${t}`] ?? j[`sysconta.${t}`];
  if (!k) { console.log("NO", t); continue; }
  console.log(`\n## ${t} (${k.length})\n` + k.map((c) => c.replace(/ DEFAULT NULL| NOT NULL/g, "").replace(/ DEFAULT .*/, "").replace(/ unsigned/, "u")).join(" · "));
}
