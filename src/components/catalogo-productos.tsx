"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { clasesBoton, claseControl } from "@/components/ui";

// Ventana con todos los productos (original: buscador de artículos): se filtra escribiendo, se recorre con las flechas y Enter o un clic elige.

const TANDA = 100;

export function CatalogoProductos<T extends { codigo: string; descripcion: string }>({ buscar, inicial, derecha, onElegir, onCerrar }: {
  /// Con `limite` el buscador devuelve el catálogo (aunque el texto esté vacío) hasta esa cantidad.
  buscar: (texto: string, limite?: number) => Promise<T[]>; inicial: string; derecha?: (p: T) => ReactNode; onElegir: (p: T) => void; onCerrar: () => void;
}) {
  const [texto, setTexto] = useState(inicial);
  const [limite, setLimite] = useState(TANDA);
  const [filas, setFilas] = useState<T[] | null>(null);
  const [indice, setIndice] = useState(0);
  const [fallo, setFallo] = useState(false);
  const turno = useRef(0);
  const lista = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const mio = ++turno.current;
    const t = setTimeout(async () => {
      try {
        const r = await buscar(texto, limite);
        if (mio === turno.current) { setFilas(r); setFallo(false); }
      } catch {
        if (mio === turno.current) setFallo(true);
      }
    }, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto, limite]);

  useEffect(() => {
    lista.current?.children[indice]?.scrollIntoView({ block: "nearest" });
  }, [indice]);

  // La ventana está en un portal, pero sus eventos suben por el árbol de React: Enter y Esc no deben llegar al formulario.
  function alTeclear(e: KeyboardEvent) {
    const ultimo = Math.max((filas?.length ?? 0) - 1, 0);
    if (e.key === "ArrowDown") { e.preventDefault(); setIndice((i) => Math.min(i + 1, ultimo)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIndice((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onCerrar(); }
    else if (e.key === "Enter" && e.target instanceof HTMLInputElement) {
      e.preventDefault();
      const p = filas?.[Math.min(indice, ultimo)];
      if (p) onElegir(p);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div role="dialog" aria-modal="true" aria-label="Productos" onKeyDown={alTeclear} className="flex max-h-[85vh] w-full max-w-3xl flex-col gap-3 rounded-[14px] bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">Productos</h3>
          <button type="button" aria-label="Cerrar" onClick={onCerrar} className="text-gris-600 hover:text-tinta"><X className="size-5" aria-hidden /></button>
        </div>
        <input
          aria-label="Filtrar productos" autoFocus autoComplete="off" value={texto} placeholder="Filtrar por código, descripción o código de barras" className={claseControl}
          onChange={(e) => { setTexto(e.target.value); setLimite(TANDA); setIndice(0); }}
        />
        <ul ref={lista} role="listbox" aria-label="Productos" className="min-h-0 flex-1 overflow-auto rounded-[10px] border border-linea">
          {(filas ?? []).map((p, i) => (
            <li key={p.codigo} role="option" aria-selected={i === indice} className="border-b border-linea last:border-0">
              <button type="button" tabIndex={-1} onClick={() => onElegir(p)} onMouseMove={() => setIndice(i)} className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[13.5px] ${i === indice ? "bg-hover" : ""}`}>
                <span className="min-w-0 truncate"><span className="inline-block min-w-28 font-semibold">{p.codigo}</span>{p.descripcion}</span>
                {derecha ? <span className="shrink-0 tabular-nums text-gris-500">{derecha(p)}</span> : null}
              </button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-gris-600">
          <span role="status">{fallo ? "No se pudo cargar la lista." : filas === null ? "Cargando…" : filas.length === 0 ? "Ningún producto coincide." : `${filas.length} producto${filas.length === 1 ? "" : "s"} · ↑ ↓ para moverse · Enter elige · Esc cierra`}</span>
          {filas && filas.length >= limite && limite < 1000 ? <button type="button" onClick={() => setLimite((l) => l + TANDA)} className={clasesBoton("secundario")}>Mostrar más</button> : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
