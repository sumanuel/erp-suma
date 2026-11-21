import { notFound } from "next/navigation";
import { Tarjeta } from "@/components/ui";
import { requerirPermiso } from "@/lib/dal";
import { Volver } from "../../volver";
import { FormularioPerfil } from "../formulario";

export default async function EditarPerfil({ params }: { params: Promise<{ id: string }> }) {
  const { db } = await requerirPermiso("seguridad", "editar");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const p = await db.perfil.findUnique({ where: { id }, include: { permisos: true } });
  if (!p) notFound();
  return (
    <div className="flex flex-col gap-4">
      <Volver href="/seguridad/perfiles" texto="Perfiles" />
      <h2 className="text-[22px] font-semibold tracking-[-0.02em]">{p.nombre}</h2>
      <Tarjeta>
        <FormularioPerfil id={p.id} textoBoton="Guardar cambios" inicial={{ nombre: p.nombre, descripcion: p.descripcion ?? "", activo: p.activo, esAdministrador: p.esAdministrador, permisos: p.permisos.map((x) => x.permiso) }} />
      </Tarjeta>
    </div>
  );
}
