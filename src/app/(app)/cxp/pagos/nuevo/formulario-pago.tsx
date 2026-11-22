"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Aviso, Tarjeta, clasesBoton, claseControl } from "@/components/ui";
import { FORMAS_PAGO } from "@/lib/cxp/estados";
import { registrarPagoProveedor } from "../../acciones";

type FacturaAbierta = { id: string; numero: string; vence: string; saldo: number };

const fmt = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const num = (s: string) => {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Reparte un pago entre las facturas abiertas del proveedor. Lo aplicado se lleva en USD; si paga en Bs., se muestra el equivalente con la tasa de hoy. */
export function FormularioPago({ proveedorId, proveedorNombre, facturas, tasa, cuentas }: { proveedorId: string; proveedorNombre: string; facturas: FacturaAbierta[]; tasa: number | null; cuentas: { id: string; moneda: "USD" | "VES"; etiqueta: string }[] }) {
  const [montos, setMontos] = useState<Record<string, string>>({});
  const [formaPago, setFormaPago] = useState("TRANSFERENCIA");
  const [moneda, setMoneda] = useState<"USD" | "VES">("USD");
  const [cuentaId, setCuentaId] = useState("");
  const [referencia, setReferencia] = useState("");
  const [portador, setPortador] = useState("");
  const [comprobante, setComprobante] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  const total = Math.round(facturas.reduce((s, f) => s + num(montos[f.id] ?? ""), 0) * 10000) / 10000;
  const enBs = tasa ? Math.round(total * tasa * 100) / 100 : null;

  function guardar() {
    setError(null);
    iniciar(async () => {
      const r = await registrarPagoProveedor({
        proveedorId, formaPago, moneda, cuentaId, referencia, observaciones, comprobante, ...(formaPago === "CHEQUE" ? { portador } : {}),
        aplicaciones: facturas.map((f) => ({ facturaId: f.id, montoUsd: num(montos[f.id] ?? "") })).filter((a) => a.montoUsd > 0),
      });
      if (r?.error) setError(r.error);
    });
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); guardar(); }} className="flex flex-col gap-6">
      {error ? <Aviso tono="error">{error}</Aviso> : null}
      <Tarjeta className="p-6">
        <p className="mb-4 text-sm text-gris-600">Proveedor: <span className="font-semibold text-tinta">{proveedorNombre}</span></p>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="formaPago" className="text-[13px] font-medium">Forma de pago</label>
            <select id="formaPago" value={formaPago} onChange={(e) => setFormaPago(e.target.value)} className={`${claseControl} pr-9`}>
              {Object.entries(FORMAS_PAGO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="moneda" className="text-[13px] font-medium">Moneda en que se pagó</label>
            <select id="moneda" value={moneda} onChange={(e) => { setMoneda(e.target.value as "USD" | "VES"); setCuentaId(""); }} className={`${claseControl} pr-9`}>
              <option value="USD">Dólares (USD)</option>
              <option value="VES" disabled={!tasa}>Bolívares (Bs.){tasa ? "" : " — sin tasa cargada"}</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <label htmlFor="cuentaId" className="text-[13px] font-medium">Cuenta de la que sale el dinero</label>
            <select id="cuentaId" value={cuentaId} onChange={(e) => setCuentaId(e.target.value)} required className={`${claseControl} pr-9`}>
              <option value="">Elegir…</option>
              {cuentas.filter((c) => c.moneda === moneda).map((c) => <option key={c.id} value={c.id}>{c.etiqueta}</option>)}
            </select>
            {cuentas.every((c) => c.moneda !== moneda) ? <p className="text-[12.5px] text-error">No hay una cuenta activa en esta moneda: créala en Tesorería.</p> : null}
          </div>
          {formaPago === "CHEQUE" ? (
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label htmlFor="portador" className="text-[13px] font-medium">Cheque a nombre de <span className="font-normal text-gris-500">(opcional: el proveedor)</span></label>
              <input id="portador" value={portador} onChange={(e) => setPortador(e.target.value)} maxLength={120} className={claseControl} />
              <p className="text-[12.5px] text-gris-500">El número sale solo de la chequera activa de la cuenta.</p>
            </div>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="comprobante" className="text-[13px] font-medium">Comprobante de egreso <span className="font-normal text-gris-500">(opcional)</span></label>
            <input id="comprobante" value={comprobante} onChange={(e) => setComprobante(e.target.value)} maxLength={50} className={claseControl} />
          </div>
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <label htmlFor="referencia" className="text-[13px] font-medium">Referencia (banco, nº de operación)</label>
            <input id="referencia" value={referencia} onChange={(e) => setReferencia(e.target.value)} maxLength={100} className={claseControl} />
          </div>
          <div className="flex flex-col gap-1.5 md:col-span-2 xl:col-span-4">
            <label htmlFor="observaciones" className="text-[13px] font-medium">Observaciones</label>
            <input id="observaciones" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} maxLength={1000} className={claseControl} />
          </div>
        </div>
      </Tarjeta>

      <Tarjeta>
        <h3 className="px-4 pt-4 text-base font-semibold">Aplicar a facturas</h3>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full text-left text-[13.5px]">
            <thead>
              <tr className="border-y border-linea text-[12.5px] text-gris-600">
                <th className="px-4 py-3 font-medium">Factura</th><th className="px-3 py-3 font-medium">Vence</th><th className="px-3 py-3 text-right font-medium">Saldo USD</th><th className="px-4 py-3 text-right font-medium">Aplicar USD</th>
              </tr>
            </thead>
            <tbody>
              {facturas.map((f) => (
                <tr key={f.id} className="border-b border-linea last:border-0">
                  <td className="px-4 py-2 font-semibold">{f.numero}</td>
                  <td className="px-3 py-2">{f.vence.split("-").reverse().join("/")}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(f.saldo)}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-end gap-2">
                      <button type="button" onClick={() => setMontos((m) => ({ ...m, [f.id]: String(f.saldo) }))} className="text-[12.5px] text-marca-texto hover:underline">Saldo</button>
                      <input aria-label={`Aplicar a ${f.numero}`} inputMode="decimal" value={montos[f.id] ?? ""} onChange={(e) => setMontos((m) => ({ ...m, [f.id]: e.target.value }))} className={`${claseControl} w-32 text-right`} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="ml-auto flex w-full max-w-xs flex-col gap-1 p-4 text-[13.5px]">
          <div className="flex justify-between border-t border-linea pt-1 text-[15px] font-semibold"><dt>Total USD</dt><dd className="tabular-nums">{fmt(total)}</dd></div>
          {moneda === "VES" && enBs !== null ? <div className="flex justify-between text-gris-700"><dt>Se paga (Bs.)</dt><dd className="tabular-nums">{fmt(enBs)}</dd></div> : null}
          {moneda === "VES" && tasa ? <p className="text-[12.5px] text-gris-500">Tasa de hoy: {tasa.toLocaleString("es-VE", { maximumFractionDigits: 8 })}</p> : null}
        </dl>
      </Tarjeta>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pendiente || total <= 0} className={clasesBoton("primario")}>{pendiente ? "Registrando…" : "Registrar pago"}</button>
        <Link href={`/cxp/proveedor/${proveedorId}`} className="px-2 text-sm text-gris-700 hover:text-tinta">Cancelar</Link>
      </div>
    </form>
  );
}
