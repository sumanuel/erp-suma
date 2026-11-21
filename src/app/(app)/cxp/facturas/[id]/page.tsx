import Link from "next/link";
import { notFound } from "next/navigation";
import { Etiqueta, Tarjeta } from "@/components/ui";
import { requerirSesion, tienePermiso } from "@/lib/dal";
import { numeroOrden } from "@/lib/compras/calculos";
import { ESTADOS_FACTURA_COMPRA, ESTADOS_PAGO, numeroFacturaCompra, numeroPago, type EstadoFacturaCompra, type EstadoPago } from "@/lib/cxp/estados";
import { formatoFecha, formatoFechaHora, formatoUsd } from "../../formato";
import { BotonAnularFacturaProveedor } from "./boton-anular";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DetalleFacturaProveedor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const ctx = await requerirSesion();
  const f = await ctx.db.facturaCompra.findUnique({
    where: { id },
    include: {
      proveedor: { select: { id: true, razonSocial: true, documento: true } }, orden: { select: { id: true, numero: true } },
      aplicaciones: { include: { pago: { select: { id: true, numero: true, estado: true, fecha: true } } }, orderBy: { pago: { numero: "asc" } } },
    },
  });
  if (!f) notFound();
  const e = ESTADOS_FACTURA_COMPRA[f.estado as EstadoFacturaCompra];
  const puedeAnular = f.estado === "REGISTRADA" && tienePermiso(ctx, "cxp", "eliminar");
  return (
    <div className="flex flex-col gap-6">
      <Tarjeta className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold">{numeroFacturaCompra(f.numero)} · {f.documento}</h2>
              {e ? <Etiqueta tono={e.tono}>{e.etiqueta}</Etiqueta> : null}
            </div>
            <p className="text-sm text-gris-600"><Link href={`/cxp/proveedor/${f.proveedor.id}`} className="hover:underline">{f.proveedor.razonSocial}</Link> ({f.proveedor.documento})</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">{puedeAnular ? <BotonAnularFacturaProveedor id={id} /> : null}</div>
        </div>
        <dl className="mt-4 grid gap-3 text-[13.5px] sm:grid-cols-2 xl:grid-cols-4">
          <div><dt className="text-gris-500">Fecha</dt><dd>{formatoFecha(f.fecha)}</dd></div>
          <div><dt className="text-gris-500">Vence</dt><dd>{formatoFecha(f.fechaVencimiento)}{f.diasCredito > 0 ? ` (${f.diasCredito} días)` : " (contado)"}</dd></div>
          <div><dt className="text-gris-500">Nº de control</dt><dd>{f.numeroControl ?? "—"}</dd></div>
          <div><dt className="text-gris-500">Orden de compra</dt><dd>{f.orden ? <Link href={`/compras/${f.orden.id}`} className="text-marca-texto hover:underline">{numeroOrden(f.orden.numero)}</Link> : "—"}</dd></div>
          <div><dt className="text-gris-500">Base USD</dt><dd className="tabular-nums">{formatoUsd(Number(f.subtotal))}</dd></div>
          <div><dt className="text-gris-500">IVA USD</dt><dd className="tabular-nums">{formatoUsd(Number(f.iva))}</dd></div>
          <div><dt className="text-gris-500">Total USD</dt><dd className="font-semibold tabular-nums">{formatoUsd(Number(f.total))}</dd></div>
          <div><dt className="text-gris-500">Saldo por pagar USD</dt><dd className="font-semibold tabular-nums">{formatoUsd(Number(f.saldo))}</dd></div>
          <div className="sm:col-span-2"><dt className="text-gris-500">Registrada por</dt><dd>{f.creadoPorNombre ?? "—"} · {formatoFechaHora(f.creadoEn)}</dd></div>
          <div className="sm:col-span-2"><dt className="text-gris-500">Observaciones</dt><dd>{f.observaciones ?? "—"}</dd></div>
          {f.estado === "ANULADA" ? <div className="sm:col-span-2 xl:col-span-4"><dt className="text-gris-500">Anulada</dt><dd>{f.anuladaPorNombre ?? "—"} · {formatoFechaHora(f.anuladaEn)} · {f.motivoAnulacion}</dd></div> : null}
        </dl>
      </Tarjeta>
      {f.aplicaciones.length > 0 ? (
        <Tarjeta>
          <h3 className="px-4 pt-4 text-base font-semibold">Pagos aplicados</h3>
          <table className="mt-2 w-full text-left text-[13.5px]">
            <thead><tr className="border-y border-linea text-[12.5px] text-gris-600"><th className="px-4 py-3 font-medium">Pago</th><th className="px-3 py-3 font-medium">Fecha</th><th className="px-3 py-3 font-medium">Estado</th><th className="px-4 py-3 text-right font-medium">Aplicado USD</th></tr></thead>
            <tbody>
              {f.aplicaciones.map((a) => {
                const ep = ESTADOS_PAGO[a.pago.estado as EstadoPago];
                return (
                  <tr key={a.id} className="border-b border-linea last:border-0">
                    <td className="px-4 py-3 font-semibold"><Link href={`/cxp/pagos/${a.pago.id}`} className="hover:underline">{numeroPago(a.pago.numero)}</Link></td>
                    <td className="px-3 py-3">{formatoFecha(a.pago.fecha)}</td>
                    <td className="px-3 py-3">{ep ? <Etiqueta tono={ep.tono}>{ep.etiqueta}</Etiqueta> : a.pago.estado}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatoUsd(Number(a.montoUsd))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Tarjeta>
      ) : null}
    </div>
  );
}
