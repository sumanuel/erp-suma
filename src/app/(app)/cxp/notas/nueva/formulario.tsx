"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Aviso, Tarjeta, clasesBoton, claseControl } from "@/components/ui";
import { registrarNotaProveedor } from "../../acciones";
import { formatoUsd } from "../../formato";

const num = (s: string) => {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Registro de una nota de crédito o de débito que el proveedor emitió sobre una de sus facturas (por montos en USD; no mueve inventario). */
export function FormularioNotaCompra({ tipo, hoy, factura }: { tipo: "CREDITO" | "DEBITO"; hoy: string; factura: { id: string; etiqueta: string; proveedor: string; saldo: number } }) {
  const [documento, setDocumento] = useState("");
  const [control, setControl] = useState("");
  const [fecha, setFecha] = useState(hoy);
  const [motivo, setMotivo] = useState("");
  const [subtotal, setSubtotal] = useState("");
  const [iva, setIva] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const credito = tipo === "CREDITO";
  const total = Math.round((num(subtotal) + num(iva)) * 10000) / 10000;
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); setError(null); iniciar(async () => { const r = await registrarNotaProveedor({ tipo, facturaId: factura.id, documento, numeroControl: control, fecha, motivo, subtotal: num(subtotal), iva: num(iva) }); if (r?.error) setError(r.error); }); }}
      className="flex flex-col gap-6"
    >
      {error ? <Aviso tono="error">{error}</Aviso> : null}
      <Tarjeta className="p-6">
        <h2 className="text-lg font-semibold">Nota de {credito ? "crédito" : "débito"} del proveedor sobre {factura.etiqueta}</h2>
        <p className="text-sm text-gris-600">{factura.proveedor} · saldo pendiente {formatoUsd(factura.saldo)} USD</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="flex flex-col gap-1.5"><label htmlFor="documento" className="text-[13px] font-medium">Nº de la nota del proveedor</label><input id="documento" value={documento} onChange={(e) => setDocumento(e.target.value)} required maxLength={60} className={claseControl} /></div>
          <div className="flex flex-col gap-1.5"><label htmlFor="control" className="text-[13px] font-medium">Nº de control</label><input id="control" value={control} onChange={(e) => setControl(e.target.value)} maxLength={60} className={claseControl} /></div>
          <div className="flex flex-col gap-1.5"><label htmlFor="fecha" className="text-[13px] font-medium">Fecha de la nota</label><input id="fecha" type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} required className={claseControl} /></div>
          <div className="flex flex-col gap-1.5 md:col-span-2 xl:col-span-4"><label htmlFor="motivo" className="text-[13px] font-medium">Motivo</label><input id="motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} required maxLength={300} className={claseControl} /></div>
          <div className="flex flex-col gap-1.5"><label htmlFor="subtotal" className="text-[13px] font-medium">Base imponible (USD)</label><input id="subtotal" inputMode="decimal" value={subtotal} onChange={(e) => setSubtotal(e.target.value)} required className={claseControl} /></div>
          <div className="flex flex-col gap-1.5"><label htmlFor="iva" className="text-[13px] font-medium">IVA (USD)</label>
            <div className="flex items-center gap-2"><input id="iva" inputMode="decimal" value={iva} onChange={(e) => setIva(e.target.value)} className={claseControl} /><button type="button" onClick={() => setIva(String(Math.round(num(subtotal) * 16) / 100))} className="shrink-0 text-[12.5px] text-marca-texto hover:underline">16 %</button></div>
          </div>
          <div className="flex flex-col justify-end md:col-span-2"><p className="text-[13px] text-gris-500">Total de la nota</p><p className="text-xl font-semibold tabular-nums">{credito ? "−" : ""}{formatoUsd(total)} USD</p></div>
        </div>
        <p className="mt-3 text-[12.5px] text-gris-500">La nota usa la tasa de la factura original. {credito ? "Un crédito no puede superar lo que aún se debe de la factura." : "Un débito aumenta lo que se debe al proveedor."} No mueve inventario.</p>
      </Tarjeta>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pendiente || total <= 0} className={clasesBoton("primario")}>{pendiente ? "Registrando…" : `Registrar nota de ${credito ? "crédito" : "débito"}`}</button>
        <Link href={`/cxp/facturas/${factura.id}`} className="px-2 text-sm text-gris-700 hover:text-tinta">Cancelar</Link>
      </div>
    </form>
  );
}
