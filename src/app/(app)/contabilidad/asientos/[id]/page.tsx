import { notFound } from "next/navigation";
import { Etiqueta, Tarjeta } from "@/components/ui";
import { requerirSesion, tienePermiso } from "@/lib/dal";
import { ORIGENES_ASIENTO } from "@/lib/contabilidad/conceptos";
import { ESTADOS_ASIENTO, nombrePeriodo, numeroAsiento, type EstadoAsiento } from "@/lib/contabilidad/tipos";
import { formatoFecha, formatoFechaHora, formatoUsd } from "../../formato";
import { BotonAnularAsiento } from "./boton-anular";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DetalleAsiento({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const ctx = await requerirSesion();
  const a = await ctx.db.asiento.findUnique({ where: { id }, include: { lineas: { orderBy: { linea: "asc" }, include: { cuenta: { select: { codigo: true, nombre: true } } } } } });
  if (!a) notFound();
  const periodo = await ctx.db.periodoContable.findUnique({ where: { anio_mes: { anio: a.anio, mes: a.mes } } });
  const e = ESTADOS_ASIENTO[a.estado as EstadoAsiento];
  const debe = a.lineas.reduce((s, l) => s + Number(l.debe), 0);
  const haber = a.lineas.reduce((s, l) => s + Number(l.haber), 0);
  const puedeAnular = a.estado === "REGISTRADO" && periodo?.estado !== "CERRADO" && tienePermiso(ctx, "contabilidad", "eliminar");
  return (
    <div className="flex flex-col gap-6">
      <Tarjeta className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold">{numeroAsiento(a.numero)}</h2>
              {e ? <Etiqueta tono={e.tono}>{e.etiqueta}</Etiqueta> : null}
              {periodo?.estado === "CERRADO" ? <Etiqueta tono="neutro">Período cerrado</Etiqueta> : null}
            </div>
            <p className="text-sm text-gris-600">{a.descripcion}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">{puedeAnular ? <BotonAnularAsiento id={id} /> : null}</div>
        </div>
        <dl className="mt-4 grid gap-3 text-[13.5px] sm:grid-cols-2 xl:grid-cols-4">
          <div><dt className="text-gris-500">Fecha</dt><dd>{formatoFecha(a.fecha)}</dd></div>
          <div><dt className="text-gris-500">Período</dt><dd>{nombrePeriodo(a.anio, a.mes)}</dd></div>
          <div><dt className="text-gris-500">Origen</dt><dd>{ORIGENES_ASIENTO[a.origen] ?? a.origen}{a.referencia ? ` · ${a.referencia}` : ""}</dd></div>
          <div><dt className="text-gris-500">Registrado por</dt><dd>{a.creadoPorNombre ?? "—"} · {formatoFechaHora(a.creadoEn)}</dd></div>
          {a.estado === "ANULADO" ? <div className="sm:col-span-2 xl:col-span-4"><dt className="text-gris-500">Anulado</dt><dd>{a.anuladoPorNombre ?? "—"} · {formatoFechaHora(a.anuladoEn)} · {a.motivoAnulacion}</dd></div> : null}
        </dl>
      </Tarjeta>
      <Tarjeta>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-linea text-[12.5px] text-gris-600">
                <th className="px-4 py-3 font-medium">Cuenta</th><th className="px-3 py-3 font-medium">Detalle</th><th className="px-3 py-3 text-right font-medium">Debe Bs.</th><th className="px-4 py-3 text-right font-medium">Haber Bs.</th>
              </tr>
            </thead>
            <tbody>
              {a.lineas.map((l) => (
                <tr key={l.id} className="border-b border-linea last:border-0">
                  <td className="px-4 py-3"><span className="font-semibold tabular-nums">{l.cuenta.codigo}</span> · {l.cuenta.nombre}</td>
                  <td className="px-3 py-3">{l.descripcion ?? "—"}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{Number(l.debe) > 0 ? formatoUsd(Number(l.debe)) : ""}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{Number(l.haber) > 0 ? formatoUsd(Number(l.haber)) : ""}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="border-t border-linea font-semibold"><td className="px-4 py-3" colSpan={2}>Totales</td><td className="px-3 py-3 text-right tabular-nums">{formatoUsd(debe)}</td><td className="px-4 py-3 text-right tabular-nums">{formatoUsd(haber)}</td></tr></tfoot>
          </table>
        </div>
      </Tarjeta>
    </div>
  );
}
