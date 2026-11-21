// npm run local:preparar — prepara el PostgreSQL local: rol y base de control (erp_control) y secretos en .env. Idempotente.
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { Client } from "pg";

const env = ".env";
const leer = () => readFileSync(env, "utf8").split(/\r?\n/);
function poner(clave: string, valor: string) {
  const l = leer();
  const i = l.findIndex((x) => x.startsWith(`${clave}=`));
  if (i >= 0) l[i] = `${clave}=${valor}`; else l.push(`${clave}=${valor}`);
  writeFileSync(env, l.filter((x, k, a) => x || k < a.length - 1).join("\n") + "\n");
}
const tiene = (clave: string) => leer().some((x) => x.startsWith(`${clave}=`) && x.length > clave.length + 1);

async function main() {
  const host = process.env.PG_HOST ?? "127.0.0.1";
  const port = Number(process.env.PG_PORT ?? 5432);
  if (!process.env.PG_ADMIN_PASSWORD) throw new Error("Falta PG_ADMIN_PASSWORD en .env");
  const admin = new Client({ host, port, user: process.env.PG_ADMIN_USER ?? "postgres", password: process.env.PG_ADMIN_PASSWORD, database: "postgres" });
  await admin.connect();
  const rol = "erp_plataforma";
  const existe = (await admin.query("select 1 from pg_roles where rolname=$1", [rol])).rowCount === 1;
  if (!existe || !tiene("CONTROL_DATABASE_URL")) {
    const clave = randomBytes(24).toString("hex");
    await admin.query(`${existe ? "alter" : "create"} role ${rol} login password ${admin.escapeLiteral(clave)}`);
    poner("CONTROL_DATABASE_URL", `postgresql://${rol}:${clave}@${host}:${port}/erp_control`);
  }
  if (!(await admin.query("select 1 from pg_database where datname='erp_control'")).rowCount) await admin.query(`create database erp_control owner ${rol} encoding 'UTF8'`);
  await admin.query("revoke connect on database erp_control from public");
  await admin.query(`grant connect on database erp_control to ${rol}`);
  await admin.end();

  const ctl = new Client({ connectionString: leer().find((x) => x.startsWith("CONTROL_DATABASE_URL="))!.slice("CONTROL_DATABASE_URL=".length) });
  await ctl.connect();
  for (const f of readdirSync("scripts/control").filter((x) => x.endsWith(".sql")).sort()) await ctl.query(readFileSync(`scripts/control/${f}`, "utf8"));
  await ctl.end();

  if (!tiene("CONTROL_CLAVE_MAESTRA")) poner("CONTROL_CLAVE_MAESTRA", randomBytes(32).toString("base64"));
  if (!tiene("SESSION_SECRET")) poner("SESSION_SECRET", randomBytes(32).toString("base64url"));
  console.log("Base de control lista. Siguiente: npm run cliente:crear -- demo \"Cliente demo\"");
}
main().catch((e) => { console.error(e.message); process.exit(1); });
