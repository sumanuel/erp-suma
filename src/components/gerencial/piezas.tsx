import Link from "next/link";
import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { Tarjeta, claseControl, clasesBoton } from "@/components/ui";

// Piezas de las consultas gerenciales (artículo, cliente y proveedor): buscador, datos de la ficha y tablas de solo lectura.

export function Buscador({ accion, valor, etiqueta, extra }: { accion: string; valor: string; etiqueta: string; extra?: ReactNode }) {
  return (
    <Tarjeta className="p-4 print:hidden">
      <form action={accion} className="flex flex-wrap items-end gap-3" role="search">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="q" className="text-[13px] font-medium">{etiqueta}</label>
          <input id="q" name="q" defaultValue={valor} maxLength={60} autoFocus={!valor} className={`${claseControl} w-80`} />
        </div>
        {extra}
        <button type="submit" className={clasesBoton("primario")}><Search className="size-4" aria-hidden />Buscar</button>
      </form>
    </Tarjeta>
  );
}

export function Resultados({ filas }: { filas: { href: string; titulo: string; detalle: string }[] }) {
  return (
    <Tarjeta>
      {filas.length === 0 ? <p className="p-6 text-sm text-gris-500">No se encontró nada con esa búsqueda.</p> : (
        <ul>
          {filas.map((f) => <li key={f.href} className="border-b border-linea last:border-0"><Link href={f.href} className="flex flex-wrap justify-between gap-2 px-4 py-2.5 text-[13.5px] hover:bg-hover"><span className="font-semibold">{f.titulo}</span><span className="text-gris-500">{f.detalle}</span></Link></li>)}
        </ul>
      )}
      {filas.length >= 50 ? <p className="p-3 text-[12.5px] text-gris-500">Se muestran los primeros 50: afina la búsqueda.</p> : null}
    </Tarjeta>
  );
}

export function Datos({ datos }: { datos: [string, ReactNode][] }) {
  return <dl className="grid gap-3 text-[13.5px] sm:grid-cols-2 xl:grid-cols-4">{datos.map(([t, v]) => <div key={t}><dt className="text-gris-500">{t}</dt><dd className="font-medium">{v === null || v === undefined || v === "" ? "—" : v}</dd></div>)}</dl>;
}

export type ColumnaTabla = { titulo: string; derecha?: boolean };
export function Tabla({ titulo, columnas, filas, vacio, nota }: { titulo: string; columnas: ColumnaTabla[]; filas: ReactNode[][]; vacio: string; nota?: string }) {
  const lado = (i: number) => (columnas[i].derecha ? "text-right tabular-nums" : "text-left");
  return (
    <Tarjeta>
      <h3 className="p-4 pb-2 text-base font-semibold">{titulo}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-[13.5px]">
          <thead><tr className="border-y border-linea text-[12.5px] text-gris-600">{columnas.map((c, i) => <th key={c.titulo} className={`px-3 py-2.5 font-medium ${i === 0 ? "pl-4" : ""} ${lado(i)}`}>{c.titulo}</th>)}</tr></thead>
          <tbody>
            {filas.length === 0 ? <tr><td colSpan={columnas.length} className="px-4 py-6 text-center text-gris-500">{vacio}</td></tr> : filas.map((f, n) => (
              <tr key={n} className="border-b border-linea last:border-0">{f.map((c, i) => <td key={i} className={`px-3 py-2 ${i === 0 ? "pl-4" : ""} ${lado(i)}`}>{c}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      {nota ? <p className="p-4 text-[12.5px] text-gris-500">{nota}</p> : null}
    </Tarjeta>
  );
}
