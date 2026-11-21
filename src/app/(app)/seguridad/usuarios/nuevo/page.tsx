import { Tarjeta } from "@/components/ui";
import { requerirPermiso } from "@/lib/dal";
import { Volver } from "../../volver";
import { FormularioUsuario } from "../formulario";

export default async function NuevoUsuario() {
  const { db } = await requerirPermiso("seguridad", "crear");
  const perfiles = await db.perfil.findMany({ where: { activo: true }, orderBy: { nombre: "asc" } });
  return (
    <div className="flex flex-col gap-4">
      <Volver href="/seguridad/usuarios" texto="Usuarios" />
      <h2 className="text-[22px] font-semibold tracking-[-0.02em]">Nuevo usuario</h2>
      <Tarjeta>
        <FormularioUsuario id={null} textoBoton="Crear usuario" perfiles={perfiles.map((p) => ({ valor: p.id, etiqueta: p.nombre }))} inicial={{ nombre: "", email: "", perfilId: "", activo: true }} />
      </Tarjeta>
    </div>
  );
}
