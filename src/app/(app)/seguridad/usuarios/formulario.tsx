"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Aviso, Campo, Selector, clasesBoton } from "@/components/ui";
import { guardarUsuario, type EstadoUsuario } from "./acciones";

export type DatosUsuario = { nombre: string; email: string; perfilId: string; activo: boolean };

export function FormularioUsuario({ id, inicial, perfiles, textoBoton }: {
  id: string | null; inicial: DatosUsuario; perfiles: { valor: string; etiqueta: string }[]; textoBoton: string;
}) {
  const [estado, accion, pendiente] = useActionState<EstadoUsuario, FormData>(guardarUsuario.bind(null, id), {});
  const e = estado.errores ?? {};
  return (
    <form action={accion} className="flex flex-col gap-6 p-6">
      {estado.error ? <Aviso tono="error">{estado.error}</Aviso> : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Campo etiqueta="Nombre" name="nombre" defaultValue={inicial.nombre} error={e.nombre} />
        <Campo etiqueta="Correo" name="email" type="email" defaultValue={inicial.email} error={e.email} autoComplete="off" />
        <Selector nombre="perfilId" etiqueta="Perfil" opciones={perfiles} valor={inicial.perfilId} error={e.perfilId} />
        <Campo
          etiqueta={id ? "Contraseña nueva (opcional)" : "Contraseña"} name="contrasena" type="password" autoComplete="new-password" error={e.contrasena}
          ayuda={id ? "Déjala vacía para conservar la actual. Si la cambias, se cierran sus sesiones." : "Mínimo 10 caracteres, con letras y números."}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="activo" defaultChecked={inicial.activo} className="size-4 accent-marca-fuerte" /> Usuario activo
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pendiente} className={clasesBoton("primario")}>{pendiente ? "Guardando…" : textoBoton}</button>
        <Link href="/seguridad/usuarios" className="px-2 text-sm text-gris-700 hover:text-tinta">Cancelar</Link>
      </div>
    </form>
  );
}
