import "dotenv/config";
import { spawnSync } from "node:child_process";
import { crearCliente, eliminarCliente, requerirEntorno } from "./lib/aprovisionar";
import { clientePorSlug, poolControl } from "../src/lib/nucleo/control";

// npm test [-- <filtro de archivo>]
// Crea un cliente temporal con su propia base (nunca toca `demo`), corre la suite sobre él y lo elimina al terminar.
// --conservar deja el cliente para inspeccionarlo; PRUEBAS_REUSAR=1 reutiliza el que ya exista (más rápido al desarrollar pruebas).

const SLUG = "pruebas_suite";

async function main() {
  requerirEntorno("CONTROL_DATABASE_URL", "CONTROL_CLAVE_MAESTRA", "PG_ADMIN_PASSWORD");
  const args = process.argv.slice(2);
  const conservar = args.includes("--conservar") || process.env.PRUEBAS_REUSAR === "1";
  const filtro = args.filter((a) => !a.startsWith("--"));
  const reusar = process.env.PRUEBAS_REUSAR === "1" && (await clientePorSlug(SLUG));
  if (!reusar) {
    await eliminarCliente(SLUG).catch(() => {});
    console.log("Creando cliente temporal de pruebas…");
    const t0 = Date.now();
    await crearCliente(SLUG, "Pruebas automatizadas", `admin@${SLUG}.local`);
    console.log(`Listo en ${Math.round((Date.now() - t0) / 1000)} s.\n`);
  }
  const archivos = filtro.length ? filtro.map((f) => `tests/${f}`) : ["tests"];
  const r = spawnSync(
    process.execPath,
    ["--conditions=react-server", "--import", "tsx", "--test", "--test-concurrency=1", ...archivos.flatMap((a) => (a.endsWith(".ts") ? [a] : [`${a}/**/*.test.ts`]))],
    { stdio: "inherit", env: { ...process.env, PRUEBAS_SLUG: SLUG } },
  );
  if (!conservar && !reusar) await eliminarCliente(SLUG).catch((e) => console.error("No se pudo eliminar el cliente de pruebas:", e));
  await poolControl().end();
  process.exitCode = r.status ?? 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
