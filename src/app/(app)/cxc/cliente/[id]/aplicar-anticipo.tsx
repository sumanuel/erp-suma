"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Aviso, clasesBoton, claseControl } from "@/components/ui";
import { anularAplicacionAnticipoCliente, aplicarAnticipoCliente } from "../../acciones";

type Anticipo = { id: string; numero: string; saldo: number };
type Factura = { id: string; numero: string; saldo: number };
type Aplicacion = { id: string; numero: string; cobro: string; factura: string; monto: number; fecha: string };

const fmt = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const num = (s: string) => {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Saldo a favor del cliente: aplicar un anticipo a sus facturas abiertas y deshacer aplicaciones anteriores. */
export function AplicarAnticipo({ clienteId, anticipos, facturas, aplicaciones, puedeAnular }: { clienteId: string; anticipos: Anticipo[]; facturas: Factura[]; aplicaciones: Aplicacion[]; puedeAnular: boolean }) {
  const [cobroId, setCobroId] = useState(anticipos[0]?.id ?? "");
  const [montos, setMontos] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();
  const anticipo = anticipos.find((a) => a.id === cobroId);
  const total = Math.round(facturas.reduce((s, f) => s + num(montos[f.id] ?? ""), 0) * 10000) / 10000;

  function aplicar() {
    setError(null);
    iniciar(async () => {
      const r = await aplicarAnticipoCliente(cobroId, clienteId, facturas.map((f) => ({ facturaId: f.id, montoUsd: num(montos[f.id] ?? "") })).filter((a) => a.montoUsd > 0));
      if (r.error) setError(r.error);
      else {
        setMontos({});
        router.refresh();
      }
    });
  }
  function anular(id: string) {
    const motivo = prompt("Motivo de la anulación:");
    if (!motivo) return;
    setError(null);
    iniciar(async () => {
      const r = await anularAplicacionAnticipoCliente(id, clienteId, motivo);
      if (r.error) setError(r.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {error ? <Aviso tono="error">{error}</Aviso> : null}
      {anticipos.length > 0 && facturas.length > 0 ? (
        <form onSubmit={(e) => { e.preventDefault(); aplicar(); }} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="anticipo" className="text-[13px] font-medium">Anticipo a aplicar</label>
              <select id="anticipo" value={cobroId} onChange={(e) => setCobroId(e.target.value)} className={`${claseControl} w-72 pr-9`}>
                {anticipos.map((a) => <option key={a.id} value={a.id}>{a.numero} · disponible {fmt(a.saldo)} USD</option>)}
              </select>
            </div>
          </div>
          <table className="w-full max-w-2xl text-left text-[13.5px]">
            <thead><tr className="border-y border-linea text-[12.5px] text-gris-600"><th className="py-2 font-medium">Factura</th><th className="py-2 text-right font-medium">Saldo USD</th><th className="py-2 text-right font-medium">Aplicar USD</th></tr></thead>
            <tbody>
              {facturas.map((f) => (
                <tr key={f.id} className="border-b border-linea last:border-0">
                  <td className="py-2 font-semibold">{f.numero}</td>
                  <td className="py-2 text-right tabular-nums">{fmt(f.saldo)}</td>
                  <td className="py-2">
                    <div className="flex items-center justify-end gap-2">
                      <button type="button" onClick={() => setMontos((m) => ({ ...m, [f.id]: String(Math.min(f.saldo, anticipo?.saldo ?? f.saldo)) }))} className="text-[12.5px] text-marca-texto hover:underline">Máximo</button>
                      <input aria-label={`Aplicar anticipo a ${f.numero}`} inputMode="decimal" value={montos[f.id] ?? ""} onChange={(e) => setMontos((m) => ({ ...m, [f.id]: e.target.value }))} className={`${claseControl} w-32 text-right`} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center gap-4">
            <button type="submit" disabled={pendiente || total <= 0} className={clasesBoton("primario")}>{pendiente ? "Aplicando…" : "Aplicar anticipo"}</button>
            <span className="text-[13.5px] text-gris-600">Total a aplicar: <span className="font-semibold tabular-nums">{fmt(total)}</span> USD</span>
          </div>
        </form>
      ) : anticipos.length > 0 ? <p className="text-sm text-gris-500">El cliente no tiene facturas abiertas a las que aplicar el anticipo.</p> : null}
      {aplicaciones.length > 0 ? (
        <table className="w-full text-left text-[13.5px]">
          <thead><tr className="border-y border-linea text-[12.5px] text-gris-600"><th className="py-2 font-medium">Aplicación</th><th className="py-2 font-medium">Fecha</th><th className="py-2 font-medium">Anticipo</th><th className="py-2 font-medium">Factura</th><th className="py-2 text-right font-medium">USD</th><th className="py-2" /></tr></thead>
          <tbody>
            {aplicaciones.map((a) => (
              <tr key={a.id} className="border-b border-linea last:border-0">
                <td className="py-2 font-semibold">{a.numero}</td><td className="py-2">{a.fecha}</td><td className="py-2">{a.cobro}</td><td className="py-2">{a.factura}</td><td className="py-2 text-right tabular-nums">{fmt(a.monto)}</td>
                <td className="py-2 text-right">{puedeAnular ? <button type="button" disabled={pendiente} onClick={() => anular(a.id)} className="text-[13px] text-error hover:underline">Anular</button> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
