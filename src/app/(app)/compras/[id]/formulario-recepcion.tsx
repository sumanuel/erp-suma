"use client";

import { useState, useTransition } from "react";
import { Aviso, Tarjeta, clasesBoton, claseControl } from "@/components/ui";
import { recibirOrdenCompra } from "../acciones";
import { formatoCantidad } from "../formato";

export type LineaPendiente = { id: string; productoCodigo: string; descripcion: string; pedida: number; recibida: number };

export function FormularioRecepcion({ ordenId, lineas, almacenes }: { ordenId: string; lineas: LineaPendiente[]; almacenes: { valor: string; etiqueta: string }[] }) {
  const [almacenId, setAlmacenId] = useState(almacenes.length === 1 ? almacenes[0].valor : "");
  const [documento, setDocumento] = useState("");
  const [observaciones, setObservaciones] = useState("");
  // Por defecto se propone recibir todo lo pendiente.
  const [cant, setCant] = useState<Record<string, string>>(() => Object.fromEntries(lineas.map((l) => [l.id, String(Math.round((l.pedida - l.recibida) * 10000) / 10000)])));
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function enviar() {
    setError(null);
    iniciar(async () => {
      const r = await recibirOrdenCompra(ordenId, {
        almacenId, documento, observaciones,
        lineas: lineas.map((l) => ({ ordenLineaId: l.id, cantidad: Number((cant[l.id] ?? "0").replace(",", ".")) || 0 })),
      });
      if (r?.error) setError(r.error);
    });
  }

  return (
    <Tarjeta className="p-6">
      <h2 className="mb-4 text-base font-semibold">Registrar recepción</h2>
      <form onSubmit={(e) => { e.preventDefault(); enviar(); }} className="flex flex-col gap-4">
        {error ? <Aviso tono="error">{error}</Aviso> : null}
        <div className="grid gap-4 md:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="almacenId" className="text-[13px] font-medium">Almacén de destino</label>
            <select id="almacenId" value={almacenId} onChange={(e) => setAlmacenId(e.target.value)} required className={`${claseControl} pr-9`}>
              <option value="">Elegir…</option>
              {almacenes.map((a) => <option key={a.valor} value={a.valor}>{a.etiqueta}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="documento" className="text-[13px] font-medium">Factura o guía del proveedor</label>
            <input id="documento" value={documento} onChange={(e) => setDocumento(e.target.value)} maxLength={60} className={claseControl} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="obs-recepcion" className="text-[13px] font-medium">Observaciones</label>
            <input id="obs-recepcion" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} maxLength={1000} className={claseControl} />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13.5px]">
            <thead>
              <tr className="border-y border-linea text-[12.5px] text-gris-600">
                <th className="px-2 py-3 font-medium">Producto</th><th className="px-2 py-3 text-right font-medium">Pendiente</th><th className="px-2 py-3 text-right font-medium">Recibir ahora</th>
              </tr>
            </thead>
            <tbody>
              {lineas.map((l) => (
                <tr key={l.id} className="border-b border-linea last:border-0">
                  <td className="px-2 py-2"><span className="font-semibold">{l.productoCodigo}</span> · {l.descripcion}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatoCantidad(l.pedida - l.recibida)}</td>
                  <td className="px-2 py-2 text-right">
                    <input aria-label={`Recibir de ${l.productoCodigo}`} inputMode="decimal" value={cant[l.id] ?? ""} onChange={(e) => setCant((c) => ({ ...c, [l.id]: e.target.value }))} className={`${claseControl} w-28 text-right`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div><button type="submit" disabled={pendiente} className={clasesBoton("primario")}>{pendiente ? "Registrando…" : "Registrar recepción"}</button></div>
      </form>
    </Tarjeta>
  );
}
