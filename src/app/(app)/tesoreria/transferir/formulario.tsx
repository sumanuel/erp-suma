"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Aviso, Tarjeta, clasesBoton, claseControl } from "@/components/ui";
import { transferirEntreCuentas } from "../acciones";

const num = (s: string) => {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/** Transferencia entre dos cuentas de la misma moneda. El destino solo ofrece cuentas de la moneda del origen. */
export function FormularioTransferencia({ cuentas }: { cuentas: { id: string; moneda: string; etiqueta: string }[] }) {
  const [origenId, setOrigenId] = useState("");
  const [destinoId, setDestinoId] = useState("");
  const [monto, setMonto] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const moneda = cuentas.find((c) => c.id === origenId)?.moneda;
  const destinos = cuentas.filter((c) => c.id !== origenId && c.moneda === moneda);

  function guardar() {
    setError(null);
    iniciar(async () => {
      const r = await transferirEntreCuentas({ origenId, destinoId, monto: num(monto), descripcion });
      if (r?.error) setError(r.error);
    });
  }
  return (
    <form onSubmit={(e) => { e.preventDefault(); guardar(); }} className="flex flex-col gap-6">
      {error ? <Aviso tono="error">{error}</Aviso> : null}
      <Tarjeta className="p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="origenId" className="text-[13px] font-medium">Cuenta de origen</label>
            <select id="origenId" value={origenId} onChange={(e) => { setOrigenId(e.target.value); setDestinoId(""); }} required className={`${claseControl} pr-9`}>
              <option value="">Elegir…</option>
              {cuentas.map((c) => <option key={c.id} value={c.id}>{c.etiqueta}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="destinoId" className="text-[13px] font-medium">Cuenta de destino</label>
            <select id="destinoId" value={destinoId} onChange={(e) => setDestinoId(e.target.value)} required disabled={!origenId} className={`${claseControl} pr-9`}>
              <option value="">Elegir…</option>
              {destinos.map((c) => <option key={c.id} value={c.id}>{c.etiqueta}</option>)}
            </select>
            {origenId && destinos.length === 0 ? <p className="text-[12.5px] text-gris-500">No hay otra cuenta activa en {moneda}.</p> : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="monto" className="text-[13px] font-medium">Monto{moneda ? ` (${moneda})` : ""}</label>
            <input id="monto" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} required className={claseControl} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="descripcion" className="text-[13px] font-medium">Concepto (opcional)</label>
            <input id="descripcion" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={200} className={claseControl} />
          </div>
        </div>
        <p className="mt-3 text-[12.5px] text-gris-500">Solo entre cuentas de la misma moneda. El cambio de divisas aún no está disponible.</p>
      </Tarjeta>
      <div className="flex items-center gap-3">
        <button data-guardar type="submit" disabled={pendiente} className={clasesBoton("primario")}>{pendiente ? "Transfiriendo…" : "Transferir"}</button>
        <Link data-salir href="/tesoreria" className="px-2 text-sm text-gris-700 hover:text-tinta">Cancelar</Link>
      </div>
    </form>
  );
}
