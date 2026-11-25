"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { claseControl } from "@/components/ui";

// Selector con buscador, como el del sistema original: se escribe parte del nombre o el documento/código y salen las coincidencias.
// Con Enter (o al salir del campo) se elige: si lo escrito es exactamente el documento o el código de un registro, se carga ese; si no,
// la opción resaltada. Las opciones traen la etiqueta «Nombre (documento)»; lo de los paréntesis es la clave de coincidencia exacta.

export type OpcionBuscable = { valor: string; etiqueta: string };

const limpiar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** Clave sin puntos, guiones ni espacios: «V-12.345.678» y «v12345678» son la misma. */
const clave = (s: string) => limpiar(s).replace(/[^a-z0-9]/g, "");
const claveDe = (etiqueta: string) => {
  const m = etiqueta.match(/\(([^()]*)\)\s*$/);
  return m ? clave(m[1]) : "";
};

export function SelectorBuscable({ id, valor, opciones, onCambio, placeholder = "Buscar por nombre o documento…", vacio = "Sin selección", requerido = false, deshabilitado = false, onElegido, onNoEncontrado, nombreNuevo = "registro", className = "" }: {
  id?: string; valor: string; opciones: OpcionBuscable[]; onCambio: (valor: string) => void; placeholder?: string;
  /// Texto de la opción que deja el campo sin valor; si es null, el campo no se puede vaciar.
  vacio?: string | null; requerido?: boolean; deshabilitado?: boolean;
  /// Se llama cuando el usuario elige con Enter o con un clic (para pasar al siguiente campo).
  onElegido?: () => void;
  /// Si se da, al no haber coincidencia (o al elegir la última fila) se ofrece crear uno nuevo con el texto escrito.
  onNoEncontrado?: (texto: string) => void; nombreNuevo?: string; className?: string;
}) {
  const auto = useId();
  const idc = id ?? auto;
  const actual = opciones.find((o) => o.valor === valor);
  const [texto, setTexto] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [indice, setIndice] = useState(0);
  // Se movió con las flechas sin escribir: Enter o Tab eligen la fila resaltada.
  const [movido, setMovido] = useState(false);
  const lista = useRef<HTMLUListElement>(null);
  const q = texto ?? "";

  const indexadas = useMemo(() => opciones.map((o) => ({ o, plano: limpiar(o.etiqueta), clave: claveDe(o.etiqueta) })), [opciones]);
  const visibles = useMemo(() => {
    const palabras = limpiar(q).split(/\s+/).filter(Boolean);
    const k = clave(q);
    const r = indexadas.filter((x) => palabras.every((p) => x.plano.includes(p)) || (k.length > 0 && clave(x.o.etiqueta).includes(k)));
    return r.slice(0, 50).map((x) => x.o);
  }, [indexadas, q]);

  useEffect(() => {
    lista.current?.children[indice]?.scrollIntoView({ block: "nearest" });
  }, [indice]);

  const hayCrear = !!onNoEncontrado && q.trim() !== "";
  const filas = visibles.length + (hayCrear ? 1 : 0);

  function crearNuevo() {
    setAbierto(false);
    onNoEncontrado?.(q.trim());
    setTexto(null);
  }

  function elegir(v: string, pasar: boolean) {
    onCambio(v);
    setTexto(null);
    setMovido(false);
    setAbierto(false);
    if (pasar) onElegido?.();
  }

  /** Coincidencia exacta de documento/código con lo escrito (tiene prioridad sobre la opción resaltada). */
  function exacta() {
    const k = clave(q);
    if (!k) return undefined;
    return indexadas.find((x) => x.clave === k)?.o;
  }

  function confirmar(pasar: boolean) {
    if (texto === null && !movido) return false;
    if (q.trim() === "" && movido && visibles[indice]) {
      elegir(visibles[indice].valor, pasar);
      return true;
    }
    if (q.trim() === "") {
      if (vacio !== null) elegir("", pasar);
      else setTexto(null);
      return true;
    }
    if (hayCrear && !exacta() && indice === visibles.length) {
      crearNuevo();
      return true;
    }
    const e = exacta() ?? visibles[indice];
    if (e) {
      elegir(e.valor, pasar);
      return true;
    }
    if (hayCrear) {
      crearNuevo();
      return true;
    }
    return false;
  }

  return (
    <div className={`relative ${className}`}>
      <input
        id={idc} role="combobox" aria-expanded={abierto} aria-autocomplete="list" aria-controls={`${idc}-lista`} autoComplete="off" disabled={deshabilitado} required={requerido && !valor}
        value={texto ?? actual?.etiqueta ?? ""} placeholder={actual || texto !== null ? undefined : placeholder} className={`${claseControl} w-full`}
        onFocus={(e) => {
          setAbierto(true); setMovido(false);
          // La lista se abre parada en lo que ya está elegido.
          setIndice(Math.max(visibles.findIndex((o) => o.valor === valor), 0));
          if (actual) e.currentTarget.select();
        }}
        onChange={(e) => { setTexto(e.target.value); setMovido(false); setIndice(0); setAbierto(true); }}
        onBlur={() => {
          // Al salir con Tab se toma la coincidencia exacta o la resaltada; si no hay, se restaura lo elegido.
          if (!(visibles.length > 0 || exacta()) || !confirmar(false)) setTexto(null);
          setAbierto(false);
          setMovido(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setAbierto(true); setMovido(true); setIndice((i) => Math.min(i + 1, Math.max(filas - 1, 0))); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setMovido(true); setIndice((i) => Math.max(i - 1, 0)); }
          else if (e.key === "Escape") { setTexto(null); setMovido(false); setAbierto(false); }
          else if (e.key === "Enter") {
            e.preventDefault();
            if (!confirmar(true) && texto === null) { setAbierto(false); onElegido?.(); }
          }
        }}
      />
      {abierto && !deshabilitado ? (
        <ul id={`${idc}-lista`} ref={lista} role="listbox" className="absolute left-0 top-full z-20 mt-1 max-h-72 w-full overflow-auto rounded-[10px] border border-borde bg-white py-1 shadow-lg">
          {vacio !== null && q.trim() === "" ? (
            <li role="option" aria-selected={valor === ""} onMouseDown={(e) => { e.preventDefault(); elegir("", true); }} className="cursor-pointer px-3 py-2 text-[13.5px] text-gris-500 hover:bg-hover">{vacio}</li>
          ) : null}
          {visibles.length === 0 && !hayCrear ? <li className="px-3 py-2 text-[13.5px] text-gris-500">Sin coincidencias</li> : visibles.map((o, i) => (
            <li
              key={o.valor} role="option" aria-selected={o.valor === valor}
              onMouseDown={(e) => { e.preventDefault(); elegir(o.valor, true); }} onMouseEnter={() => setIndice(i)}
              className={`cursor-pointer px-3 py-2 text-[13.5px] ${i === indice ? "bg-hover" : ""} ${o.valor === valor ? "font-semibold" : ""}`}
            >
              {o.etiqueta}
            </li>
          ))}
          {hayCrear ? (
            <li role="option" aria-selected={indice === visibles.length} onMouseDown={(e) => { e.preventDefault(); crearNuevo(); }} onMouseEnter={() => setIndice(visibles.length)} className={`cursor-pointer border-t border-linea px-3 py-2 text-[13.5px] font-medium text-marca-fuerte ${indice === visibles.length ? "bg-hover" : ""}`}>
              + Crear {nombreNuevo} «{q.trim()}»
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
