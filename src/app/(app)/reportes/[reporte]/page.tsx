import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { Tarjeta, claseControl, clasesBoton } from "@/components/ui";
import { requerirSesion, tienePermiso } from "@/lib/dal";
import { resolverParametros } from "@/lib/reportes/ayudas";
import { buscarReporte } from "@/lib/reportes/registro";
import { textoCelda } from "@/lib/reportes/tipos";
import { BotonImprimir } from "./imprimir";

export default async function PaginaReporte({ params, searchParams }: { params: Promise<{ reporte: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { reporte } = await params;
  const def = buscarReporte(reporte);
  if (!def) notFound();
  const ctx = await requerirSesion();
  const parametros = await def.parametros(ctx.db);
  const valores = resolverParametros(parametros, await searchParams);
  const resultado = await def.consultar(ctx.db, valores);
  const consulta = new URLSearchParams(valores).toString();
  const alinear = (tipo: string) => (tipo === "texto" || tipo === "fecha" ? "text-left" : "text-right tabular-nums");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/reportes" className="inline-flex items-center gap-1.5 text-sm text-gris-700 hover:text-tinta"><ArrowLeft className="size-4" aria-hidden />Todos los reportes</Link>
        <div className="flex gap-2">
          <BotonImprimir />
          {tienePermiso(ctx, "reportes", "exportar") ? <a href={`/reportes/${def.id}/exportar?${consulta}`} className={clasesBoton("secundario")}><Download className="size-4" aria-hidden />Exportar a Excel (CSV)</a> : null}
        </div>
      </div>
      <Tarjeta>
        <div className="p-4">
          <h2 className="text-lg font-semibold">{def.titulo}</h2>
          <p className="text-[13px] text-gris-500">{def.descripcion}</p>
        </div>
        <form className="flex flex-wrap items-end gap-3 px-4 pb-4 print:hidden" role="search">
          {parametros.map((p) => (
            <div key={p.id} className="flex flex-col gap-1.5">
              <label htmlFor={p.id} className="text-[13px] font-medium">{p.etiqueta}</label>
              {p.tipo === "fecha" ? (
                <input id={p.id} name={p.id} type="date" defaultValue={valores[p.id]} className={`${claseControl} w-44`} />
              ) : (
                <select id={p.id} name={p.id} defaultValue={valores[p.id]} className={`${claseControl} min-w-48 pr-9`}>
                  {p.opciones.map((o) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
                </select>
              )}
            </div>
          ))}
          {parametros.length > 0 ? <button type="submit" className={clasesBoton("primario")}>Ver reporte</button> : null}
        </form>
        <p className="hidden px-4 pb-2 text-[12.5px] text-gris-600 print:block">{Object.entries(valores).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(" · ")}</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13.5px]">
            <thead>
              <tr className="border-y border-linea text-[12.5px] text-gris-600">
                {resultado.columnas.map((c, i) => <th key={c.clave} className={`px-3 py-3 font-medium ${i === 0 ? "pl-4" : ""} ${alinear(c.tipo)}`}>{c.titulo}</th>)}
              </tr>
            </thead>
            <tbody>
              {resultado.filas.length === 0 ? (
                <tr><td colSpan={resultado.columnas.length} className="px-4 py-10 text-center text-gris-500">No hay datos para estos parámetros.</td></tr>
              ) : resultado.filas.map((f, n) => (
                <tr key={n} className={`border-b border-linea last:border-0 ${f._negrita ? "bg-neutro-suave/40 font-semibold" : ""}`}>
                  {resultado.columnas.map((c, i) => (
                    <td key={c.clave} className={`px-3 py-2.5 ${i === 0 ? "pl-4" : ""} ${alinear(c.tipo)}`} style={i === 0 && f._nivel ? { paddingLeft: `${1 + f._nivel * 1.1}rem` } : undefined}>{textoCelda(f[c.clave], c.tipo)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
            {resultado.totales ? (
              <tfoot>
                <tr className="border-t border-linea font-semibold">
                  {resultado.columnas.map((c, i) => <td key={c.clave} className={`px-3 py-3 ${i === 0 ? "pl-4" : ""} ${alinear(c.tipo)}`}>{i === 0 ? "Totales" : c.clave in (resultado.totales ?? {}) ? textoCelda(resultado.totales![c.clave], c.tipo) : ""}</td>)}
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
        {resultado.notas?.length ? <ul className="flex flex-col gap-1 p-4 text-[12.5px] text-gris-500">{resultado.notas.map((n) => <li key={n}>{n}</li>)}</ul> : null}
      </Tarjeta>
    </div>
  );
}
