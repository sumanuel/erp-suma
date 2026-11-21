import Link from "next/link";
import { Pencil, Plus } from "lucide-react";
import { Etiqueta, Tarjeta, clasesBoton } from "@/components/ui";
import { requerirSesion, tienePermiso } from "@/lib/dal";
import { BotonEliminar } from "../boton-eliminar";
import { eliminarPerfil } from "./acciones";

export default async function Perfiles() {
  const ctx = await requerirSesion();
  const { db } = ctx;
  const perfiles = await db.perfil.findMany({ include: { _count: { select: { usuarios: true, permisos: true } } }, orderBy: { nombre: "asc" } });
  const puedeCrear = tienePermiso(ctx, "seguridad", "crear");
  const puedeEditar = tienePermiso(ctx, "seguridad", "editar");
  const puedeEliminar = tienePermiso(ctx, "seguridad", "eliminar");
  return (
    <Tarjeta>
      <div className="flex items-center justify-between gap-3 p-4">
        <p className="text-[13px] text-gris-500">{perfiles.length} {perfiles.length === 1 ? "perfil" : "perfiles"}</p>
        {puedeCrear ? <Link href="/seguridad/perfiles/nuevo" className={clasesBoton("primario")}><Plus className="size-4" aria-hidden />Nuevo perfil</Link> : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13.5px]">
          <thead>
            <tr className="border-y border-linea text-[12.5px] text-gris-600">
              <th className="px-4 py-3 font-medium">Perfil</th><th className="px-3 py-3 font-medium">Descripción</th><th className="px-3 py-3 font-medium">Usuarios</th>
              <th className="px-3 py-3 font-medium">Permisos</th><th className="px-3 py-3 font-medium">Estado</th><th className="px-4 py-3 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {perfiles.map((p) => (
              <tr key={p.id} className="border-b border-linea last:border-0">
                <td className="px-4 py-3 font-semibold">{p.nombre} {p.esAdministrador ? <Etiqueta tono="marca">Administrador</Etiqueta> : null}</td>
                <td className="px-3 py-3 text-gris-600">{p.descripcion ?? "—"}</td>
                <td className="px-3 py-3">{p._count.usuarios}</td>
                <td className="px-3 py-3">{p.esAdministrador ? "Todos" : p._count.permisos}</td>
                <td className="px-3 py-3"><Etiqueta tono={p.activo ? "exito" : "neutro"}>{p.activo ? "Activo" : "Inactivo"}</Etiqueta></td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    {puedeEditar ? <Link href={`/seguridad/perfiles/${p.id}`} aria-label={`Editar ${p.nombre}`} className="flex size-9 items-center justify-center rounded-[9px] border border-borde-campo hover:bg-hover"><Pencil className="size-4" aria-hidden /></Link> : null}
                    {puedeEliminar ? <BotonEliminar nombre={p.nombre} accion={eliminarPerfil.bind(null, p.id)} /> : null}
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
