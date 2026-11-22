import Link from "next/link";
import { Eye } from "lucide-react";
import { Etiqueta, Tarjeta, clasesBoton } from "@/components/ui";
import { requerirPermiso, tienePermiso } from "@/lib/dal";
import { ESTADOS_TURNO, numeroTurno, type EstadoTurno } from "@/lib/pos/estados";
import { formatoFechaHora } from "../../facturacion/formato";

const m = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function ListaTurnos() {
  const ctx = await requerirPermiso("pos", "ver");
  // Quien no supervisa (pos.editar) solo ve sus propios turnos.
  const turnos = await ctx.db.turnoCaja.findMany({
    where: tienePermiso(ctx, "pos", "editar") ? {} : { usuarioId: ctx.usuario.id },
    include: { _count: { select: { ventas: true } } },
    orderBy: { numero: "desc" },
    take: 100,
  });
  return (
    <Tarjeta>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13.5px]">
          <thead>
            <tr className="border-y border-linea text-[12.5px] text-gris-600">
              <th className="px-4 py-3 font-medium">Turno</th><th className="px-4 py-3 font-medium">Cajero</th><th className="px-4 py-3 font-medium">Abierto</th><th className="px-4 py-3 font-medium">Cerrado</th>
              <th className="px-4 py-3 text-right font-medium">Ventas</th><th className="px-4 py-3 text-right font-medium">Diferencia Bs.</th><th className="px-4 py-3 text-right font-medium">Diferencia USD</th><th className="px-4 py-3 font-medium">Estado</th><th className="px-4 py-3"><span className="sr-only">Ver</span></th>
            </tr>
          </thead>
          <tbody>
            {turnos.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-10 text-center text-gris-500">Todavía no hay turnos de caja.</td></tr>
            ) : turnos.map((t) => {
              const e = ESTADOS_TURNO[t.estado as EstadoTurno];
              const difVes = t.contadoVes !== null ? Number(t.contadoVes) - Number(t.esperadoVes) : null;
              const difUsd = t.contadoUsd !== null ? Number(t.contadoUsd) - Number(t.esperadoUsd) : null;
              const tono = (d: number | null) => (d === null ? "" : Math.abs(d) < 0.005 ? "" : "text-error");
              return (
                <tr key={t.id} className="border-b border-linea last:border-0 hover:bg-hover">
                  <td className="px-4 py-3 font-semibold">{numeroTurno(t.numero)}</td>
                  <td className="px-4 py-3">{t.usuarioNombre}</td>
                  <td className="px-4 py-3">{formatoFechaHora(t.abiertoEn)}</td>
                  <td className="px-4 py-3">{formatoFechaHora(t.cerradoEn)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{t._count.ventas}</td>
                  <td className={`px-4 py-3 text-right tabular-nums ${tono(difVes)}`}>{difVes === null ? "—" : m(difVes)}</td>
                  <td className={`px-4 py-3 text-right tabular-nums ${tono(difUsd)}`}>{difUsd === null ? "—" : m(difUsd)}</td>
                  <td className="px-4 py-3"><Etiqueta tono={e.tono}>{e.etiqueta}</Etiqueta></td>
                  <td className="px-4 py-3 text-right"><Link href={`/pos/turnos/${t.id}`} aria-label={`Ver ${numeroTurno(t.numero)}`} className={clasesBoton("secundario", "!px-2.5 !py-1.5")}><Eye className="size-4" aria-hidden /></Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Tarjeta>
  );
}
