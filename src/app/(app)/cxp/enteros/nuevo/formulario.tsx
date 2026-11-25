"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Aviso, Tarjeta, clasesBoton, claseControl } from "@/components/ui";
import { enterarRetencionesFisco } from "../../acciones";

const fmt = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Pago al fisco de retenciones practicadas del mismo impuesto: se eligen los comprobantes y la cuenta en bolívares de la que se paga. */
export function FormularioEntero({ tipo, retenciones, cuentas }: {
  tipo: "IVA" | "ISLR"; retenciones: { id: string; comprobante: string; fecha: string; proveedor: string; factura: string; montoBs: number }[]; cuentas: { valor: string; etiqueta: string }[];
}) {
  const [elegidas, setElegidas] = useState<Set<string>>(new Set(retenciones.map((r) => r.id)));
  const [cuentaId, setCuentaId] = useState(cuentas.length === 1 ? cuentas[0].valor : "");
  const [referencia, setReferencia] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const total = Math.round(retenciones.filter((r) => elegidas.has(r.id)).reduce((s, r) => s + r.montoBs, 0) * 100) / 100;
  const alternar = (id: string) => setElegidas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (!confirm(`¿Registrar el pago de Bs. ${fmt(total)} al fisco por retenciones de ${tipo}? Saldrá de la cuenta elegida.`)) return;
        iniciar(async () => { const r = await enterarRetencionesFisco({ tipo, retencionIds: [...elegidas], cuentaId, referencia }); if (r?.error) setError(r.error); });
      }}
      className="flex flex-col gap-6"
    >
      {error ? <Aviso tono="error">{error}</Aviso> : null}
      <Tarjeta className="p-6">
        <h2 className="text-lg font-semibold">Enterar retenciones de {tipo} al fisco</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="cuentaId" className="text-[13px] font-medium">Cuenta de la que se paga (en bolívares)</label>
            <select id="cuentaId" value={cuentaId} onChange={(e) => setCuentaId(e.target.value)} required className={`${claseControl} pr-9`}><option value="">Elegir…</option>{cuentas.map((c) => <option key={c.valor} value={c.valor}>{c.etiqueta}</option>)}</select>
            {cuentas.length === 0 ? <p className="text-[12.5px] text-error">No hay una cuenta activa en bolívares: créala en Tesorería.</p> : null}
          </div>
          <div className="flex flex-col gap-1.5"><label htmlFor="referencia" className="text-[13px] font-medium">Planilla o referencia del pago</label><input id="referencia" value={referencia} onChange={(e) => setReferencia(e.target.value)} maxLength={100} className={claseControl} /></div>
        </div>
      </Tarjeta>
      <Tarjeta>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13.5px]">
            <thead><tr className="border-b border-linea text-[12.5px] text-gris-600"><th className="px-4 py-3"><span className="sr-only">Elegir</span></th><th className="px-3 py-3 font-medium">Comprobante</th><th className="px-3 py-3 font-medium">Fecha</th><th className="px-3 py-3 font-medium">Proveedor</th><th className="px-3 py-3 font-medium">Factura</th><th className="px-4 py-3 text-right font-medium">Retenido Bs.</th></tr></thead>
            <tbody>
              {retenciones.map((r) => (
                <tr key={r.id} className="border-b border-linea last:border-0">
                  <td className="px-4 py-3"><input type="checkbox" aria-label={`Enterar ${r.comprobante}`} checked={elegidas.has(r.id)} onChange={() => alternar(r.id)} className="size-4 accent-marca-fuerte" /></td>
                  <td className="px-3 py-3 font-semibold">{r.comprobante}</td>
                  <td className="px-3 py-3">{r.fecha.split("-").reverse().join("/")}</td>
                  <td className="px-3 py-3">{r.proveedor}</td>
                  <td className="px-3 py-3">{r.factura}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(r.montoBs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="ml-auto flex w-full max-w-xs flex-col gap-1 p-4 text-[13.5px]"><div className="flex justify-between border-t border-linea pt-1 text-[15px] font-semibold"><dt>Total a pagar Bs.</dt><dd className="tabular-nums">{fmt(total)}</dd></div></dl>
      </Tarjeta>
      <div className="flex items-center gap-3">
        <button data-guardar="propio" type="submit" disabled={pendiente || elegidas.size === 0} className={clasesBoton("primario")}>{pendiente ? "Registrando…" : "Registrar pago al fisco"}</button>
        <Link data-salir href="/cxp/enteros" className="px-2 text-sm text-gris-700 hover:text-tinta">Cancelar</Link>
      </div>
    </form>
  );
}
