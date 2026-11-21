"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Db } from "@/lib/tenant";
import { requerirPermisoAccion } from "@/lib/dal";
import { registrarCambio, soloCambios } from "@/lib/auditoria";
import { hashear, motivoContrasenaDebil } from "@/lib/nucleo/contrasenas";

export type EstadoUsuario = { errores?: Record<string, string>; error?: string };

const Datos = z.object({
  nombre: z.string().trim().min(2, "Obligatorio").max(120),
  email: z.string().trim().toLowerCase().email("Correo inválido").max(200),
  perfilId: z.string().uuid("Elige un perfil"),
  contrasena: z.string().max(200).optional(),
});

/** ¿Quedaría al menos un administrador activo si este usuario deja de serlo? */
async function quedaOtroAdmin(db: Db, excluirId: string) {
  return (await db.usuario.count({ where: { id: { not: excluirId }, activo: true, perfil: { esAdministrador: true, activo: true } } })) > 0;
}

export async function guardarUsuario(id: string | null, _: EstadoUsuario, form: FormData): Promise<EstadoUsuario> {
  const ctx = await requerirPermisoAccion("seguridad", id ? "editar" : "crear");
  const { db, usuario } = ctx;
  const r = Datos.safeParse(Object.fromEntries(form));
  if (!r.success) {
    const errores: Record<string, string> = {};
    for (const i of r.error.issues) errores[String(i.path[0])] ??= i.message;
    return { errores };
  }
  const d = r.data;
  const activo = form.get("activo") === "on";
  const clave = d.contrasena?.trim() ?? "";
  if (!id && !clave) return { errores: { contrasena: "Obligatoria para un usuario nuevo." } };
  if (clave) {
    const debil = motivoContrasenaDebil(clave);
    if (debil) return { errores: { contrasena: debil } };
  }
  const perfil = await db.perfil.findUnique({ where: { id: d.perfilId } });
  if (!perfil) return { errores: { perfilId: "Perfil inexistente." } };
  const repetido = await db.usuario.findFirst({ where: { email: d.email, NOT: id ? { id } : undefined }, select: { id: true } });
  if (repetido) return { errores: { email: "Ya existe un usuario con este correo." } };

  if (id) {
    const actual = await db.usuario.findUnique({ where: { id }, include: { perfil: true } });
    if (!actual) return { error: "El usuario ya no existe." };
    const pierdeAdmin = actual.perfil.esAdministrador && actual.activo && (!activo || !perfil.esAdministrador || !perfil.activo);
    if (pierdeAdmin && !(await quedaOtroAdmin(db, id))) return { error: "Debe quedar al menos un administrador activo." };
    if (id === ctx.usuario.id && !activo) return { error: "No puedes desactivar tu propio usuario." };
    const foto = (u: { nombre: string; email: string; perfilId: string; activo: boolean }, perfil: string) => ({ nombre: u.nombre, email: u.email, perfil, activo: u.activo });
    await db.usuario.update({
      where: { id },
      data: {
        nombre: d.nombre, email: d.email, perfilId: d.perfilId, activo,
        ...(clave ? { hashContrasena: await hashear(clave), contrasenaCambiadaEn: new Date(), intentosFallidos: 0, bloqueadoHasta: null } : {}),
        // Una desactivación o un cambio de perfil cortan las sesiones abiertas.
        ...(!activo || actual.perfilId !== d.perfilId ? { contrasenaCambiadaEn: new Date() } : {}),
      },
    });
    const cambios = soloCambios(foto(actual, actual.perfil.nombre), { ...foto({ nombre: d.nombre, email: d.email, perfilId: d.perfilId, activo }, perfil.nombre), ...(clave ? { contrasena: "restablecida" } : {}) });
    if (Object.keys(cambios.despues).length) await registrarCambio(db, usuario, { modulo: "seguridad", entidad: "usuario", entidadId: id, descripcion: d.email, accion: "editar", ...cambios });
  } else {
    const creado = await db.usuario.create({
      data: { nombre: d.nombre, email: d.email, perfilId: d.perfilId, activo, hashContrasena: await hashear(clave), debeCambiarContrasena: false },
    });
    await registrarCambio(db, usuario, { modulo: "seguridad", entidad: "usuario", entidadId: creado.id, descripcion: d.email, accion: "crear", despues: { nombre: d.nombre, email: d.email, perfil: perfil.nombre, activo } });
  }
  revalidatePath("/seguridad/usuarios");
  redirect("/seguridad/usuarios");
}

export async function eliminarUsuario(id: string): Promise<string | null> {
  const ctx = await requerirPermisoAccion("seguridad", "eliminar");
  const { db } = ctx;
  if (id === ctx.usuario.id) return "No puedes eliminar tu propio usuario.";
  const u = await db.usuario.findUnique({ where: { id }, include: { perfil: true } });
  if (!u) return null;
  if (u.perfil.esAdministrador && u.activo && !(await quedaOtroAdmin(db, id))) return "Debe quedar al menos un administrador activo.";
  await db.usuario.delete({ where: { id } });
  await registrarCambio(db, ctx.usuario, { modulo: "seguridad", entidad: "usuario", entidadId: id, descripcion: u.email, accion: "eliminar", antes: { nombre: u.nombre, email: u.email, perfil: u.perfil.nombre } });
  revalidatePath("/seguridad/usuarios");
  return null;
}
