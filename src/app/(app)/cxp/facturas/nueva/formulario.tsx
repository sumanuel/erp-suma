"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Aviso, Tarjeta, clasesBoton, claseControl } from "@/components/ui";
import { registrarFacturaProveedor } from "../../acciones";

const num = (s: string) => {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const fmt = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

/** Registro de la factura de un proveedor por sus montos en USD. La orden de compra es opcional y solo sirve de referencia. */
export function FormularioFacturaProveedor({ hoy, proveedores, ordenes }: {
  hoy: string; proveedores: { valor: string; etiqueta: string }[]; ordenes: { valor: string; proveedorId: string; etiqueta: string }[];
}) {
  const [proveedorId, setProveedorId] = useState("");
  const [ordenId, setOrdenId] = useState("");
  const [documento, setDocumento] = useState("");
  const [numeroControl, setNumeroControl] = useState("");
  const [fecha, setFecha] = useState(hoy);
  const [diasCredito, setDiasCredito] = useState("0");
  const [subtotal, setSubtotal] = useState("");
  const [iva, setIva] = useState("0");
  const [observaciones, setObservaciones] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const total = Math.round((num(subtotal) + num(iva)) * 10000) / 10000;
  const delProveedor = ordenes.filter((o) => o.proveedorId === proveedorId);

  function guardar() {
    setError(null);
    iniciar(async () => {
      const r = await registrarFacturaProveedor({ proveedorId, ordenId, documento, numeroControl, fecha, diasCredito: Math.trunc(num(diasCredito)), subtotal: num(subtotal), iva: num(iva), observaciones });
      if (r?.error) setError(r.error);
    });
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); guardar(); }} className="flex flex-col gap-6">
      {error ? <Aviso tono="error">{error}</Aviso> : null}
      <Tarjeta className="p-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="flex flex-col gap-1.5 xl:col-span-2">
            <label htmlFor="proveedorId" className="text-[13px] font-medium">Proveedor</label>
            <select id="proveedorId" value={proveedorId} onChange={(e) => { setProveedorId(e.target.value); setOrdenId(""); }} required className={`${claseControl} pr-9`}>
              <option value="">Elegir…</option>
              {proveedores.map((p) => <option key={p.valor} value={p.valor}>{p.etiqueta}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5 xl:col-span-2">
            <label htmlFor="ordenId" className="text-[13px] font-medium">Orden de compra (opcional)</label>
            <select id="ordenId" value={ordenId} onChange={(e) => setOrdenId(e.target.value)} disabled={!proveedorId} className={`${claseControl} pr-9`}>
              <option value="">Sin orden</option>
              {delProveedor.map((o) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="documento" className="text-[13px] font-medium">Nº de factura del proveedor</label>
            <input id="documento" value={documento} onChange={(e) => setDocumento(e.target.value)} required maxLength={60} className={claseControl} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="numeroControl" className="text-[13px] font-medium">Nº de control</label>
            <input id="numeroControl" value={numeroControl} onChange={(e) => setNumeroControl(e.target.value)} maxLength={60} className={claseControl} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="fecha" className="text-[13px] font-medium">Fecha de la factura</label>
            <input id="fecha" type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} required className={claseControl} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="diasCredito" className="text-[13px] font-medium">Días de crédito</label>
            <input id="diasCredito" inputMode="numeric" value={diasCredito} onChange={(e) => setDiasCredito(e.target.value)} className={claseControl} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="subtotal" className="text-[13px] font-medium">Base imponible (USD)</label>
            <input id="subtotal" inputMode="decimal" value={subtotal} onChange={(e) => setSubtotal(e.target.value)} required className={claseControl} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="iva" className="text-[13px] font-medium">IVA (USD)</label>
            <div className="flex items-center gap-2">
              <input id="iva" inputMode="decimal" value={iva} onChange={(e) => setIva(e.target.value)} className={claseControl} />
              <button type="button" onClick={() => setIva(String(Math.round(num(subtotal) * 16) / 100))} className="shrink-0 text-[12.5px] text-marca-texto hover:underline">16 %</button>
            </div>
          </div>
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <label htmlFor="observaciones" className="text-[13px] font-medium">Observaciones</label>
            <input id="observaciones" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} maxLength={1000} className={claseControl} />
          </div>
          <div className="flex flex-col justify-end md:col-span-2">
            <p className="text-[13px] text-gris-500">Total de la factura</p>
            <p className="text-xl font-semibold tabular-nums">{fmt(total)} USD</p>
          </div>
        </div>
      </Tarjeta>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pendiente} className={clasesBoton("primario")}>{pendiente ? "Registrando…" : "Registrar factura"}</button>
        <Link href="/cxp/facturas" className="px-2 text-sm text-gris-700 hover:text-tinta">Cancelar</Link>
      </div>
    </form>
  );
}
