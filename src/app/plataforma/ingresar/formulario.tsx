"use client";

import { useActionState } from "react";
import { Aviso, Campo, clasesBoton } from "@/components/ui";
import { ingresarPlataforma, type Estado } from "../acciones";

export function FormularioPlataforma() {
  const [estado, accion, pendiente] = useActionState<Estado, FormData>(ingresarPlataforma, {});
  return (
    <form action={accion} className="mt-6 flex flex-col gap-4">
      {estado.error ? <Aviso tono="error">{estado.error}</Aviso> : null}
      <Campo etiqueta="Correo" name="email" type="email" autoComplete="username" required autoFocus />
      <Campo etiqueta="Contraseña" name="contrasena" type="password" autoComplete="current-password" required />
      <button type="submit" disabled={pendiente} className={clasesBoton("primario", "mt-2 w-full")}>{pendiente ? "Ingresando…" : "Ingresar"}</button>
    </form>
  );
}
