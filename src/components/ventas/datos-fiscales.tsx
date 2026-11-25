"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Aviso, clasesBoton, claseControl } from "@/components/ui";
import type { FiscalesActuales } from "@/lib/documentos-fiscales";

export type SerieImpresora = { id: string; etiqueta: string; serial: string; modelo: string };

const CAMPOS = [
  ["numeroFiscal", "Nº fiscal del documento", 30], ["numeroControl", "Nº de control", 30],
  ["impresoraSerial", "Serial de la impresora", 30], ["impresoraModelo", "Modelo de la impresora", 60],
] as const;

/**
 * Registro de los datos que dejó la máquina fiscal o la imprenta en una factura o nota: solo se piden los que faltan y cada uno se escribe
 * una sola vez. Elegir una serie fiscal llena el serial y el modelo.
 */
export function DatosFiscales({ valores, series, accion }: { valores: FiscalesActuales; series: SerieImpresora[]; accion: (datos: unknown) => Promise<string | null> }) {
  const [nuevos, setNuevos] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();
  const faltan = CAMPOS.filter(([c]) => !valores[c]);
  if (faltan.length === 0) return null;
  const faltaImpresora = !valores.impresoraSerial || !valores.impresoraModelo;
  const hayAlgo = faltan.some(([c]) => nuevos[c]?.trim());

  function elegirSerie(id: string) {
    const s = series.find((x) => x.id === id);
    if (!s) return;
    setNuevos((n) => ({ ...n, ...(valores.impresoraSerial ? {} : { impresoraSerial: s.serial }), ...(valores.impresoraModelo ? {} : { impresoraModelo: s.modelo }) }));
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        iniciar(async () => {
          const r = await accion(Object.fromEntries(faltan.map(([c]) => [c, nuevos[c] ?? ""])));
          if (r) setError(r);
          else {
            setNuevos({});
            router.refresh();
          }
        });
      }}
      className="flex flex-wrap items-end gap-3 border-t border-linea pt-4"
    >
      {error ? <div className="basis-full"><Aviso tono="error">{error}</Aviso></div> : null}
      {series.length > 0 && faltaImpresora ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="serieImpresora" className="text-[13px] font-medium">Impresora (serie fiscal)</label>
          <select id="serieImpresora" defaultValue="" onChange={(e) => elegirSerie(e.target.value)} className={`${claseControl} w-56 pr-9`}>
            <option value="">Elegir para llenar…</option>
            {series.map((s) => <option key={s.id} value={s.id}>{s.etiqueta}</option>)}
          </select>
        </div>
      ) : null}
      {faltan.map(([campo, etiqueta, max]) => (
        <div key={campo} className="flex flex-col gap-1.5">
          <label htmlFor={campo} className="text-[13px] font-medium">{etiqueta}</label>
          <input id={campo} value={nuevos[campo] ?? ""} onChange={(e) => setNuevos((n) => ({ ...n, [campo]: e.target.value }))} maxLength={max} className={`${claseControl} w-48`} />
        </div>
      ))}
      <button data-guardar type="submit" disabled={pendiente || !hayAlgo} className={clasesBoton("secundario")}>{pendiente ? "Guardando…" : "Registrar datos fiscales"}</button>
      <p className="basis-full text-[12.5px] text-gris-500">Cada dato se registra una sola vez y no se puede cambiar. Los números salen en el libro de ventas.</p>
    </form>
  );
}
