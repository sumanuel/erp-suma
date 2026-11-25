"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

// Teclas de función de una pantalla (F1 a F10) y la lista que se recorre con las flechas y Enter.

/**
 * Atiende las teclas dadas mientras la pantalla está montada. Siempre anula lo que haría el navegador (recargar, abrir la ayuda, buscar);
 * con una ventana abierta encima no se hace nada más. Con Ctrl o Shift el navegador responde normal (Ctrl+F5 recarga).
 */
export function useAtajos(atajos: Record<string, () => void>) {
  const actuales = useRef(atajos);
  useEffect(() => { actuales.current = atajos; });
  useEffect(() => {
    function alTeclear(e: globalThis.KeyboardEvent) {
      if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
      const accion = actuales.current[e.key];
      if (!accion) return;
      e.preventDefault();
      if (!e.repeat && !document.querySelector('[role="dialog"]')) accion();
    }
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, []);
}

/** Teclas reservadas en la pantalla de un documento: las que no tengan acción no hacen nada (ni lo del navegador, como recargar con F5). */
const RESERVADAS: Record<string, () => void> = Object.fromEntries(Array.from({ length: 10 }, (_x, i) => [`F${i + 1}`, () => {}]));

/** Lleva el cursor a un buscador y abre su lista (aunque ya estuviera en él). */
function irABuscador(id: string) {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLInputElement) || el.disabled) return;
  el.blur();
  requestAnimationFrame(() => { el.focus(); el.select(); });
}

/** Cambia un <select> como si lo hubiera hecho el usuario, para que corra su onChange. */
function elegirEnSelect(el: HTMLSelectElement, valor: string) {
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(el, valor);
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * Teclas de un documento: F1 cliente o proveedor, F2 vendedor, F3 condición de pago, F4 origen de la venta, F6 productos, F9 confirmar o
 * guardar y F10 salir. F8 moneda; F7 (modo de pago) y la moneda del cobro las atiende
 * el panel de cobro. Devuelve la ventana de opciones de F3, F4 y F8.
 */
export function useTeclasDocumento({ guardar, salir }: { guardar: () => void; salir: () => void }) {
  const [lista, setLista] = useState<{ id: string; titulo: string; opciones: [string, string][]; valor: string } | null>(null);
  function abrirLista(id: string, titulo: string) {
    const el = document.getElementById(id);
    if (el instanceof HTMLSelectElement && !el.disabled) setLista({ id, titulo, valor: el.value, opciones: [...el.options].map((o) => [o.value, o.text]) });
  }
  useAtajos({
    ...RESERVADAS,
    F1: () => irABuscador(document.getElementById("clienteId") ? "clienteId" : "proveedorId"),
    F2: () => irABuscador("vendedorId"),
    F3: () => abrirLista("condicionPagoId", "Condición de pago"),
    F4: () => abrirLista("origenVentaId", "Origen de la venta"),
    F6: () => document.querySelector<HTMLButtonElement>("[data-ver-productos]")?.click(),
    // Moneda del documento (compras e importaciones); en la factura es la del cobro y la atiende ese panel.
    F8: () => {
      const el = document.getElementById("moneda");
      if (el instanceof HTMLInputElement) { el.focus(); el.select(); } else abrirLista("moneda", "Moneda");
    },
    F9: guardar,
    F10: salir,
  });
  const cerrar = (id: string) => { setLista(null); requestAnimationFrame(() => document.getElementById(id)?.focus()); };
  return lista ? (
    <ListaRapida
      titulo={lista.titulo} opciones={lista.opciones} valor={lista.valor} onCerrar={() => cerrar(lista.id)}
      onElegir={(v) => { const el = document.getElementById(lista.id); if (el instanceof HTMLSelectElement) elegirEnSelect(el, v); cerrar(lista.id); }}
    />
  ) : null;
}

export const Tecla = ({ children }: { children: ReactNode }) => <kbd className="rounded-[5px] border border-current px-1 font-sans text-[11px] font-semibold leading-[1.4] opacity-70">{children}</kbd>;

export function ListaRapida({ titulo, opciones, valor, onElegir, onCerrar }: { titulo: string; opciones: [string, string][]; valor: string; onElegir: (v: string) => void; onCerrar: () => void }) {
  const [indice, setIndice] = useState(() => Math.max(opciones.findIndex(([v]) => v === valor), 0));
  const botones = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => { botones.current[indice]?.focus(); }, [indice]);

  // La ventana está en un portal, pero sus eventos suben por el árbol de React: no deben llegar al formulario.
  function alTeclear(e: KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setIndice((i) => (i + 1) % opciones.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIndice((i) => (i - 1 + opciones.length) % opciones.length); }
    else if (e.key === "Enter") { e.preventDefault(); onElegir(opciones[indice][0]); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onCerrar(); }
    else if (e.key === "Tab") e.preventDefault();
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div role="dialog" aria-modal="true" aria-label={titulo} onKeyDown={alTeclear} className="flex w-full max-w-xs flex-col gap-2 rounded-[14px] bg-white p-4 shadow-xl">
        <h3 className="text-base font-semibold">{titulo}</h3>
        <ul role="listbox" aria-label={titulo} className="flex flex-col gap-1">
          {opciones.map(([v, texto], i) => (
            <li key={v} role="option" aria-selected={i === indice}>
              <button ref={(el) => { botones.current[i] = el; }} type="button" onClick={() => onElegir(v)} onMouseMove={() => setIndice(i)} className={`w-full rounded-[9px] border px-3 py-2 text-left text-[15px] ${i === indice ? "border-marca-fuerte bg-hover font-semibold" : "border-linea"}`}>{texto}</button>
            </li>
          ))}
        </ul>
        <p className="text-[12.5px] text-gris-500">↑ ↓ para moverse · Enter elige · Esc cierra</p>
      </div>
    </div>,
    document.body,
  );
}
