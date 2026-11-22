"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Db } from "@/lib/tenant";
import { requerirPermisoAccion } from "@/lib/dal";
import { registrarCambio, soloCambios } from "@/lib/auditoria";
import { esPermisoEspecial, todosLosPermisos } from "@/lib/modulos";

export type EstadoPerfil = { errores?: Record<string, string>; error?: string };

const Datos = z.object({ nombre: z.string().trim().min(2, "Obligatorio").max(80), descripcion: z.string().trim().max(300).optional() });

async function quedaOtroAdmin(db: Db, excluirPerfilId: string) {
  return (await db.usuario.count({ where: { activo: true, perfil: { id: { not: excluirPerfilId }, esAdministrador: true, activo: true } } })) > 0;
}

export async function guardarPerfil(id: string | null, _: EstadoPerfil, form: FormData): Promise<EstadoPerfil> {
  const { db, usuario } = await requerirPermisoAccion("seguridad", id ? "editar" : "crear");
  const r = Datos.safeParse(Object.fromEntries(form));
  if (!r.success) return { errores: { nombre: r.error.issues[0]?.message ?? "Dato inválido" } };
  const validos = new Set(todosLosPermisos());
  const permisos = [...new Set(form.getAll("permiso").map(String))].filter((p) => validos.has(p));
  // Ver es requisito de cualquier otra acción del módulo.
  for (const p of [...permisos]) {
    if (esPermisoEspecial(p)) continue;
    const [modulo] = p.split(".");
    if (!permisos.includes(`${modulo}.ver`)) permisos.push(`${modulo}.ver`);
  }
  const activo = form.get("activo") === "on";
  const repetido = await db.perfil.findFirst({ where: { nombre: r.data.nombre, NOT: id ? { id } : undefined }, select: { id: true } });
  if (repetido) return { errores: { nombre: "Ya existe un perfil con este nombre." } };

  const datos = { nombre: r.data.nombre, descripcion: r.data.descripcion || null, activo };
  if (id) {
    const actual = await db.perfil.findUnique({ where: { id }, include: { permisos: true } });
    if (!actual) return { error: "El perfil ya no existe." };
    if (actual.esAdministrador && !activo && !(await quedaOtroAdmin(db, id))) return { error: "Debe quedar al menos un perfil administrador activo." };
    await db.$transaction([
      db.perfil.update({ where: { id }, data: datos }),
      db.perfilPermiso.deleteMany({ where: { perfilId: id } }),
      db.perfilPermiso.createMany({ data: permisos.map((permiso) => ({ perfilId: id, permiso })) }),
    ]);
    const foto = (n: string, d: string | null, a: boolean, p: string[]) => ({ nombre: n, descripcion: d, activo: a, permisos: [...p].sort() });
    const cambios = soloCambios(foto(actual.nombre, actual.descripcion, actual.activo, actual.permisos.map((x) => x.permiso)), foto(datos.nombre, datos.descripcion, datos.activo, permisos));
    if (Object.keys(cambios.despues).length) await registrarCambio(db, usuario, { modulo: "seguridad", entidad: "perfil", entidadId: id, descripcion: datos.nombre, accion: "editar", ...cambios });
  } else {
    const creado = await db.perfil.create({ data: { ...datos, permisos: { create: permisos.map((permiso) => ({ permiso })) } } });
    await registrarCambio(db, usuario, { modulo: "seguridad", entidad: "perfil", entidadId: creado.id, descripcion: datos.nombre, accion: "crear", despues: { ...datos, permisos: [...permisos].sort() } });
  }
  revalidatePath("/seguridad/perfiles");
  redirect("/seguridad/perfiles");
}

export async function eliminarPerfil(id: string): Promise<string | null> {
  const { db, usuario } = await requerirPermisoAccion("seguridad", "eliminar");
  const p = await db.perfil.findUnique({ where: { id }, include: { _count: { select: { usuarios: true } } } });
  if (!p) return null;
  if (p._count.usuarios > 0) return `Tiene ${p._count.usuarios} usuario(s) asignados: cámbialos de perfil primero.`;
  if (p.esAdministrador && !(await quedaOtroAdmin(db, id))) return "Debe quedar al menos un perfil administrador.";
  await db.perfil.delete({ where: { id } });
  await registrarCambio(db, usuario, { modulo: "seguridad", entidad: "perfil", entidadId: id, descripcion: p.nombre, accion: "eliminar", antes: { nombre: p.nombre, descripcion: p.descripcion } });
  revalidatePath("/seguridad/perfiles");
  return null;
}
