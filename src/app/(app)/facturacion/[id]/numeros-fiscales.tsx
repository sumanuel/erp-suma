"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Aviso, clasesBoton, claseControl } from "@/components/ui";
import { registrarNumerosFiscalesFactura } from "../acciones";

/** Registro del número de factura fiscal y del número de control (una sola vez; después quedan fijos y salen en el libro de ventas). */
export function NumerosFiscales({ id, fiscal, control }: { id: string; fiscal: string | null; control: string | null }) {
  const [f, setF] = useState("");
  const [c, setC] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();
  if (fiscal && control) return null;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        iniciar(async () => {
          const r = await registrarNumerosFiscalesFactura(id, { numeroFiscal: fiscal ? "" : f, numeroControl: control ? "" : c });
          if (r) setError(r);
          else router.refresh();
        });
      }}
      className="flex flex-wrap items-end gap-3 border-t border-linea pt-4"
    >
      {error ? <div className="basis-full"><Aviso tono="error">{error}</Aviso></div> : null}
      {fiscal ? null : <div className="flex flex-col gap-1.5"><label htmlFor="numeroFiscal" className="text-[13px] font-medium">Nº de factura fiscal</label><input id="numeroFiscal" value={f} onChange={(e) => setF(e.target.value)} maxLength={30} className={`${claseControl} w-48`} /></div>}
      {control ? null : <div className="flex flex-col gap-1.5"><label htmlFor="numeroControl" className="text-[13px] font-medium">Nº de control</label><input id="numeroControl" value={c} onChange={(e) => setC(e.target.value)} maxLength={30} className={`${claseControl} w-48`} /></div>}
      <button type="submit" disabled={pendiente || (!f.trim() && !c.trim())} className={clasesBoton("secundario")}>{pendiente ? "Guardando…" : "Registrar números"}</button>
      <p className="basis-full text-[12.5px] text-gris-500">Cada número se registra una sola vez y no se puede cambiar. Salen en el libro de ventas.</p>
    </form>
  );
}
