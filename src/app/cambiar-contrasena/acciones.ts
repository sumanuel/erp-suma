"use server";

import { redirect } from "next/navigation";
import { requerirSesion } from "@/lib/dal";
import { registrarCambio } from "@/lib/auditoria";
import { hashear, motivoContrasenaDebil, verificar } from "@/lib/nucleo/contrasenas";

export type Estado = { error?: string };

export async function cambiar(_: Estado, form: FormData): Promise<Estado> {
  const { usuario, db } = await requerirSesion();
  const actual = String(form.get("actual") ?? "");
  const nueva = String(form.get("nueva") ?? "");
  const u = await db.usuario.findUnique({ where: { id: usuario.id } });
  if (!u || !(await verificar(actual, u.hashContrasena))) return { error: "La contraseña actual no es correcta." };
  const debil = motivoContrasenaDebil(nueva);
  if (debil) return { error: debil };
  await db.usuario.update({ where: { id: u.id }, data: { hashContrasena: await hashear(nueva), contrasenaCambiadaEn: new Date(), debeCambiarContrasena: false } });
  await registrarCambio(db, usuario, { modulo: "seguridad", entidad: "usuario", entidadId: u.id, descripcion: u.email, accion: "otro", despues: { contrasena: "cambiada por el propio usuario" } });
  redirect("/salir");
}
