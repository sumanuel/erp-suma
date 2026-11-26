import Link from "next/link";
import { AvisoTope, FiltroFechas, SinResultados, VerTodasLasFechas, enlaceTodasLasFechas } from "@/components/listado/filtro-fechas";
import { porFecha, rangoDeFechas } from "@/lib/filtros-fecha";
import { Eye, Plus } from "lucide-react";
import { Etiqueta, Tarjeta, clasesBoton, claseControl } from "@/components/ui";
import { requerirSesion, tienePermiso } from "@/lib/dal";
import { ESTADOS_ORDEN, numeroOrden, type EstadoOrden } from "@/lib/compras/calculos";
import { formatoFecha, formatoUsd } from "./formato";

export default async function ListaCompras({ searchParams }: { searchParams: Promise<{ q?: string; estado?: string; desde?: string; hasta?: string }> }) {
  const ctx = await requerirSesion();
  const filtros = await searchParams;
  const { q = "", estado = "" } = filtros;
  const fechas = rangoDeFechas(filtros, "todas");
  const conFechas = !!(fechas.desde || fechas.hasta);
  const todas = enlaceTodasLasFechas("/compras", { q, estado });
  const texto = q.trim().slice(0, 60);
  const numero = /^(OC-?)?0*(\d{1,9})$/i.exec(texto)?.[2];
  const where = {
    ...porFecha(fechas.desdeFecha, fechas.hastaFecha),
    ...(estado in ESTADOS_ORDEN ? { estado } : {}),
    ...(texto
      ? { OR: [...(numero ? [{ numero: Number(numero) }] : []), { proveedor: { razonSocial: { contains: texto, mode: "insensitive" as const } } }, { proveedor: { documento: { contains: texto, mode: "insensitive" as const } } }] }
      : {}),
  };
  const encontrados = await ctx.db.ordenCompra.count({ where });
  const ordenes = await ctx.db.ordenCompra.findMany({
    where,
    include: { proveedor: { select: { razonSocial: true } } },
    orderBy: { numero: "desc" },
    take: 200,
  });
  const puedeCrear = tienePermiso(ctx, "compras", "crear");
  return (
    <Tarjeta>
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <form className="flex flex-wrap items-end gap-2" role="search">
          <FiltroFechas desde={fechas.desde} hasta={fechas.hasta} />
          <div className="w-72"><input name="q" defaultValue={texto} placeholder="Número o proveedor" aria-label="Buscar" className={claseControl} /></div>
          <div className="w-48">
            <select name="estado" defaultValue={estado} aria-label="Estado" className={`${claseControl} pr-9`}>
              <option value="">Todos los estados</option>
              {Object.entries(ESTADOS_ORDEN).map(([k, v]) => <option key={k} value={k}>{v.etiqueta}</option>)}
            </select>
          </div>
          <button type="submit" className={clasesBoton("secundario")}>Filtrar</button>
          <VerTodasLasFechas href={todas} />
        </form>
        {puedeCrear ? <Link href="/compras/nueva" className={clasesBoton("primario")}><Plus className="size-4" aria-hidden />Nueva orden</Link> : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13.5px]">
          <thead>
            <tr className="border-y border-linea text-[12.5px] text-gris-600">
              <th className="px-4 py-3 font-medium">Orden</th><th className="px-3 py-3 font-medium">Fecha</th><th className="px-3 py-3 font-medium">Proveedor</th>
              <th className="px-3 py-3 font-medium">Estado</th><th className="px-3 py-3 text-right font-medium">Total (USD)</th><th className="px-4 py-3 text-right font-medium">Ver</th>
            </tr>
          </thead>
          <tbody>
            {ordenes.length === 0 ? (
              <SinResultados columnas={6} que="órdenes de compra" filtrado={!!(texto || estado)} conFechas={conFechas} href={todas} />
            ) : ordenes.map((o) => {
              const e = ESTADOS_ORDEN[o.estado as EstadoOrden];
              return (
                <tr key={o.id} className="border-b border-linea last:border-0">
                  <td className="px-4 py-3 font-semibold"><Link href={`/compras/${o.id}`} className="hover:underline">{numeroOrden(o.numero)}</Link></td>
                  <td className="px-3 py-3">{formatoFecha(o.fecha)}</td>
                  <td className="px-3 py-3">{o.proveedor.razonSocial}</td>
                  <td className="px-3 py-3">{e ? <Etiqueta tono={e.tono}>{e.etiqueta}</Etiqueta> : o.estado}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatoUsd(Number(o.total))}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      <Link href={`/compras/${o.id}`} aria-label={`Ver ${numeroOrden(o.numero)}`} className="flex size-9 items-center justify-center rounded-[9px] border border-borde-campo hover:bg-hover"><Eye className="size-4" aria-hidden /></Link>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <AvisoTope mostrados={ordenes.length} total={encontrados} />
    </Tarjeta>
  );
}
