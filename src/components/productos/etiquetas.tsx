"use client";

import JsBarcode from "jsbarcode";
import { Printer, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Tarjeta, clasesBoton, claseControl } from "@/components/ui";
import { buscarProductosEtiqueta, type ProductoEtiqueta } from "./acciones-etiquetas";

// Etiquetas de góndola (original: frmEtiqGran, frmEtiqMed, frmEtiqPeqCodg, frmEtiqPeqDesg): se eligen productos y cuántas etiquetas de cada uno, se escoge el formato
// y se imprime desde el navegador. El precio sale de la lista elegida (USD) y se muestra también en bolívares con la tasa del día.

const FORMATOS = {
  grande: { etiqueta: "Grande", ancho: "w-[100mm]", alto: "h-[70mm]" },
  mediana: { etiqueta: "Mediana", ancho: "w-[70mm]", alto: "h-[40mm]" },
  pequenaCodigo: { etiqueta: "Pequeña con código de barras", ancho: "w-[50mm]", alto: "h-[30mm]" },
  pequenaDescripcion: { etiqueta: "Pequeña con descripción", ancho: "w-[50mm]", alto: "h-[30mm]" },
} as const;
type Formato = keyof typeof FORMATOS;

type Item = ProductoEtiqueta & { copias: number };

const usd = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function CodigoBarras({ valor }: { valor: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const [fallo, setFallo] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    try {
      JsBarcode(ref.current, valor, { format: "CODE128", width: 1.3, height: 28, displayValue: true, fontSize: 10, margin: 0, textMargin: 1 });
      setFallo(false);
    } catch {
      setFallo(true);
    }
  }, [valor]);
  return fallo ? <span className="text-[10px]">{valor}</span> : <svg ref={ref} className="max-w-full" />;
}

function Etiqueta({ formato, p, tasa }: { formato: Formato; p: ProductoEtiqueta; tasa: number | null }) {
  const f = FORMATOS[formato];
  const bs = tasa ? p.precioUsd * tasa : null;
  const caja = `${f.ancho} ${f.alto} break-inside-avoid overflow-hidden border border-dashed border-gris-300 bg-white p-[2mm] text-black print:border-solid`;
  if (formato === "grande") {
    return (
      <div className={`${caja} flex flex-col justify-between`}>
        <p className="line-clamp-2 text-[15pt] font-bold leading-tight">{p.descripcion}</p>
        <div>
          <p className="text-[34pt] font-extrabold leading-none tabular-nums">$ {usd(p.precioUsd)}</p>
          {bs !== null ? <p className="text-[18pt] font-semibold tabular-nums">Bs. {usd(bs)}</p> : null}
        </div>
        <p className="text-[9pt]">{p.codigo}{p.unidad ? ` · ${p.unidad}` : ""}</p>
      </div>
    );
  }
  if (formato === "mediana") {
    return (
      <div className={`${caja} flex flex-col justify-between`}>
        <p className="line-clamp-2 text-[10pt] font-bold leading-tight">{p.descripcion}</p>
        <div className="flex items-end justify-between">
          <p className="text-[20pt] font-extrabold leading-none tabular-nums">$ {usd(p.precioUsd)}</p>
          {bs !== null ? <p className="text-[11pt] font-semibold tabular-nums">Bs. {usd(bs)}</p> : null}
        </div>
        <p className="text-[8pt]">{p.codigo}{p.unidad ? ` · ${p.unidad}` : ""}</p>
      </div>
    );
  }
  if (formato === "pequenaCodigo") {
    return (
      <div className={`${caja} flex flex-col items-center justify-between`}>
        <p className="line-clamp-1 w-full text-[7pt] font-bold">{p.descripcion}</p>
        <CodigoBarras valor={p.codigoBarras || p.codigo} />
        <p className="text-[10pt] font-extrabold tabular-nums">$ {usd(p.precioUsd)}{bs !== null ? <span className="ml-2 text-[8pt] font-semibold">Bs. {usd(bs)}</span> : null}</p>
      </div>
    );
  }
  return (
    <div className={`${caja} flex flex-col justify-between`}>
      <p className="line-clamp-3 text-[8pt] font-bold leading-tight">{p.descripcion}</p>
      <div>
        <p className="text-[13pt] font-extrabold leading-none tabular-nums">$ {usd(p.precioUsd)}</p>
        {bs !== null ? <p className="text-[8pt] font-semibold tabular-nums">Bs. {usd(bs)}</p> : null}
      </div>
      <p className="text-[6.5pt]">{p.codigo}</p>
    </div>
  );
}

export function Etiquetas({ tasa, listas }: { tasa: number | null; listas: string[] }) {
  const [formato, setFormato] = useState<Formato>("mediana");
  const [lista, setLista] = useState(listas[0] ?? "A");
  const [items, setItems] = useState<Item[]>([]);
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState<ProductoEtiqueta[]>([]);
  const ultima = useRef(0);

  useEffect(() => {
    const q = texto.trim();
    if (q.length < 2) return;
    const turno = ++ultima.current;
    const t = setTimeout(async () => {
      const r = await buscarProductosEtiqueta(q, lista).catch(() => []);
      if (turno === ultima.current) setResultados(r);
    }, 250);
    return () => clearTimeout(t);
  }, [texto, lista]);
  const visibles = texto.trim().length < 2 ? [] : resultados;

  const agregar = (p: ProductoEtiqueta) => {
    setTexto("");
    setResultados([]);
    setItems((x) => (x.some((i) => i.codigo === p.codigo) ? x : [...x, { ...p, copias: 1 }]));
  };
  // Al cambiar de lista de precios se vuelve a pedir el precio de lo ya elegido.
  useEffect(() => {
    if (items.length === 0) return;
    let vivo = true;
    (async () => {
      const nuevos = await Promise.all(items.map((i) => buscarProductosEtiqueta(i.codigo, lista).then((r) => r.find((x) => x.codigo === i.codigo)).catch(() => undefined)));
      if (vivo) setItems((x) => x.map((i, k) => (nuevos[k] ? { ...nuevos[k]!, copias: i.copias } : i)));
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lista]);

  const total = items.reduce((s, i) => s + i.copias, 0);
  return (
    <div className="flex flex-col gap-6">
      <Tarjeta className="p-6 print:hidden" recortar={false}>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="formato" className="text-[13px] font-medium">Formato de la etiqueta</label>
            <select id="formato" value={formato} onChange={(e) => setFormato(e.target.value as Formato)} className={`${claseControl} pr-9`}>
              {Object.entries(FORMATOS).map(([k, v]) => <option key={k} value={k}>{v.etiqueta}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="lista" className="text-[13px] font-medium">Lista de precios</label>
            <select id="lista" value={lista} onChange={(e) => setLista(e.target.value)} className={`${claseControl} pr-9`}>
              {listas.map((l) => <option key={l} value={l}>Lista {l}</option>)}
            </select>
          </div>
          <div className="relative flex flex-col gap-1.5">
            <label htmlFor="buscar-etiqueta" className="text-[13px] font-medium">Agregar producto</label>
            <input id="buscar-etiqueta" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Código, descripción o código de barras" autoComplete="off" className={claseControl} />
            {visibles.length > 0 ? (
              <ul className="absolute top-full z-10 mt-1 max-h-72 w-full overflow-auto rounded-[10px] border border-borde bg-white py-1 shadow-lg">
                {visibles.map((p) => (
                  <li key={p.codigo}>
                    <button type="button" onClick={() => agregar(p)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[13.5px] hover:bg-hover">
                      <span className="min-w-0 truncate"><span className="font-semibold">{p.codigo}</span> · {p.descripcion}</span>
                      <span className="shrink-0 text-gris-500">{usd(p.precioUsd)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
        {items.length > 0 ? (
          <table className="mt-4 w-full max-w-3xl text-left text-[13.5px]">
            <thead><tr className="border-y border-linea text-[12.5px] text-gris-600"><th className="py-2 font-medium">Producto</th><th className="py-2 text-right font-medium">Precio USD</th><th className="py-2 text-right font-medium">Etiquetas</th><th className="py-2" /></tr></thead>
            <tbody>
              {items.map((i, k) => (
                <tr key={i.codigo} className="border-b border-linea last:border-0">
                  <td className="py-2"><span className="font-semibold">{i.codigo}</span> · {i.descripcion}</td>
                  <td className="py-2 text-right tabular-nums">{usd(i.precioUsd)}</td>
                  <td className="py-2 text-right"><input aria-label={`Etiquetas de ${i.codigo}`} type="number" min={1} max={200} value={i.copias} onChange={(e) => setItems((x) => x.map((y, j) => (j === k ? { ...y, copias: Math.min(200, Math.max(1, Math.trunc(Number(e.target.value)) || 1)) } : y)))} className={`${claseControl} w-24 text-right`} /></td>
                  <td className="py-2 text-right"><button type="button" aria-label={`Quitar ${i.codigo}`} onClick={() => setItems((x) => x.filter((_, j) => j !== k))} className="inline-flex size-9 items-center justify-center rounded-[9px] border border-[#f3c7c7] text-error hover:bg-error-suave"><Trash2 className="size-4" aria-hidden /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="mt-4 text-sm text-gris-500">Busca y agrega los productos; en cada uno indica cuántas etiquetas imprimir.</p>}
        <div className="mt-4 flex items-center gap-4">
          <button type="button" disabled={total === 0} onClick={() => window.print()} className={clasesBoton("primario")}><Printer className="size-4" aria-hidden />Imprimir {total > 0 ? `${total} etiqueta${total === 1 ? "" : "s"}` : ""}</button>
          {tasa ? <span className="text-[13px] text-gris-600">Tasa del día: {tasa.toLocaleString("es-VE", { maximumFractionDigits: 8 })}</span> : <span className="text-[13px] text-gris-600">Sin tasa del dólar: las etiquetas no mostrarán bolívares.</span>}
        </div>
      </Tarjeta>
      <div className="flex flex-wrap gap-2 print:gap-0" aria-label="Vista previa de las etiquetas">
        {items.flatMap((i) => Array.from({ length: i.copias }, (_, c) => <Etiqueta key={`${i.codigo}-${c}`} formato={formato} p={i} tasa={tasa} />))}
      </div>
    </div>
  );
}
