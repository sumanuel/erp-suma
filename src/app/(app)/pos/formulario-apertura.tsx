"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Aviso, Tarjeta, clasesBoton, claseControl } from "@/components/ui";
import { abrirTurnoCaja } from "./acciones";

const num = (s: string) => {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
type Opc = { valor: string; etiqueta: string };

/** Abrir turno: el cajero elige el almacén y las cajas (una en Bs. y una en USD) y declara el efectivo con que empieza. */
export function FormularioApertura({ almacenes, cajasVes, cajasUsd, puedeAbrir }: { almacenes: Opc[]; cajasVes: Opc[]; cajasUsd: Opc[]; puedeAbrir: boolean }) {
  const router = useRouter();
  const [almacenId, setAlmacenId] = useState(almacenes.length === 1 ? almacenes[0].valor : "");
  const [cajaVesId, setCajaVesId] = useState(cajasVes.length === 1 ? cajasVes[0].valor : "");
  const [cajaUsdId, setCajaUsdId] = useState(cajasUsd.length === 1 ? cajasUsd[0].valor : "");
  const [fondoVes, setFondoVes] = useState("0");
  const [fondoUsd, setFondoUsd] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function abrir() {
    setError(null);
    iniciar(async () => {
      const r = await abrirTurnoCaja({ almacenId, cajaVesId, cajaUsdId, fondoVes: num(fondoVes), fondoUsd: num(fondoUsd) });
      if (r.error) setError(r.error);
      else router.refresh();
    });
  }
  const sel = (id: string, etiqueta: string, valor: string, set: (v: string) => void, opciones: Opc[]) => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium">{etiqueta}</label>
      <select id={id} value={valor} onChange={(e) => set(e.target.value)} required className={`${claseControl} pr-9`}>
        <option value="">Elegir…</option>
        {opciones.map((o) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
      </select>
    </div>
  );
  return (
    <form onSubmit={(e) => { e.preventDefault(); abrir(); }} className="flex max-w-3xl flex-col gap-5">
      <Aviso tono="marca">No tienes un turno abierto. Ábrelo para empezar a vender: el efectivo de tus ventas entrará a las cajas que elijas.</Aviso>
      {error ? <Aviso tono="error">{error}</Aviso> : null}
      <Tarjeta className="p-6">
        <div className="grid gap-4 md:grid-cols-2">
          {sel("almacenId", "Almacén de salida", almacenId, setAlmacenId, almacenes)}
          <div className="hidden md:block" />
          {sel("cajaVesId", "Caja en bolívares", cajaVesId, setCajaVesId, cajasVes)}
          {sel("cajaUsdId", "Caja en dólares", cajaUsdId, setCajaUsdId, cajasUsd)}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="fondoVes" className="text-[13px] font-medium">Fondo inicial en bolívares</label>
            <input id="fondoVes" inputMode="decimal" value={fondoVes} onChange={(e) => setFondoVes(e.target.value)} className={claseControl} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="fondoUsd" className="text-[13px] font-medium">Fondo inicial en dólares</label>
            <input id="fondoUsd" inputMode="decimal" value={fondoUsd} onChange={(e) => setFondoUsd(e.target.value)} className={claseControl} />
          </div>
        </div>
        <p className="mt-3 text-[12.5px] text-gris-500">El fondo es el efectivo que ya está en la caja al empezar; sirve de base para el cuadre al cerrar.</p>
      </Tarjeta>
      <div><button data-guardar type="submit" disabled={pendiente || !puedeAbrir} className={clasesBoton("primario")}>{pendiente ? "Abriendo…" : "Abrir turno"}</button></div>
    </form>
  );
}
