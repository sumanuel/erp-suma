import Link from "next/link";
import { Pencil, Plus } from "lucide-react";
import { Etiqueta, Tarjeta, clasesBoton, formatearFechaHora } from "@/components/ui";
import { requerirSesion, tienePermiso } from "@/lib/dal";
import { BotonEliminar } from "../boton-eliminar";
import { eliminarUsuario } from "./acciones";

export default async function Usuarios() {
  const ctx = await requerirSesion();
  const { db } = ctx;
  const usuarios = await db.usuario.findMany({ include: { perfil: true }, orderBy: { nombre: "asc" } });
  const ultimos = await db.registroIngreso.groupBy({ by: ["usuarioId"], where: { exito: true, usuarioId: { not: null } }, _max: { creadoEn: true } });
  const ultimo = new Map(ultimos.map((u) => [u.usuarioId, u._max.creadoEn]));
  const puedeCrear = tienePermiso(ctx, "seguridad", "crear");
  const puedeEditar = tienePermiso(ctx, "seguridad", "editar");
  const puedeEliminar = tienePermiso(ctx, "seguridad", "eliminar");
  return (
    <Tarjeta>
      <div className="flex items-center justify-between gap-3 p-4">
        <p className="text-[13px] text-gris-500">{usuarios.length} {usuarios.length === 1 ? "usuario" : "usuarios"}</p>
        {puedeCrear ? <Link href="/seguridad/usuarios/nuevo" className={clasesBoton("primario")}><Plus className="size-4" aria-hidden />Nuevo usuario</Link> : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13.5px]">
          <thead>
            <tr className="border-y border-linea text-[12.5px] text-gris-600">
              <th className="px-4 py-3 font-medium">Nombre</th><th className="px-3 py-3 font-medium">Correo</th><th className="px-3 py-3 font-medium">Perfil</th>
              <th className="px-3 py-3 font-medium">Último ingreso</th><th className="px-3 py-3 font-medium">Estado</th><th className="px-4 py-3 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id} className="border-b border-linea last:border-0">
                <td className="px-4 py-3 font-semibold">{u.nombre}</td>
                <td className="px-3 py-3">{u.email}</td>
                <td className="px-3 py-3">{u.perfil.nombre}</td>
                <td className="px-3 py-3 text-gris-600">{formatearFechaHora(ultimo.get(u.id))}</td>
                <td className="px-3 py-3"><Etiqueta tono={u.activo ? "exito" : "neutro"}>{u.activo ? "Activo" : "Inactivo"}</Etiqueta></td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    {puedeEditar ? <Link href={`/seguridad/usuarios/${u.id}`} aria-label={`Editar ${u.nombre}`} className="flex size-9 items-center justify-center rounded-[9px] border border-borde-campo hover:bg-hover"><Pencil className="size-4" aria-hidden /></Link> : null}
                    {puedeEliminar && u.id !== ctx.usuario.id ? <BotonEliminar nombre={u.nombre} accion={eliminarUsuario.bind(null, u.id)} /> : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Tarjeta>
  );
}
