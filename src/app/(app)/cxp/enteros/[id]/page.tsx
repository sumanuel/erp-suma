import Link from "next/link";
import { notFound } from "next/navigation";
import { Etiqueta, Tarjeta } from "@/components/ui";
import { requerirSesion, tienePermiso } from "@/lib/dal";
import { ESTADOS_ENTERO, numeroEntero, numeroRetencion, type EstadoEntero } from "@/lib/retenciones/estados";
import { formatoFecha, formatoFechaHora, formatoUsd } from "../../formato";
import { BotonAnularEntero } from "./boton-anular";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DetalleEntero({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const ctx = await requerirSesion();
  const e = await ctx.db.enteroRetencion.findUnique({ where: { id }, include: { cuenta: { select: { id: true, codigo: true, nombre: true } }, retenciones: { orderBy: { numero: "asc" }, include: { proveedor: { select: { razonSocial: true } } } } } });
  if (!e) notFound();
  const est = ESTADOS_ENTERO[e.estado as EstadoEntero];
  return (
    <div className="flex flex-col gap-6">
      <Tarjeta className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3"><h2 className="text-xl font-semibold">{numeroEntero(e.numero)} · Retenciones de {e.tipo}</h2>{est ? <Etiqueta tono={est.tono}>{est.etiqueta}</Etiqueta> : null}</div>
            <p className="text-sm text-gris-600">Pago al fisco de lo retenido a proveedores</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">{e.estado === "ACTIVO" && tienePermiso(ctx, "cxp", "eliminar") ? <BotonAnularEntero id={id} /> : null}</div>
        </div>
        <dl className="mt-4 grid gap-3 text-[13.5px] sm:grid-cols-2 xl:grid-cols-4">
          <div><dt className="text-gris-500">Fecha</dt><dd>{formatoFecha(e.fecha)}</dd></div>
          <div><dt className="text-gris-500">Pagado desde</dt><dd><Link href={`/tesoreria/cuentas/${e.cuenta.id}`} className="text-marca-texto hover:underline">{e.cuenta.codigo} · {e.cuenta.nombre}</Link></dd></div>
          <div><dt className="text-gris-500">Referencia</dt><dd>{e.referencia ?? "—"}</dd></div>
          <div><dt className="text-gris-500">Total Bs.</dt><dd className="text-lg font-semibold tabular-nums">{formatoUsd(Number(e.montoBs))}</dd></div>
          <div className="sm:col-span-2"><dt className="text-gris-500">Registrado por</dt><dd>{e.creadoPorNombre ?? "—"} · {formatoFechaHora(e.creadoEn)}</dd></div>
          {e.estado === "ANULADO" ? <div className="sm:col-span-2 xl:col-span-4"><dt className="text-gris-500">Anulado</dt><dd>{e.anuladoPorNombre ?? "—"} · {formatoFechaHora(e.anuladoEn)} · {e.motivoAnulacion}</dd></div> : null}
        </dl>
      </Tarjeta>
      {e.retenciones.length > 0 ? (
        <Tarjeta>
          <table className="w-full text-left text-[13.5px]">
            <thead><tr className="border-b border-linea text-[12.5px] text-gris-600"><th className="px-4 py-3 font-medium">Retención</th><th className="px-3 py-3 font-medium">Comprobante</th><th className="px-3 py-3 font-medium">Proveedor</th><th className="px-4 py-3 text-right font-medium">Retenido Bs.</th></tr></thead>
            <tbody>
              {e.retenciones.map((r) => (
                <tr key={r.id} className="border-b border-linea last:border-0">
                  <td className="px-4 py-3 font-semibold"><Link href={`/cxp/retenciones/${r.id}`} className="hover:underline">{numeroRetencion(r.numero)}</Link></td>
                  <td className="px-3 py-3">{r.comprobante}</td>
                  <td className="px-3 py-3">{r.proveedor?.razonSocial}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatoUsd(Number(r.montoBs))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Tarjeta>
      ) : null}
    </div>
  );
}
