"use client";

import { useActionState } from "react";
import { Aviso, Campo, clasesBoton } from "@/components/ui";
import { cambiar, type Estado } from "./acciones";

export function Formulario() {
  const [estado, accion, pendiente] = useActionState<Estado, FormData>(cambiar, {});
  return (
    <form action={accion} className="mt-6 flex flex-col gap-4">
      {estado.error ? <Aviso tono="error">{estado.error}</Aviso> : null}
      <Campo etiqueta="Contraseña actual" name="actual" type="password" autoComplete="current-password" required />
      <Campo etiqueta="Contraseña nueva" name="nueva" type="password" autoComplete="new-password" required />
      <button type="submit" disabled={pendiente} className={clasesBoton("primario", "mt-2 w-full")}>{pendiente ? "Guardando…" : "Cambiar contraseña"}</button>
    </form>
  );
}
