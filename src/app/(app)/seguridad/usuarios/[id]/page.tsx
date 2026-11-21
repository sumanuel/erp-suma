import { notFound } from "next/navigation";
import { Tarjeta } from "@/components/ui";
import { requerirPermiso } from "@/lib/dal";
import { Volver } from "../../volver";
import { FormularioUsuario } from "../formulario";

export default async function EditarUsuario({ params }: { params: Promise<{ id: string }> }) {
  const { db } = await requerirPermiso("seguridad", "editar");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const u = await db.usuario.findUnique({ where: { id } });
  if (!u) notFound();
  const perfiles = await db.perfil.findMany({ where: { OR: [{ activo: true }, { id: u.perfilId }] }, orderBy: { nombre: "asc" } });
  return (
    <div className="flex flex-col gap-4">
      <Volver href="/seguridad/usuarios" texto="Usuarios" />
      <h2 className="text-[22px] font-semibold tracking-[-0.02em]">{u.nombre}</h2>
      <Tarjeta>
        <FormularioUsuario id={u.id} textoBoton="Guardar cambios" perfiles={perfiles.map((p) => ({ valor: p.id, etiqueta: p.nombre }))} inicial={{ nombre: u.nombre, email: u.email, perfilId: u.perfilId, activo: u.activo }} />
      </Tarjeta>
    </div>
  );
}
