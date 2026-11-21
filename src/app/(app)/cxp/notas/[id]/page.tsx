import Link from "next/link";
import { notFound } from "next/navigation";
import { Etiqueta, Tarjeta } from "@/components/ui";
import { requerirSesion, tienePermiso } from "@/lib/dal";
import { numeroFacturaCompra } from "@/lib/cxp/estados";
import { ESTADOS_NOTA, TIPOS_NOTA, numeroNotaCompra, type EstadoNota } from "@/lib/notas/estados";
import { textoTasa } from "@/lib/tasas";
import { formatoFecha, formatoFechaHora, formatoUsd } from "../../formato";
import { BotonAnularNotaProveedor } from "./boton-anular";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DetalleNotaCompra({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const ctx = await requerirSesion();
  const n = await ctx.db.notaCompra.findUnique({ where: { id }, include: { proveedor: { select: { id: true, razonSocial: true, documento: true } }, factura: { select: { id: true, numero: true, documento: true } } } });
  if (!n) notFound();
  const e = ESTADOS_NOTA[n.estado as EstadoNota];
  const credito = n.tipo === "CREDITO";
  return (
    <div className="flex flex-col gap-6">
      <Tarjeta className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3"><h2 className="text-xl font-semibold">{numeroNotaCompra(n.tipo, n.numero)} · {n.documento}</h2>{e ? <Etiqueta tono={e.tono}>{e.etiqueta}</Etiqueta> : null}</div>
            <p className="text-sm text-gris-600">{TIPOS_NOTA[n.tipo as keyof typeof TIPOS_NOTA]} del proveedor</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">{n.estado === "ACTIVA" && tienePermiso(ctx, "cxp", "eliminar") ? <BotonAnularNotaProveedor id={id} /> : null}</div>
        </div>
        <dl className="mt-4 grid gap-3 text-[13.5px] sm:grid-cols-2 xl:grid-cols-4">
          <div><dt className="text-gris-500">Proveedor</dt><dd><Link href={`/cxp/proveedor/${n.proveedor.id}`} className="hover:underline">{n.proveedor.razonSocial}</Link> ({n.proveedor.documento})</dd></div>
          <div><dt className="text-gris-500">Factura</dt><dd><Link href={`/cxp/facturas/${n.factura.id}`} className="text-marca-texto hover:underline">{numeroFacturaCompra(n.factura.numero)} · {n.factura.documento}</Link></dd></div>
          <div><dt className="text-gris-500">Fecha</dt><dd>{formatoFecha(n.fecha)}</dd></div>
          <div><dt className="text-gris-500">Nº de control</dt><dd>{n.numeroControl ?? "—"}</dd></div>
          <div className="sm:col-span-2"><dt className="text-gris-500">Motivo</dt><dd>{n.motivo}</dd></div>
          <div><dt className="text-gris-500">Tasa USD (la de la factura)</dt><dd>{textoTasa(Number(n.tasaUsd))}</dd></div>
          <div><dt className="text-gris-500">Registrada por</dt><dd>{n.creadoPorNombre ?? "—"} · {formatoFechaHora(n.creadoEn)}</dd></div>
          {n.estado === "ANULADA" ? <div className="sm:col-span-2 xl:col-span-4"><dt className="text-gris-500">Anulada</dt><dd>{n.anuladaPorNombre ?? "—"} · {formatoFechaHora(n.anuladaEn)} · {n.motivoAnulacion}</dd></div> : null}
        </dl>
      </Tarjeta>
      <Tarjeta>
        <dl className="ml-auto flex w-full max-w-xs flex-col gap-1 p-4 text-[13.5px]">
          <div className="flex justify-between"><dt className="text-gris-600">Base</dt><dd className="tabular-nums">{formatoUsd(Number(n.subtotal))}</dd></div>
          <div className="flex justify-between"><dt className="text-gris-600">IVA</dt><dd className="tabular-nums">{formatoUsd(Number(n.iva))}</dd></div>
          <div className="flex justify-between border-t border-linea pt-1 text-[15px] font-semibold"><dt>Total USD</dt><dd className="tabular-nums">{credito ? "−" : ""}{formatoUsd(Number(n.total))}</dd></div>
        </dl>
      </Tarjeta>
    </div>
  );
}
