import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { poolControl } from "@/lib/nucleo/control";
import { COOKIE_PLATAFORMA, firmarTokenPlataforma, opcionesCookiePlataforma, verificarTokenPlataforma } from "./token";

export async function crearSesionPlataforma(adminId: string) {
  const token = await firmarTokenPlataforma({ adminId, inicio: Math.ceil(Date.now() / 1000) });
  (await cookies()).set(COOKIE_PLATAFORMA, token, opcionesCookiePlataforma());
}

export async function cerrarSesionPlataforma() {
  (await cookies()).delete({ name: COOKIE_PLATAFORMA, path: "/plataforma" });
}

/** Valida la sesión del proveedor contra erp_control en cada página y acción. */
export const requerirPlataforma = cache(async () => {
  await connection();
  const token = (await cookies()).get(COOKIE_PLATAFORMA)?.value;
  const sesion = token ? await verificarTokenPlataforma(token) : null;
  if (!sesion) redirect("/plataforma/ingresar");
  const r = await poolControl().query(
    "SELECT id, email, nombre, activo, contrasena_cambiada_en FROM administrador_plataforma WHERE id = $1",
    [sesion.adminId],
  );
  const a = r.rows[0];
  const cambiada = a?.contrasena_cambiada_en ? new Date(a.contrasena_cambiada_en).getTime() : 0;
  if (!a || !a.activo || cambiada > sesion.inicio * 1000) redirect("/plataforma/ingresar");
  return { id: a.id as string, email: a.email as string, nombre: a.nombre as string };
});
