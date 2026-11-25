"use client";

import { Plus, Trash2, X } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import { clasesBoton, claseControl } from "@/components/ui";
import { BuscadorProducto, alEnter, enfocarBuscador } from "@/components/buscador-producto";
import type { ResultadoLinea } from "@/lib/importaciones/calculos";

// Captura de artículos de una importación, igual que en compras: fila fija (producto → cantidad → precio FOB) que se recorre con Enter y una
// tabla que no se edita. El arancel viene de la ficha del producto: está en la fila, pero Enter no se detiene en él.

export type ProductoImportacionCaptura = { codigo: string; descripcion: string; arancelPct: number };
export type LineaImp = { productoCodigo: string; descripcion: string; cantidad: string; fobUnitario: string; arancelPct: string };

export const numImp = (s: string) => {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
export const fmtImp = (n: number, d = 2) => n.toLocaleString("es-VE", { minimumFractionDigits: d, maximumFractionDigits: Math.max(d, 4) });
const cant = (n: number) => n.toLocaleString("es-VE", { maximumFractionDigits: 4 });
const r4 = (n: number) => Math.round(n * 10000) / 10000;

export function CapturaImportacion({ buscar, lineas, onCambio, cambioUsd, moneda, onEnterVacio }: {
  buscar: (texto: string, limite?: number) => Promise<ProductoImportacionCaptura[]>; lineas: LineaImp[]; onCambio: (l: LineaImp[]) => void;
  /// USD por 1 unidad de la moneda del FOB.
  cambioUsd: number; moneda: string; onEnterVacio?: () => void;
}) {
  const [borrador, setBorrador] = useState<LineaImp | null>(null);
  const [mensaje, setMensaje] = useState<{ texto: string; error: boolean } | null>(null);

  const enfocar = (id: string) => requestAnimationFrame(() => {
    const el = document.getElementById(id);
    el?.focus();
    if (el instanceof HTMLInputElement) el.select();
  });

  function elegir(p: ProductoImportacionCaptura) {
    setMensaje(null);
    setBorrador({ productoCodigo: p.codigo, descripcion: p.descripcion, cantidad: "1", fobUnitario: "0", arancelPct: String(p.arancelPct) });
    enfocar("imp-cantidad");
  }
  function limpiar() {
    setBorrador(null);
    enfocarBuscador();
  }
  function agregar() {
    if (!borrador) return;
    if (!(numImp(borrador.cantidad) > 0)) { setMensaje({ texto: "La cantidad debe ser mayor que 0.", error: true }); enfocar("imp-cantidad"); return; }
    if (numImp(borrador.fobUnitario) < 0) { setMensaje({ texto: "El precio FOB no puede ser negativo.", error: true }); enfocar("imp-fob"); return; }
    if (numImp(borrador.arancelPct) < 0 || numImp(borrador.arancelPct) > 1000) { setMensaje({ texto: "El arancel va de 0 a 1000 %.", error: true }); enfocar("imp-arancel"); return; }
    // Un producto va en una sola línea: si ya estaba, se suma la cantidad y quedan el FOB y el arancel de esta captura.
    const i = lineas.findIndex((l) => l.productoCodigo === borrador.productoCodigo);
    if (i < 0) {
      onCambio([...lineas, borrador]);
      setMensaje(null);
    } else {
      const total = r4(numImp(lineas[i].cantidad) + numImp(borrador.cantidad));
      onCambio(lineas.map((l, k) => (k === i ? { ...borrador, cantidad: String(total) } : l)));
      setMensaje({ texto: `${borrador.productoCodigo} ya estaba: quedó con ${cant(total)} (FOB y arancel de esta captura).`, error: false });
    }
    limpiar();
  }

  const escape = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); setMensaje(null); limpiar(); } };
  const numerico = (id: string, etiqueta: string, ancho: string, k: "cantidad" | "fobUnitario" | "arancelPct", siguiente: () => void) => (
    <div className={`flex flex-col gap-1.5 ${ancho}`}>
      <label htmlFor={id} className="text-[13px] font-medium">{etiqueta}</label>
      <input id={id} inputMode="decimal" disabled={!borrador} value={borrador?.[k] ?? ""} onChange={(e) => { const v = e.target.value; setBorrador((b) => (b ? { ...b, [k]: v } : b)); }} onKeyDown={(e) => alEnter(e, siguiente)} className={`${claseControl} text-right`} />
    </div>
  );

  return (
    <div className="flex flex-col gap-3 border-b border-linea p-4" onKeyDown={escape}>
      <div className="flex flex-wrap items-end gap-3">
        <BuscadorProducto buscar={buscar} onElegir={elegir} onEnterVacio={onEnterVacio} derecha={(p) => `arancel ${p.arancelPct} %`} etiqueta="Producto" contenedor="relative w-full sm:w-72" className="w-full" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium">Nombre</p>
          <p aria-live="polite" className="mt-1.5 flex h-10 items-center truncate rounded-[9px] border border-linea bg-neutro-suave/40 px-3 text-[13.5px]">
            {borrador ? <><span className="mr-2 font-semibold">{borrador.productoCodigo}</span><span className="truncate">{borrador.descripcion}</span></> : <span className="text-gris-500">Escribe el código o parte del nombre y pulsa Enter</span>}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        {numerico("imp-cantidad", "Cantidad", "w-28", "cantidad", () => enfocar("imp-fob"))}
        {numerico("imp-fob", `FOB unit. (${moneda || "USD"})`, "w-36", "fobUnitario", agregar)}
        {numerico("imp-arancel", "Arancel %", "w-24", "arancelPct", agregar)}
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">FOB USD</span>
          <span className="flex h-10 min-w-24 items-center justify-end text-[15px] font-semibold tabular-nums">{borrador ? fmtImp(numImp(borrador.cantidad) * numImp(borrador.fobUnitario) * (cambioUsd || 1)) : "—"}</span>
        </div>
        <button type="button" disabled={!borrador} onClick={agregar} className={clasesBoton("secundario")}><Plus className="size-4" aria-hidden />Agregar</button>
        {borrador ? <button type="button" onClick={() => { setMensaje(null); limpiar(); }} className="inline-flex h-10 items-center gap-1 px-2 text-sm text-gris-600 hover:text-tinta"><X className="size-4" aria-hidden />Limpiar</button> : null}
      </div>
      {mensaje ? <p role="status" className={`text-[13px] ${mensaje.error ? "font-medium text-error" : "text-gris-700"}`}>{mensaje.texto}</p> : <p className="text-[12.5px] text-gris-500">Enter avanza (cantidad → FOB) y agrega · Esc limpia</p>}
    </div>
  );
}

/** Líneas de la importación con su liquidación: no se editan. Se eliminan con el botón o con Supr sobre la fila. */
export function TablaImportacion({ lineas, filas, onQuitar, moneda }: { lineas: LineaImp[]; filas: ResultadoLinea[]; onQuitar: (i: number) => void; moneda: string }) {
  const d = "px-2 py-2 text-right tabular-nums";
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[13.5px]">
        <thead>
          <tr className="border-b border-linea text-[12.5px] text-gris-600">
            <th className="px-4 py-2.5 font-medium">Producto</th><th className="px-2 py-2.5 text-right font-medium">Cantidad</th><th className="px-2 py-2.5 text-right font-medium">FOB unit. ({moneda || "USD"})</th><th className="px-2 py-2.5 text-right font-medium">Arancel %</th>
            <th className="px-2 py-2.5 text-right font-medium">FOB USD</th><th className="px-2 py-2.5 text-right font-medium">CIF USD</th><th className="px-2 py-2.5 text-right font-medium">Gastos USD</th><th className="px-2 py-2.5 text-right font-medium">Arancel USD</th>
            <th className="px-2 py-2.5 text-right font-medium">Total USD</th><th className="px-2 py-2.5 text-right font-medium">Costo unit. USD</th><th className="px-4 py-2.5"><span className="sr-only">Eliminar</span></th>
          </tr>
        </thead>
        <tbody>
          {lineas.length === 0 ? <tr><td colSpan={11} className="px-4 py-10 text-center text-gris-500">Busca y agrega los productos de la importación.</td></tr> : lineas.map((l, i) => (
            <tr key={l.productoCodigo} tabIndex={0} onKeyDown={(e) => { if (e.key === "Delete") { e.preventDefault(); onQuitar(i); enfocarBuscador(); } }} className="border-b border-linea last:border-0 focus:bg-hover focus:outline-none">
              <td className="px-4 py-2"><span className="font-semibold">{l.productoCodigo}</span> · {l.descripcion}</td>
              <td className={d}>{cant(numImp(l.cantidad))}</td><td className={d}>{fmtImp(numImp(l.fobUnitario))}</td><td className={d}>{cant(numImp(l.arancelPct))}</td>
              <td className={d}>{fmtImp(filas[i].fobUsd)}</td><td className={d}>{fmtImp(filas[i].cifUsd)}</td><td className={d}>{fmtImp(filas[i].gastoUsd)}</td><td className={d}>{fmtImp(filas[i].arancelUsd)}</td>
              <td className={`${d} font-medium`}>{fmtImp(filas[i].totalUsd)}</td><td className={`${d} font-semibold`}>{fmtImp(filas[i].costoUnitarioUsd, 4)}</td>
              <td className="px-4 py-2 text-right"><button type="button" aria-label={`Quitar ${l.productoCodigo}`} onClick={() => { onQuitar(i); enfocarBuscador(); }} className="inline-flex size-8 items-center justify-center rounded-[9px] border border-[#f3c7c7] text-error hover:bg-error-suave"><Trash2 className="size-4" aria-hidden /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
