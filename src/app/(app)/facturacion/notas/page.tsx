import Link from "next/link";
import { Eye } from "lucide-react";
import { Etiqueta, Tarjeta, claseControl, clasesBoton } from "@/components/ui";
import { requerirSesion } from "@/lib/dal";
import { numeroFactura } from "@/lib/facturacion/estados";
import { ESTADOS_NOTA, MODOS_NOTA_VENTA, numeroNotaVenta, type EstadoNota } from "@/lib/notas/estados";
import { porTexto } from "@/lib/notas/filtros";
import { AvisoTope, FiltroFechas, SinResultados, VerTodasLasFechas, enlaceTodasLasFechas } from "@/components/listado/filtro-fechas";
import { LIMITES_FECHA, porFecha, rangoDeFechas } from "@/lib/filtros-fecha";
import { formatoFecha, formatoUsd } from "../formato";

export default async function ListaNotasVenta({ searchParams }: { searchParams: Promise<{ q?: string; tipo?: string; estado?: string; desde?: string; hasta?: string }> }) {
  const ctx = await requerirSesion();
  const p = await searchParams;
  const { q = "", tipo = "", estado = "" } = p;
  const texto = q.trim().slice(0, 60);
  const { desde, hasta, desdeFecha, hastaFecha, restringe } = rangoDeFechas(p, "mes", await ctx.db.notaVenta.aggregate(LIMITES_FECHA));
  const todas = enlaceTodasLasFechas("/facturacion/notas", { q, estado, tipo });
  const where = {
    ...(tipo === "CREDITO" || tipo === "DEBITO" ? { tipo } : {}),
    ...(estado in ESTADOS_NOTA ? { estado } : {}),
    ...porFecha(desdeFecha, hastaFecha),
    ...porTexto(texto),
  };
  const [notas, encontradas] = await Promise.all([
    ctx.db.notaVenta.findMany({ where, include: { cliente: { select: { razonSocial: true } }, factura: { select: { numero: true } } }, orderBy: { creadoEn: "desc" }, take: 200 }),
    ctx.db.notaVenta.count({ where }),
  ]);
  const campo = "flex flex-col gap-1 text-[12.5px] text-gris-600";
  return (
    <Tarjeta>
      <div className="p-4">
        <form className="flex flex-wrap items-end gap-3" role="search">
          <FiltroFechas desde={desde} hasta={hasta} />
          <label className={campo}>Buscar<input name="q" defaultValue={texto} placeholder="NC, ND, FAC, cliente o motivo" className={`${claseControl} w-64`} /></label>
          <label className={campo}>Tipo<select name="tipo" defaultValue={tipo} className={`${claseControl} w-44 pr-9`}><option value="">Créditos y débitos</option><option value="CREDITO">Notas de crédito</option><option value="DEBITO">Notas de débito</option></select></label>
          <label className={campo}>Estado<select name="estado" defaultValue={estado} className={`${claseControl} w-36 pr-9`}><option value="">Todas</option>{Object.entries(ESTADOS_NOTA).map(([k, v]) => <option key={k} value={k}>{v.etiqueta}</option>)}</select></label>
          <button type="submit" className={clasesBoton("secundario")}>Filtrar</button>
          <VerTodasLasFechas href={todas} />
        </form>
        <p className="mt-2 text-[12.5px] text-gris-500">Las notas se emiten desde la factura que corrigen.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13.5px]">
          <thead>
            <tr className="border-y border-linea text-[12.5px] text-gris-600">
              <th className="px-4 py-3 font-medium">Nota</th><th className="px-3 py-3 font-medium">Fecha</th><th className="px-3 py-3 font-medium">Cliente</th><th className="px-3 py-3 font-medium">Factura</th>
              <th className="px-3 py-3 font-medium">Concepto</th><th className="px-3 py-3 font-medium">Estado</th><th className="px-3 py-3 text-right font-medium">Total USD</th><th className="px-4 py-3 text-right font-medium">Ver</th>
            </tr>
          </thead>
          <tbody>
            {notas.length === 0 ? (
              <SinResultados columnas={8} que="notas" filtrado={!!(texto || tipo || estado)} conFechas={restringe} href={todas} />
            ) : notas.map((n) => {
              const e = ESTADOS_NOTA[n.estado as EstadoNota];
              const t = numeroNotaVenta(n.tipo, n.numero);
              return (
                <tr key={n.id} className="border-b border-linea last:border-0">
                  <td className="whitespace-nowrap px-4 py-3 font-semibold"><Link href={`/facturacion/notas/${n.id}`} className="hover:underline">{t}</Link></td>
                  <td className="px-3 py-3">{formatoFecha(n.fecha)}</td>
                  <td className="px-3 py-3">{n.cliente.razonSocial}</td>
                  <td className="whitespace-nowrap px-3 py-3">{numeroFactura(n.factura.numero)}</td>
                  <td className="px-3 py-3">{MODOS_NOTA_VENTA[n.modo as keyof typeof MODOS_NOTA_VENTA]}</td>
                  <td className="px-3 py-3">{e ? <Etiqueta tono={e.tono}>{e.etiqueta}</Etiqueta> : n.estado}</td>
                  <td className={`px-3 py-3 text-right tabular-nums ${n.tipo === "CREDITO" ? "text-error" : ""}`}>{n.tipo === "CREDITO" ? "−" : ""}{formatoUsd(Number(n.total))}</td>
                  <td className="px-4 py-3"><div className="flex justify-end"><Link href={`/facturacion/notas/${n.id}`} aria-label={`Ver ${t}`} className="flex size-9 items-center justify-center rounded-[9px] border border-borde-campo hover:bg-hover"><Eye className="size-4" aria-hidden /></Link></div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <AvisoTope mostrados={notas.length} total={encontradas} />
    </Tarjeta>
  );
}
