"use client";

import { Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

/** Botón de baja con confirmación. `accion` devuelve un mensaje de error o null. */
export function BotonEliminar({ nombre, accion }: { nombre: string; accion: () => Promise<string | null> }) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        disabled={pendiente}
        aria-label={`Eliminar ${nombre}`}
        onClick={() => confirm(`¿Eliminar "${nombre}"? Esta acción no se puede deshacer.`) && iniciar(async () => setError(await accion()))}
        className="flex size-9 items-center justify-center rounded-[9px] border border-[#f3c7c7] text-error hover:bg-error-suave disabled:opacity-50"
      >
        <Trash2 className="size-4" aria-hidden />
      </button>
      {error ? <span role="alert" className="sr-only">{error}</span> : null}
      {error ? <span className="ml-2 text-[12.5px] text-error">{error}</span> : null}
    </>
  );
}
