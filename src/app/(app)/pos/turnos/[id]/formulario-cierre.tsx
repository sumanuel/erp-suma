"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Aviso, Tarjeta, clasesBoton, claseControl } from "@/components/ui";
import { cerrarTurnoCaja } from "../../acciones";

const num = (s: string) => {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/** Cierre de caja: el cajero cuenta el efectivo de cada moneda; el sistema compara con lo que debía haber y deja la diferencia anotada. */
export function FormularioCierre({ turnoId }: { turnoId: string }) {
  const router = useRouter();
  const [contadoVes, setContadoVes] = useState("");
  const [contadoUsd, setContadoUsd] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function cerrar() {
    setError(null);
    iniciar(async () => {
      const r = await cerrarTurnoCaja(turnoId, { contadoVes: num(contadoVes), contadoUsd: num(contadoUsd), observaciones: observaciones.trim() || null });
      if (r.error) setError(r.error);
      else router.refresh();
    });
  }
  return (
    <Tarjeta className="p-6">
      <h3 className="mb-4 text-[13px] font-semibold uppercase tracking-wide text-gris-600">Cerrar caja</h3>
      {error ? <div className="mb-4"><Aviso tono="error">{error}</Aviso></div> : null}
      <form onSubmit={(e) => { e.preventDefault(); cerrar(); }} className="grid gap-4 md:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="contadoVes" className="text-[13px] font-medium">Efectivo contado en bolívares</label>
          <input id="contadoVes" inputMode="decimal" value={contadoVes} onChange={(e) => setContadoVes(e.target.value)} required className={claseControl} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="contadoUsd" className="text-[13px] font-medium">Efectivo contado en dólares</label>
          <input id="contadoUsd" inputMode="decimal" value={contadoUsd} onChange={(e) => setContadoUsd(e.target.value)} required className={claseControl} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="observaciones" className="text-[13px] font-medium">Observaciones <span className="font-normal text-gris-500">(opcional)</span></label>
          <input id="observaciones" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} maxLength={500} className={claseControl} />
        </div>
        <div className="md:col-span-3"><button type="submit" disabled={pendiente} className={clasesBoton("primario")}>{pendiente ? "Cerrando…" : "Cerrar caja"}</button></div>
      </form>
      <p className="mt-3 text-[12.5px] text-gris-500">Cuenta primero el efectivo; al cerrar se anota la diferencia contra lo que debía haber y el turno ya no admite ventas.</p>
    </Tarjeta>
  );
}
