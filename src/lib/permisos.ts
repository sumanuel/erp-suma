import { permiso as armarPermiso, type Accion } from "./modulos";

// Regla única de autorización, sin dependencias de Next para poder probarla directamente. La usa dal.ts en cada página y acción.
export type ContextoPermisos = {
  usuario: { esAdministrador: boolean; permisos: ReadonlySet<string> };
  cliente: { modulos: Record<string, boolean> };
};

export function tienePermiso(ctx: ContextoPermisos, modulo: string, accion: Accion): boolean {
  // Un módulo apagado para el cliente (modulos.<id> = false) no se ve ni con permiso.
  if (ctx.cliente.modulos[modulo] === false) return false;
  return ctx.usuario.esAdministrador || ctx.usuario.permisos.has(armarPermiso(modulo, accion));
}
