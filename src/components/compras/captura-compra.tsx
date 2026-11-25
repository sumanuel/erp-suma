"use client";

import { Plus, Trash2, X } from "lucide-react";
import { useState, type KeyboardEvent, type ReactNode } from "react";
import { clasesBoton, claseControl } from "@/components/ui";
import { BuscadorProducto, alEnter, enfocarBuscador } from "@/components/buscador-producto";
import { calcularLinea } from "@/lib/compras/calculos";
import { descuentoEfectivo, descuentoGlobal } from "@/lib/pedidos/calculos";

// Captura de artículos de una orden de compra, igual que en ventas: fila fija (producto → descuento → cantidad → costo) que se recorre con
// Enter y una tabla que no se edita. Los descuentos 2 y 3 y el arancel están en la fila, pero Enter no se detiene en ellos.

export type ProductoCompra = { codigo: string; descripcion: string; ultimoCosto: number; ivaPorcentaje: number };
export type LineaCompra = { productoCodigo: string; descripcion: string; ivaPorcentaje: number; cantidad: string; costoUnitario: string; descuento: string; descuento2: string; descuento3: string; arancelId: string };

const num = (s: string) => {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const usd = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const cant = (n: number) => n.toLocaleString("es-VE", { maximumFractionDigits: 4 });
const r4 = (n: number) => Math.round(n * 10000) / 10000;

/** Total de una línea en USD: el costo va en la moneda de la orden y el descuento combina los tres de la línea con los del documento. */
export const totalLinea = (l: LineaCompra, cambio: number, global: number) =>
  calcularLinea({ cantidad: num(l.cantidad), costoUnitario: cambio > 0 ? num(l.costoUnitario) / cambio : num(l.costoUnitario), descuento: descuentoEfectivo(descuentoGlobal([num(l.descuento), num(l.descuento2), num(l.descuento3)]), global), ivaPorcentaje: l.ivaPorcentaje });

export function CapturaCompra({ buscar, lineas, onCambio, cambio, global, moneda, aranceles, onEnterVacio }: {
  buscar: (texto: string, limite?: number) => Promise<ProductoCompra[]>; lineas: LineaCompra[]; onCambio: (l: LineaCompra[]) => void;
  /// Bs. por USD si la orden es en bolívares; 0 si es en dólares.
  cambio: number; global: number; moneda: "USD" | "VES"; aranceles: { valor: string; etiqueta: string }[]; onEnterVacio?: () => void;
}) {
  const [borrador, setBorrador] = useState<LineaCompra | null>(null);
  const [mensaje, setMensaje] = useState<{ texto: string; error: boolean } | null>(null);
  const simbolo = moneda === "VES" ? "Bs." : "USD";

  const enfocar = (id: string) => requestAnimationFrame(() => {
    const el = document.getElementById(id);
    el?.focus();
    if (el instanceof HTMLInputElement) el.select();
  });

  function elegir(p: ProductoCompra) {
    setMensaje(null);
    // El último costo se guarda en USD: en una orden en bolívares se propone convertido.
    setBorrador({ productoCodigo: p.codigo, descripcion: p.descripcion, ivaPorcentaje: p.ivaPorcentaje, cantidad: "1", costoUnitario: String(cambio > 0 ? r4(p.ultimoCosto * cambio) : p.ultimoCosto), descuento: "0", descuento2: "0", descuento3: "0", arancelId: "" });
    enfocar("compra-descuento");
  }
  function limpiar() {
    setBorrador(null);
    enfocarBuscador();
  }
  function agregar() {
    if (!borrador) return;
    if (!(num(borrador.cantidad) > 0)) { setMensaje({ texto: "La cantidad debe ser mayor que 0.", error: true }); enfocar("compra-cantidad"); return; }
    if (num(borrador.costoUnitario) < 0) { setMensaje({ texto: "El costo no puede ser negativo.", error: true }); enfocar("compra-costo"); return; }
    if ([borrador.descuento, borrador.descuento2, borrador.descuento3].some((d) => num(d) < 0 || num(d) > 100)) { setMensaje({ texto: "Los descuentos van de 0 a 100.", error: true }); enfocar("compra-descuento"); return; }
    // Un producto va en una sola línea: si ya estaba, se suma la cantidad y quedan el costo y los descuentos de esta captura.
    const i = lineas.findIndex((l) => l.productoCodigo === borrador.productoCodigo);
    if (i < 0) {
      onCambio([...lineas, borrador]);
      setMensaje(null);
    } else {
      const total = r4(num(lineas[i].cantidad) + num(borrador.cantidad));
      onCambio(lineas.map((l, k) => (k === i ? { ...borrador, cantidad: String(total) } : l)));
      setMensaje({ texto: `${borrador.productoCodigo} ya estaba: quedó con ${cant(total)} (costo y descuentos de esta captura).`, error: false });
    }
    limpiar();
  }

  const poner = (campo: keyof LineaCompra, v: string) => setBorrador((b) => (b ? { ...b, [campo]: v } : b));
  const escape = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); setMensaje(null); limpiar(); } };
  const campo = (id: string, etiqueta: string, ancho: string, control: ReactNode) => (
    <div className={`flex flex-col gap-1.5 ${ancho}`}><label htmlFor={id} className="text-[13px] font-medium">{etiqueta}</label>{control}</div>
  );
  const numerico = (id: string, k: "descuento" | "descuento2" | "descuento3" | "cantidad" | "costoUnitario", siguiente?: () => void) => (
    <input id={id} inputMode="decimal" disabled={!borrador} value={borrador?.[k] ?? ""} onChange={(e) => poner(k, e.target.value)} onKeyDown={(e) => alEnter(e, siguiente ?? agregar)} className={`${claseControl} text-right`} />
  );

  return (
    <div className="flex flex-col gap-3 border-b border-linea p-4" onKeyDown={escape}>
      <div className="flex flex-wrap items-end gap-3">
        <BuscadorProducto buscar={buscar} onElegir={elegir} onEnterVacio={onEnterVacio} derecha={(p) => `último costo ${usd(p.ultimoCosto)} USD`} etiqueta="Producto" contenedor="relative w-full sm:w-72" className="w-full" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium">Nombre</p>
          <p aria-live="polite" className="mt-1.5 flex h-10 items-center truncate rounded-[9px] border border-linea bg-neutro-suave/40 px-3 text-[13.5px]">
            {borrador ? <><span className="mr-2 font-semibold">{borrador.productoCodigo}</span><span className="truncate">{borrador.descripcion}</span></> : <span className="text-gris-500">Escribe el código o parte del nombre y pulsa Enter</span>}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        {campo("compra-descuento", "Desc. 1 %", "w-24", numerico("compra-descuento", "descuento", () => enfocar("compra-cantidad")))}
        {campo("compra-cantidad", "Cantidad", "w-28", numerico("compra-cantidad", "cantidad", () => enfocar("compra-costo")))}
        {campo("compra-costo", `Costo ${simbolo}`, "w-32", numerico("compra-costo", "costoUnitario"))}
        {campo("compra-descuento2", "Desc. 2 %", "w-20", numerico("compra-descuento2", "descuento2"))}
        {campo("compra-descuento3", "Desc. 3 %", "w-20", numerico("compra-descuento3", "descuento3"))}
        {campo("compra-arancel", "Arancel", "w-40", (
          <select id="compra-arancel" disabled={!borrador} value={borrador?.arancelId ?? ""} onChange={(e) => poner("arancelId", e.target.value)} onKeyDown={(e) => alEnter(e, agregar)} className={`${claseControl} pr-8`}>
            <option value="">Sin arancel</option>{aranceles.map((a) => <option key={a.valor} value={a.valor}>{a.etiqueta}</option>)}
          </select>
        ))}
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Total USD</span>
          <span className="flex h-10 min-w-24 items-center justify-end text-[15px] font-semibold tabular-nums">{borrador ? usd(totalLinea(borrador, cambio, global).total) : "—"}</span>
        </div>
        <button type="button" disabled={!borrador} onClick={agregar} className={clasesBoton("secundario")}><Plus className="size-4" aria-hidden />Agregar</button>
        {borrador ? <button type="button" onClick={() => { setMensaje(null); limpiar(); }} className="inline-flex h-10 items-center gap-1 px-2 text-sm text-gris-600 hover:text-tinta"><X className="size-4" aria-hidden />Limpiar</button> : null}
      </div>
      {mensaje ? <p role="status" className={`text-[13px] ${mensaje.error ? "font-medium text-error" : "text-gris-700"}`}>{mensaje.texto}</p> : <p className="text-[12.5px] text-gris-500">Enter avanza (descuento → cantidad → costo) y agrega · Esc limpia</p>}
    </div>
  );
}

/** Líneas de la orden: no se editan. Se eliminan con el botón o con Supr sobre la fila. */
export function TablaCompra({ lineas, onQuitar, cambio, global, moneda, aranceles }: { lineas: LineaCompra[]; onQuitar: (i: number) => void; cambio: number; global: number; moneda: "USD" | "VES"; aranceles: { valor: string; etiqueta: string }[] }) {
  const d = "px-2 py-2 text-right tabular-nums";
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[13.5px]">
        <thead>
          <tr className="border-b border-linea text-[12.5px] text-gris-600">
            <th className="px-4 py-2.5 font-medium">Código</th><th className="px-2 py-2.5 font-medium">Producto</th><th className="px-2 py-2.5 text-right font-medium">Cantidad</th><th className="px-2 py-2.5 text-right font-medium">Costo {moneda === "VES" ? "Bs." : "USD"}</th>
            <th className="px-2 py-2.5 text-right font-medium">Desc. 1 %</th><th className="px-2 py-2.5 text-right font-medium">Desc. 2 %</th><th className="px-2 py-2.5 text-right font-medium">Desc. 3 %</th><th className="px-2 py-2.5 font-medium">Arancel</th><th className="px-2 py-2.5 text-right font-medium">IVA %</th><th className="px-2 py-2.5 text-right font-medium">Total USD</th>
            <th className="px-4 py-2.5"><span className="sr-only">Eliminar</span></th>
          </tr>
        </thead>
        <tbody>
          {lineas.length === 0 ? <tr><td colSpan={11} className="px-4 py-10 text-center text-gris-500">Busca y agrega los productos de la orden.</td></tr> : lineas.map((l, i) => (
            <tr key={l.productoCodigo} tabIndex={0} onKeyDown={(e) => { if (e.key === "Delete") { e.preventDefault(); onQuitar(i); enfocarBuscador(); } }} className="border-b border-linea last:border-0 focus:bg-hover focus:outline-none">
              <td className="px-4 py-2 font-semibold">{l.productoCodigo}</td>
              <td className="px-2 py-2">{l.descripcion}</td>
              <td className={d}>{cant(num(l.cantidad))}</td><td className={d}>{usd(num(l.costoUnitario))}</td>
              <td className={d}>{cant(num(l.descuento))}</td><td className={d}>{cant(num(l.descuento2))}</td><td className={d}>{cant(num(l.descuento3))}</td>
              <td className="px-2 py-2">{aranceles.find((a) => a.valor === l.arancelId)?.etiqueta ?? "—"}</td>
              <td className={d}>{l.ivaPorcentaje}</td><td className={d}>{usd(totalLinea(l, cambio, global).total)}</td>
              <td className="px-4 py-2 text-right"><button type="button" aria-label={`Quitar ${l.productoCodigo}`} onClick={() => { onQuitar(i); enfocarBuscador(); }} className="inline-flex size-8 items-center justify-center rounded-[9px] border border-[#f3c7c7] text-error hover:bg-error-suave"><Trash2 className="size-4" aria-hidden /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
