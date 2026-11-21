"use client";

import { useActionState } from "react";
import { Aviso, clasesBoton } from "@/components/ui";
import { MODULOS } from "@/lib/modulos";
import { guardarModulos, type Estado } from "../../acciones";

export function FormularioModulos({ slug, apagados }: { slug: string; apagados: string[] }) {
  const [estado, accion, pendiente] = useActionState<Estado, FormData>(guardarModulos.bind(null, slug), {});
  return (
    <form action={accion} className="flex flex-col gap-4 p-5">
      {estado.error ? <Aviso tono="error">{estado.error}</Aviso> : estado.ok ? <Aviso tono="exito">{estado.ok}</Aviso> : null}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {MODULOS.map((m) => (
          <label key={m.id} className="flex items-center gap-2.5 rounded-[10px] border border-borde px-3 py-2.5 text-sm">
            <input type="checkbox" name="modulo" value={m.id} defaultChecked={!apagados.includes(m.id)} disabled={m.id === "seguridad"} className="size-4 accent-marca-fuerte" />
            {m.id === "seguridad" ? <input type="hidden" name="modulo" value="seguridad" /> : null}
            {m.nombre}
          </label>
        ))}
      </div>
      <div><button type="submit" disabled={pendiente} className={clasesBoton("primario")}>{pendiente ? "Guardando…" : "Guardar módulos"}</button></div>
    </form>
  );
}
