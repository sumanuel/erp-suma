"use client";

import { useState, useTransition } from "react";
import { clasesBoton } from "@/components/ui";
import { cambiarPeriodo } from "../acciones";

/** Cierra o reabre un período contable, con confirmación. */
export function BotonPeriodo({ anio, mes, cerrado }: { anio: number; mes: number; cerrado: boolean }) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      {error ? <span role="alert" className="text-[12.5px] text-error">{error}</span> : null}
      <button
        type="button" disabled={pendiente} className={clasesBoton(cerrado ? "secundario" : "primario")}
        onClick={() => {
          if (!confirm(cerrado ? "¿Reabrir el período? Volverá a admitir asientos." : "¿Cerrar el período? Ya no admitirá asientos ni anulaciones.")) return;
          setError(null);
          iniciar(async () => setError(await cambiarPeriodo(anio, mes, !cerrado)));
        }}
      >
        {cerrado ? "Reabrir" : "Cerrar"}
      </button>
    </span>
  );
}
