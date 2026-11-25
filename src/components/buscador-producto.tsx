"use client";

import { LayoutList } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Tecla } from "@/components/atajos";
import { CatalogoProductos } from "@/components/catalogo-productos";
import { claseControl } from "@/components/ui";

// Buscador de productos para documentos con líneas (original: se escribe el código o parte de la descripción, Enter elige y el cursor pasa
// al descuento y luego a la cantidad). Enter con el texto de un código exacto o de barras agrega ese producto sin abrir la lista.

type Base = { codigo: string; descripcion: string };

/** Pasa el cursor a un campo de una línea (`data-linea` = código del producto, `data-campo` = nombre del campo). */
export function enfocarCampo(codigo: string, campo: string) {
  // La línea se dibuja después de elegir el producto: se reintenta unos cuadros hasta que exista el campo.
  let intentos = 0;
  const probar = () => {
    const el = document.querySelector<HTMLInputElement>(`[data-linea="${CSS.escape(codigo)}"][data-campo="${campo}"]`);
    if (el) {
      el.focus();
      el.select();
    } else if (++intentos < 30) requestAnimationFrame(probar);
  };
  requestAnimationFrame(probar);
}
export function enfocarBuscador(id = "buscar-producto") {
  requestAnimationFrame(() => document.getElementById(id)?.focus());
}
/** Enter en un campo de línea: no envía el formulario, pasa a `siguiente`. */
export function alEnter(e: KeyboardEvent, siguiente: () => void) {
  if (e.key !== "Enter") return;
  e.preventDefault();
  siguiente();
}

export function BuscadorProducto<T extends Base>({ buscar, onElegir, derecha, id = "buscar-producto", etiqueta = "Agregar producto", autoFocus = false, className = "max-w-xl", contenedor = "relative p-4", onEnterVacio }: {
  buscar: (texto: string, limite?: number) => Promise<T[]>; onElegir: (p: T) => void; derecha?: (p: T) => ReactNode; id?: string; etiqueta?: string; autoFocus?: boolean; className?: string;
  /// Clases del bloque que envuelve al buscador (para meterlo en una fila de captura).
  contenedor?: string;
  /// Enter con el buscador vacío (por ejemplo, para pasar a cobrar).
  onEnterVacio?: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState<T[]>([]);
  const [indice, setIndice] = useState(0);
  const [abierto, setAbierto] = useState(false);
  const ultima = useRef(0);
  const [catalogo, setCatalogo] = useState(false);
  const q = texto.trim();

  useEffect(() => {
    if (q.length < 2) return;
    const turno = ++ultima.current;
    const t = setTimeout(async () => {
      const r = await buscar(q).catch(() => []);
      if (turno === ultima.current) { setResultados(r); setIndice(0); }
    }, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  const visibles = q.length < 2 ? [] : resultados;

  function elegir(p: T) {
    ultima.current++;
    setTexto("");
    setResultados([]);
    setAbierto(false);
    onElegir(p);
  }

  async function alTeclear(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") { e.preventDefault(); setIndice((i) => Math.min(i + 1, Math.max(visibles.length - 1, 0))); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); setIndice((i) => Math.max(i - 1, 0)); return; }
    if (e.key === "Escape") { setAbierto(false); return; }
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (q.length === 0) { onEnterVacio?.(); return; }
    // Se busca de nuevo para no depender de la espera del buscador (un lector de códigos de barras escribe y pulsa Enter al instante).
    const turno = ++ultima.current;
    const r = q.length < 2 ? [] : await buscar(q).catch(() => []);
    if (turno !== ultima.current) return;
    const exacto = r.find((p) => p.codigo.toLowerCase() === q.toLowerCase());
    const elegido = exacto ?? r[Math.min(indice, r.length - 1)];
    if (elegido) elegir(elegido);
    else setResultados(r);
  }

  return (
    <div className={contenedor}>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium">{etiqueta} <Tecla>F6</Tecla></label>
      <div className={`flex items-center gap-2 ${className}`}>
      <input
        id={id} value={texto} autoFocus={autoFocus} autoComplete="off" role="combobox" aria-expanded={abierto && visibles.length > 0} aria-controls={`${id}-lista`} aria-autocomplete="list"
        placeholder="Código, descripción o código de barras — Enter para agregar" className={`${claseControl} min-w-0 flex-1`}
        onChange={(e) => { setTexto(e.target.value); setAbierto(true); }} onFocus={() => setAbierto(true)} onBlur={() => setAbierto(false)} onKeyDown={alTeclear}
      />
        <button type="button" data-ver-productos aria-label="Ver todos los productos" title="Ver todos los productos" onClick={() => { setAbierto(false); setCatalogo(true); }} className="inline-flex size-10 shrink-0 items-center justify-center rounded-[9px] border border-borde text-gris-700 hover:bg-hover hover:text-tinta">
          <LayoutList className="size-4" aria-hidden />
        </button>
      </div>
      {catalogo ? <CatalogoProductos buscar={buscar} inicial={q} derecha={derecha} onElegir={(p) => { setCatalogo(false); elegir(p); }} onCerrar={() => { setCatalogo(false); enfocarBuscador(id); }} /> : null}
      {abierto && visibles.length > 0 ? (
        <ul id={`${id}-lista`} role="listbox" className={`absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-[10px] border border-borde bg-white py-1 shadow-lg ${className}`}>
          {visibles.map((p, i) => (
            <li key={p.codigo} role="option" aria-selected={i === indice}>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); elegir(p); }} onMouseEnter={() => setIndice(i)} className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[13.5px] ${i === indice ? "bg-hover" : ""}`}>
                <span className="min-w-0 truncate"><span className="font-semibold">{p.codigo}</span> · {p.descripcion}</span>
                {derecha ? <span className="shrink-0 text-gris-500">{derecha(p)}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
