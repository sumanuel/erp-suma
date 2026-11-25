"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

// Teclas de función de una pantalla (F5, F8…) y la lista que se recorre con las flechas y Enter.

/**
 * Atiende las teclas dadas mientras la pantalla está montada. Siempre anula lo que haría el navegador (F5 recargaría y se perdería el documento);
 * con una ventana abierta encima no se hace nada más.
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
