import Link from "next/link";
import { LIMITES_FECHA, porFecha, rangoDeFechas } from "@/lib/filtros-fecha";
import { Eye, Plus } from "lucide-react";
import { Etiqueta, Tarjeta, claseControl, clasesBoton } from "@/components/ui";
import { requerirSesion, tienePermiso } from "@/lib/dal";
import { ORIGENES_ASIENTO } from "@/lib/contabilidad/conceptos";
import { ESTADOS_ASIENTO, numeroAsiento, type EstadoAsiento } from "@/lib/contabilidad/tipos";
import { formatoFecha, formatoUsd } from "../formato";

export default async function ListaAsientos({ searchParams }: { searchParams: Promise<{ q?: string; estado?: string; desde?: string; hasta?: string }> }) {
  const ctx = await requerirSesion();
  const filtros = await searchParams;
  const { q = "", estado = "" } = filtros;
  const { desde, hasta, desdeFecha, hastaFecha } = rangoDeFechas(filtros, "todas", await ctx.db.asiento.aggregate(LIMITES_FECHA));
  const texto = q.trim().slice(0, 60);
  const numero = /^(AS-?)?0*(\d{1,9})$/i.exec(texto)?.[2];
  const asientos = await ctx.db.asiento.findMany({
    where: {
      ...(estado in ESTADOS_ASIENTO ? { estado } : {}),
      ...porFecha(desdeFecha, hastaFecha),
      ...(texto ? { OR: [...(numero ? [{ numero: Number(numero) }] : []), { descripcion: { contains: texto, mode: "insensitive" as const } }, { referencia: { contains: texto, mode: "insensitive" as const } }] } : {}),
    },
    include: { lineas: { select: { debe: true } } },
    orderBy: { numero: "desc" },
    take: 200,
  });
  const puedeCrear = tienePermiso(ctx, "contabilidad", "crear");
  return (
    <Tarjeta>
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <form className="flex flex-wrap items-center gap-2" role="search">
          <input name="q" defaultValue={texto} placeholder="Número o descripción" aria-label="Buscar" className={`${claseControl} w-56`} />
          <input name="desde" type="date" defaultValue={desde} aria-label="Desde" className={`${claseControl} w-40`} />
          <input name="hasta" type="date" defaultValue={hasta} aria-label="Hasta" className={`${claseControl} w-40`} />
          <select name="estado" defaultValue={estado} aria-label="Estado" className={`${claseControl} w-44 pr-9`}>
            <option value="">Todos los estados</option>
            {Object.entries(ESTADOS_ASIENTO).map(([k, v]) => <option key={k} value={k}>{v.etiqueta}</option>)}
          </select>
          <button type="submit" className={clasesBoton("secundario")}>Filtrar</button>
        </form>
        {puedeCrear ? <Link href="/contabilidad/asientos/nuevo" className={clasesBoton("primario")}><Plus className="size-4" aria-hidden />Nuevo asiento</Link> : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13.5px]">
          <thead>
            <tr className="border-y border-linea text-[12.5px] text-gris-600">
              <th className="px-4 py-3 font-medium">Asiento</th><th className="px-3 py-3 font-medium">Fecha</th><th className="px-3 py-3 font-medium">Descripción</th><th className="px-3 py-3 font-medium">Origen</th>
              <th className="px-3 py-3 font-medium">Estado</th><th className="px-3 py-3 text-right font-medium">Monto Bs.</th><th className="px-4 py-3 text-right font-medium">Ver</th>
            </tr>
          </thead>
          <tbody>
            {asientos.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-gris-500">No hay asientos{texto || estado || desde || hasta ? " con ese filtro" : " todavía"}.</td></tr>
            ) : asientos.map((a) => {
              const e = ESTADOS_ASIENTO[a.estado as EstadoAsiento];
              const monto = a.lineas.reduce((s, l) => s + Number(l.debe), 0);
              return (
                <tr key={a.id} className="border-b border-linea last:border-0">
                  <td className="px-4 py-3 font-semibold"><Link href={`/contabilidad/asientos/${a.id}`} className="hover:underline">{numeroAsiento(a.numero)}</Link></td>
                  <td className="px-3 py-3">{formatoFecha(a.fecha)}</td>
                  <td className="px-3 py-3">{a.descripcion}</td>
                  <td className="px-3 py-3">{ORIGENES_ASIENTO[a.origen] ?? a.origen}</td>
                  <td className="px-3 py-3">{e ? <Etiqueta tono={e.tono}>{e.etiqueta}</Etiqueta> : a.estado}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatoUsd(monto)}</td>
                  <td className="px-4 py-3"><div className="flex justify-end"><Link href={`/contabilidad/asientos/${a.id}`} aria-label={`Ver ${numeroAsiento(a.numero)}`} className="flex size-9 items-center justify-center rounded-[9px] border border-borde-campo hover:bg-hover"><Eye className="size-4" aria-hidden /></Link></div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Tarjeta>
  );
}
