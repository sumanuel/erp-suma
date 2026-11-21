import Link from "next/link";
import { Eye, Plus } from "lucide-react";
import { Etiqueta, Tarjeta, clasesBoton } from "@/components/ui";
import { requerirSesion, tienePermiso } from "@/lib/dal";
import { ESTADOS_ENTERO, numeroEntero, type EstadoEntero } from "@/lib/retenciones/estados";
import { formatoFecha, formatoUsd } from "../formato";

export default async function PagosAlFisco() {
  const ctx = await requerirSesion();
  const [enteros, pendientes] = await Promise.all([
    ctx.db.enteroRetencion.findMany({ orderBy: { numero: "desc" }, take: 200, include: { cuenta: { select: { codigo: true } }, _count: { select: { retenciones: true } } } }),
    ctx.db.retencion.groupBy({ by: ["tipo"], where: { sentido: "PRACTICADA", estado: "ACTIVA", enteroId: null }, _sum: { montoBs: true }, _count: true }),
  ]);
  const puedeCrear = tienePermiso(ctx, "cxp", "crear");
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-2">
        {(["IVA", "ISLR"] as const).map((t) => {
          const p = pendientes.find((x) => x.tipo === t);
          return (
            <Tarjeta key={t} className="flex items-center justify-between gap-3 p-4">
              <div><p className="text-[12.5px] text-gris-500">Retenciones de {t} por enterar</p><p className="mt-1 text-xl font-semibold tabular-nums">Bs. {formatoUsd(Number(p?._sum.montoBs ?? 0))}</p><p className="text-[12.5px] text-gris-500">{p?._count ?? 0} comprobante(s)</p></div>
              {puedeCrear && (p?._count ?? 0) > 0 ? <Link href={`/cxp/enteros/nuevo?tipo=${t}`} className={clasesBoton("primario")}><Plus className="size-4" aria-hidden />Enterar</Link> : null}
            </Tarjeta>
          );
        })}
      </div>
      <Tarjeta>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-linea text-[12.5px] text-gris-600">
                <th className="px-4 py-3 font-medium">Pago</th><th className="px-3 py-3 font-medium">Fecha</th><th className="px-3 py-3 font-medium">Impuesto</th><th className="px-3 py-3 font-medium">Cuenta</th><th className="px-3 py-3 font-medium">Referencia</th>
                <th className="px-3 py-3 text-right font-medium">Comprobantes</th><th className="px-3 py-3 font-medium">Estado</th><th className="px-3 py-3 text-right font-medium">Monto Bs.</th><th className="px-4 py-3 text-right font-medium">Ver</th>
              </tr>
            </thead>
            <tbody>
              {enteros.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-gris-500">Todavía no se ha pagado nada al fisco.</td></tr>
              ) : enteros.map((e) => {
                const est = ESTADOS_ENTERO[e.estado as EstadoEntero];
                return (
                  <tr key={e.id} className="border-b border-linea last:border-0">
                    <td className="px-4 py-3 font-semibold"><Link href={`/cxp/enteros/${e.id}`} className="hover:underline">{numeroEntero(e.numero)}</Link></td>
                    <td className="px-3 py-3">{formatoFecha(e.fecha)}</td>
                    <td className="px-3 py-3">{e.tipo}</td>
                    <td className="px-3 py-3">{e.cuenta.codigo}</td>
                    <td className="px-3 py-3">{e.referencia ?? "—"}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{e._count.retenciones}</td>
                    <td className="px-3 py-3">{est ? <Etiqueta tono={est.tono}>{est.etiqueta}</Etiqueta> : e.estado}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatoUsd(Number(e.montoBs))}</td>
                    <td className="px-4 py-3"><div className="flex justify-end"><Link href={`/cxp/enteros/${e.id}`} aria-label={`Ver ${numeroEntero(e.numero)}`} className="flex size-9 items-center justify-center rounded-[9px] border border-borde-campo hover:bg-hover"><Eye className="size-4" aria-hidden /></Link></div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Tarjeta>
    </div>
  );
}
