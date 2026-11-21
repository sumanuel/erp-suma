import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { leerSesion } from "./sesion";
import { dbParaClienteId } from "./tenant";
import { permiso as armarPermiso, type Accion } from "./modulos";

// Valida la sesión contra la base en cada página y acción: usuario activo, perfil activo y contraseña no cambiada después del inicio.
export type UsuarioActual = {
  id: string; email: string; nombre: string; perfil: string; esAdministrador: boolean; permisos: ReadonlySet<string>; debeCambiarContrasena: boolean;
};

export const requerirSesion = cache(async () => {
  const sesion = await leerSesion();
  if (!sesion) redirect("/ingresar");
  const { db, cliente } = await dbParaClienteId(sesion.clienteId).catch(() => redirect("/salir"));
  const u = await db.usuario.findUnique({ where: { id: sesion.usuarioId }, include: { perfil: { include: { permisos: true } } } });
  const cambiadaEn = u?.contrasenaCambiadaEn?.getTime() ?? 0;
  if (!u || !u.activo || !u.perfil.activo || cambiadaEn > sesion.inicio * 1000) redirect("/salir");
  const usuario: UsuarioActual = {
    id: u.id, email: u.email, nombre: u.nombre, perfil: u.perfil.nombre, esAdministrador: u.perfil.esAdministrador,
    permisos: new Set(u.perfil.permisos.map((p) => p.permiso)), debeCambiarContrasena: u.debeCambiarContrasena,
  };
  return { db, cliente, usuario, sesion };
});

type Contexto = Awaited<ReturnType<typeof requerirSesion>>;

export function tienePermiso(ctx: Pick<Contexto, "usuario" | "cliente">, modulo: string, accion: Accion): boolean {
  // Un módulo apagado para el cliente (modulos.<id> = false) no se ve ni con permiso.
  if (ctx.cliente.modulos[modulo] === false) return false;
  return ctx.usuario.esAdministrador || ctx.usuario.permisos.has(armarPermiso(modulo, accion));
}

export async function requerirPermiso(modulo: string, accion: Accion = "ver") {
  const ctx = await requerirSesion();
  if (ctx.usuario.debeCambiarContrasena) redirect("/cambiar-contrasena");
  if (!tienePermiso(ctx, modulo, accion)) redirect("/sin-acceso");
  return ctx;
}

/** Para acciones del servidor: si no hay permiso, lanza (no redirige a medias una mutación). */
export async function requerirPermisoAccion(modulo: string, accion: Accion) {
  const ctx = await requerirSesion();
  if (ctx.usuario.debeCambiarContrasena || !tienePermiso(ctx, modulo, accion)) throw new Error("No tiene permiso para esta operación");
  return ctx;
}
