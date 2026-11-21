import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { Etiqueta, Tarjeta, clasesBoton } from "@/components/ui";
import { requerirSesion, tienePermiso } from "@/lib/dal";
import { ESTADOS_PEDIDO, numeroPedido, type EstadoPedido } from "@/lib/pedidos/calculos";
import { numeroFactura } from "@/lib/facturacion/estados";
import { aBolivares, textoTasa } from "@/lib/tasas";
import { formatoCantidad, formatoFecha, formatoFechaHora, formatoUsd } from "../formato";
import { BotonesEstado } from "./botones";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DetallePedido({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const ctx = await requerirSesion();
  const p = await ctx.db.pedidoVenta.findUnique({
    where: { id },
    include: { cliente: { select: { razonSocial: true, documento: true } }, lineas: { orderBy: { linea: "asc" } }, facturas: { where: { estado: "EMITIDA" }, select: { id: true, numero: true } } },
  });
  if (!p) notFound();
  const e = ESTADOS_PEDIDO[p.estado as EstadoPedido];
  const puedeEditar = tienePermiso(ctx, "pedidos", "editar");
  const borrador = p.estado === "BORRADOR";
  const anulable = p.estado === "BORRADOR" || p.estado === "CONFIRMADO";
  const tasa = p.tasaUsd ? Number(p.tasaUsd) : null;
  const total = Number(p.total);

  return (
    <div className="flex flex-col gap-6">
      <Tarjeta className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold">{numeroPedido(p.numero)}</h2>
              {e ? <Etiqueta tono={e.tono}>{e.etiqueta}</Etiqueta> : null}
            </div>
            <p className="text-sm text-gris-600">{p.cliente.razonSocial} ({p.cliente.documento})</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {p.estado === "CONFIRMADO" && tienePermiso(ctx, "facturacion", "crear") ? <Link href={`/facturacion/nueva?pedido=${id}`} className={clasesBoton("primario")}>Facturar</Link> : null}
            {borrador && puedeEditar ? <Link href={`/pedidos/${id}/editar`} className={clasesBoton("secundario")}><Pencil className="size-4" aria-hidden />Editar</Link> : null}
            <BotonesEstado id={id} puedeConfirmar={borrador && puedeEditar} puedeAnular={anulable && tienePermiso(ctx, "pedidos", "eliminar")} />
          </div>
        </div>
        <dl className="mt-4 grid gap-3 text-[13.5px] sm:grid-cols-2 xl:grid-cols-4">
          <div><dt className="text-gris-500">Fecha</dt><dd>{formatoFecha(p.fecha)}</dd></div>
          <div><dt className="text-gris-500">Creado por</dt><dd>{p.creadoPorNombre ?? "—"} · {formatoFechaHora(p.creadoEn)}</dd></div>
          <div><dt className="text-gris-500">Tasa USD (al confirmar)</dt><dd>{tasa ? textoTasa(tasa) : "—"}</dd></div>
          <div><dt className="text-gris-500">Observaciones</dt><dd>{p.observaciones ?? "—"}</dd></div>
          {p.facturas.length > 0 ? <div><dt className="text-gris-500">Factura</dt><dd>{p.facturas.map((f) => <Link key={f.id} href={`/facturacion/${f.id}`} className="text-marca-texto hover:underline">{numeroFactura(f.numero)}</Link>)}</dd></div> : null}
        </dl>
      </Tarjeta>

      <Tarjeta>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-linea text-[12.5px] text-gris-600">
                <th className="px-4 py-3 font-medium">Producto</th><th className="px-3 py-3 text-right font-medium">Cantidad</th><th className="px-3 py-3 text-right font-medium">Precio USD</th>
                <th className="px-3 py-3 text-right font-medium">Desc. %</th><th className="px-3 py-3 text-right font-medium">IVA %</th><th className="px-4 py-3 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {p.lineas.map((l) => (
                <tr key={l.id} className="border-b border-linea last:border-0">
                  <td className="px-4 py-3"><span className="font-semibold">{l.productoCodigo}</span> · {l.descripcion}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatoCantidad(Number(l.cantidad))}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatoUsd(Number(l.precioUnitario))}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatoCantidad(Number(l.descuento))}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatoCantidad(Number(l.ivaPorcentaje))}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatoUsd(Number(l.total))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="ml-auto flex w-full max-w-xs flex-col gap-1 p-4 text-[13.5px]">
          <div className="flex justify-between"><dt className="text-gris-600">Subtotal</dt><dd className="tabular-nums">{formatoUsd(Number(p.subtotal))}</dd></div>
          <div className="flex justify-between"><dt className="text-gris-600">IVA</dt><dd className="tabular-nums">{formatoUsd(Number(p.iva))}</dd></div>
          <div className="flex justify-between border-t border-linea pt-1 text-[15px] font-semibold"><dt>Total USD</dt><dd className="tabular-nums">{formatoUsd(total)}</dd></div>
          {tasa ? <div className="flex justify-between text-gris-700"><dt>Total Bs.</dt><dd className="tabular-nums">{formatoUsd(aBolivares(total, tasa))}</dd></div> : null}
        </dl>
      </Tarjeta>
    </div>
  );
}
