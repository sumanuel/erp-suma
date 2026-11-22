"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Aviso, clasesBoton } from "@/components/ui";
import { cerrarEjercicioContable, reabrirEjercicioContable } from "../acciones";

export function BotonesCierre({ anio, cerrado, puedeCerrar, puedeReabrir }: { anio: number; cerrado: boolean; puedeCerrar: boolean; puedeReabrir: boolean }) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const correr = (f: () => Promise<string | null>) => {
    setError(null);
    iniciar(async () => {
      const e = await f();
      if (e) setError(e);
      else router.refresh();
    });
  };
  return (
    <div className="flex flex-col items-end gap-2">
      {error ? <Aviso tono="error">{error}</Aviso> : null}
      {!cerrado && puedeCerrar ? (
        <button type="button" disabled={pendiente} onClick={() => confirm(`¿Cerrar el ejercicio ${anio}? Se genera el asiento de cierre al 31/12/${anio} y se cierran los 12 períodos del año.`) && correr(() => cerrarEjercicioContable(anio))} className={clasesBoton("primario")}>Cerrar ejercicio {anio}</button>
      ) : null}
      {cerrado && puedeReabrir ? (
        <button type="button" disabled={pendiente} onClick={() => { const m = prompt(`Motivo de la reapertura del ejercicio ${anio}:`); if (m) correr(() => reabrirEjercicioContable(anio, m)); }} className={clasesBoton("peligro")}>Reabrir ejercicio {anio}</button>
      ) : null}
    </div>
  );
}
