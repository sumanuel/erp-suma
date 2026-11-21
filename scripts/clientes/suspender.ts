import "dotenv/config";
import { clientePorSlug, poolControl, registrarAprovisionamiento } from "../../src/lib/nucleo/control";

// npm run cliente:suspender -- <codigo>      → deja de operar en menos de 30 s (impago, baja temporal)
// npm run cliente:suspender -- <codigo> --reactivar
async function main() {
  const [slug, bandera] = process.argv.slice(2);
  if (!slug) throw new Error("Uso: npm run cliente:suspender -- <codigo> [--reactivar]");
  const c = await clientePorSlug(slug);
  if (!c) throw new Error(`No existe el cliente "${slug}".`);
  const estado = bandera === "--reactivar" ? "activo" : "suspendido";
  await poolControl().query("UPDATE cliente SET estado = $2, actualizado_en = now() WHERE id = $1", [c.id, estado]);
  await registrarAprovisionamiento(c.id, slug, estado === "activo" ? "reactivar" : "suspender", true);
  console.log(`Cliente ${slug}: ${estado}.`);
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => poolControl().end());
