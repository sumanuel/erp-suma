import Link from "next/link";
import { Eye } from "lucide-react";
import { Etiqueta, Tarjeta, claseControl, clasesBoton } from "@/components/ui";
import { requerirPermiso } from "@/lib/dal";
import { numeroFactura } from "@/lib/facturacion/estados";
import { listarDevoluciones } from "@/lib/notas/devoluciones";
import { ESTADOS_NOTA, numeroNotaVenta, type EstadoNota } from "@/lib/notas/estados";
import { rangoDeFechas } from "@/lib/notas/filtros";
import { formatoFecha, formatoUsd } from "../formato";

const monto = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function ListaDevoluciones({ searchParams }: { searchParams: Promise<{ q?: string; estado?: string; desde?: string; hasta?: string }> }) {
  const { db } = await requerirPermiso("facturacion", "ver");
  const p = await searchParams;
  const { q = "", estado = "" } = p;
  const { desde, hasta, desdeFecha, hastaFecha } = rangoDeFechas(p);
  const { filas, encontradas, totales } = await listarDevoluciones(db, { texto: q, estado, desde: desdeFecha, hasta: hastaFecha });
  const filtrado = !!(q || estado || desde || hasta);

  const dato = (titulo: string, valor: string, detalle?: string) => (
    <div className="rounded-[10px] border border-linea p-3">
      <dt className="text-[12.5px] text-gris-500">{titulo}</dt>
      <dd className="text-[18px] font-semibold tabular-nums">{valor}</dd>
      {detalle ? <dd className="text-[12.5px] text-gris-500 tabular-nums">{detalle}</dd> : null}
    </div>
  );
  const campo = "flex flex-col gap-1 text-[12.5px] text-gris-600";

  return (
    <div className="flex flex-col gap-4">
      <Tarjeta className="p-4">
        <form className="flex flex-wrap items-end gap-3" role="search">
          <label className={campo}>Desde<input type="date" name="desde" defaultValue={desde} className={`${claseControl} w-40`} /></label>
          <label className={campo}>Hasta<input type="date" name="hasta" defaultValue={hasta} className={`${claseControl} w-40`} /></label>
          <label className={campo}>Buscar<input name="q" defaultValue={q} placeholder="NC, FAC, cliente o motivo" className={`${claseControl} w-60`} /></label>
          <label className={campo}>Estado<select name="estado" defaultValue={estado} className={`${claseControl} w-36 pr-9`}><option value="">Todas</option>{Object.entries(ESTADOS_NOTA).map(([k, v]) => <option key={k} value={k}>{v.etiqueta}</option>)}</select></label>
          <button type="submit" className={clasesBoton("secundario")}>Filtrar</button>
          <Link href="/facturacion/devoluciones?desde=&hasta=" className="flex h-10 items-center px-2 text-sm text-gris-700 hover:text-tinta">Ver todas las fechas</Link>
        </form>
        <p className="mt-2 text-[12.5px] text-gris-500">Para hacer una devolución, abre la factura y pulsa «Devolución».</p>
      </Tarjeta>

      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {dato("Devoluciones vigentes", String(totales.cantidad), totales.anuladas ? `${totales.anuladas} anulada${totales.anuladas === 1 ? "" : "s"}, sin sumar` : undefined)}
        {dato("Total devuelto", `${formatoUsd(totales.total)} USD`, `${monto(totales.totalBs)} Bs.${totales.deDeuda > 0 ? ` · ${formatoUsd(totales.deDeuda)} USD solo bajaron deuda` : ""}`)}
        {dato("Dinero reintegrado", `${monto(totales.reintegradoBs)} Bs.`, `y ${monto(totales.reintegradoUsd)} USD`)}
        {dato("Dejado a favor de clientes", `${formatoUsd(totales.saldoFavor)} USD`)}
      </dl>

      <Tarjeta>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-linea text-[12.5px] text-gris-600">
                <th className="px-4 py-3 font-medium">Devolución</th><th className="px-3 py-3 font-medium">Fecha</th><th className="px-3 py-3 font-medium">Cliente</th><th className="px-3 py-3 font-medium">Factura</th>
                <th className="px-3 py-3 font-medium">Alcance</th><th className="px-3 py-3 text-right font-medium">Total USD</th><th className="px-3 py-3 text-right font-medium">Reintegrado</th><th className="px-3 py-3 text-right font-medium">A favor USD</th>
                <th className="px-3 py-3 font-medium">Hecha por</th><th className="px-3 py-3 font-medium">Estado</th><th className="px-4 py-3 text-right font-medium">Ver</th>
              </tr>
            </thead>
            <tbody>
              {filas.length === 0 ? (
                <tr><td colSpan={11} className="px-4 py-10 text-center text-gris-500">No hay devoluciones{filtrado ? " con ese filtro" : " todavía"}.</td></tr>
              ) : filas.map((x) => {
                const e = ESTADOS_NOTA[x.estado as EstadoNota];
                const t = numeroNotaVenta("CREDITO", x.numero);
                return (
                  <tr key={x.id} className={`border-b border-linea last:border-0 ${x.estado === "ANULADA" ? "text-gris-500" : ""}`}>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold"><Link href={`/facturacion/notas/${x.id}`} className="hover:underline">{t}</Link><span className="block max-w-56 truncate text-[12.5px] font-normal text-gris-500" title={x.motivo}>{x.motivo}</span></td>
                    <td className="px-3 py-3">{formatoFecha(x.fecha)}</td>
                    <td className="px-3 py-3">{x.cliente}</td>
                    <td className="whitespace-nowrap px-3 py-3"><Link href={`/facturacion/${x.facturaId}`} className="text-marca-texto hover:underline">{numeroFactura(x.facturaNumero)}</Link></td>
                    <td className="px-3 py-3">{x.completa ? "Total" : "Parcial"}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatoUsd(x.total)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{x.reintegradoBs > 0 ? <span className="block">{monto(x.reintegradoBs)} Bs.</span> : null}{x.reintegradoUsd > 0 ? <span className="block">{monto(x.reintegradoUsd)} USD</span> : null}{x.reintegradoBs === 0 && x.reintegradoUsd === 0 ? "—" : null}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{x.saldoFavor > 0 ? formatoUsd(x.saldoFavor) : "—"}</td>
                    <td className="px-3 py-3">{x.por ?? "—"}</td>
                    <td className="px-3 py-3">{e ? <Etiqueta tono={e.tono}>{e.etiqueta}</Etiqueta> : x.estado}</td>
                    <td className="px-4 py-3"><div className="flex justify-end"><Link href={`/facturacion/notas/${x.id}`} aria-label={`Ver ${t}`} className="flex size-9 items-center justify-center rounded-[9px] border border-borde-campo hover:bg-hover"><Eye className="size-4" aria-hidden /></Link></div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {encontradas > filas.length ? <p className="p-3 text-[12.5px] text-gris-500">Se muestran las {filas.length} más recientes de {encontradas}; los totales las incluyen todas.</p> : null}
      </Tarjeta>
    </div>
  );
}
