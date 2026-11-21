import "dotenv/config";
import { hashear, motivoContrasenaDebil } from "../../src/lib/nucleo/contrasenas";
import { poolControl } from "../../src/lib/nucleo/control";

// npm run plataforma:admin -- <correo> "<Nombre>" <contraseña>   (crea o actualiza un administrador del panel /plataforma)
async function main() {
  const [email, nombre, clave] = process.argv.slice(2);
  if (!email || !nombre || !clave) throw new Error('Uso: npm run plataforma:admin -- <correo> "<Nombre>" <contraseña>');
  const debil = motivoContrasenaDebil(clave);
  if (debil) throw new Error(debil);
  await poolControl().query(
    `INSERT INTO administrador_plataforma (email, nombre, hash_contrasena, contrasena_cambiada_en)
     VALUES ($1,$2,$3, now())
     ON CONFLICT (email) DO UPDATE SET nombre = $2, hash_contrasena = $3, activo = true, intentos_fallidos = 0, bloqueado_hasta = NULL, contrasena_cambiada_en = now()`,
    [email.toLowerCase(), nombre, await hashear(clave)],
  );
  console.log(`Administrador de plataforma ${email} listo.`);
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => poolControl().end());
