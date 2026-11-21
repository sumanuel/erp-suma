import { Tarjeta } from "@/components/ui";
import { requerirPermiso } from "@/lib/dal";
import { Volver } from "../../volver";
import { FormularioPerfil } from "../formulario";

export default async function NuevoPerfil() {
  await requerirPermiso("seguridad", "crear");
  return (
    <div className="flex flex-col gap-4">
      <Volver href="/seguridad/perfiles" texto="Perfiles" />
      <h2 className="text-[22px] font-semibold tracking-[-0.02em]">Nuevo perfil</h2>
      <Tarjeta><FormularioPerfil id={null} textoBoton="Crear perfil" inicial={{ nombre: "", descripcion: "", activo: true, esAdministrador: false, permisos: [] }} /></Tarjeta>
    </div>
  );
}
