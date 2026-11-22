import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { Etiqueta, Tarjeta, clasesBoton } from "@/components/ui";
import { FilasCondiciones } from "@/components/ventas/filas-condiciones";
import { requerirSesion, tienePermiso } from "@/lib/dal";
import { ESTADOS_COTIZACION, estaVigente, numeroCotizacion, type EstadoCotizacion } from "@/lib/cotizaciones/estados";
import { numeroPedido } from "@/lib/pedidos/calculos";
import { aBolivares, hoyCaracas, textoTasa } from "@/lib/tasas";
import { formatoCantidad, formatoFecha, formatoFechaHora, formatoUsd } from "../formato";
import { BotonesEstado } from "./botones";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DetalleCotizacion({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const ctx = await requerirSesion();
  const c = await ctx.db.cotizacion.findUnique({
    where: { id },
    include: { cliente: { select: { razonSocial: true, documento: true } }, lineas: { orderBy: { linea: "asc" } }, pedidos: { select: { id: true, numero: true } } },
  });
  if (!c) notFound();
  const e = ESTADOS_COTIZACION[c.estado as EstadoCotizacion];
  const vigente = estaVigente(hoyCaracas(), c.fechaVencimiento);
  const vencida = c.estado === "EMITIDA" && !vigente;
  const puedeEditar = tienePermiso(ctx, "cotizaciones", "editar");
  const borrador = c.estado === "BORRADOR";
  const emitida = c.estado === "EMITIDA";
  const tasa = c.tasaUsd ? Number(c.tasaUsd) : null;
  const total = Number(c.total);

  return (
    <div className="flex flex-col gap-6">
      <Tarjeta className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold">{numeroCotizacion(c.numero)}</h2>
              {e ? <Etiqueta tono={e.tono}>{e.etiqueta}</Etiqueta> : null}
              {vencida ? <Etiqueta tono="aviso">Vencida</Etiqueta> : null}
            </div>
            <p className="text-sm text-gris-600">{c.cliente.razonSocial} ({c.cliente.documento})</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {borrador && puedeEditar ? <Link href={`/cotizaciones/${id}/editar`} className={clasesBoton("secundario")}><Pencil className="size-4" aria-hidden />Editar</Link> : null}
            <BotonesEstado
              id={id}
              puedeEmitir={borrador && puedeEditar}
              puedeConvertir={emitida && vigente && puedeEditar && tienePermiso(ctx, "pedidos", "crear")}
              puedeRechazar={emitida && puedeEditar}
              puedeAnular={(borrador || emitida) && tienePermiso(ctx, "cotizaciones", "eliminar")}
            />
          </div>
        </div>
        <dl className="mt-4 grid gap-3 text-[13.5px] sm:grid-cols-2 xl:grid-cols-4">
          <div><dt className="text-gris-500">Fecha</dt><dd>{formatoFecha(c.fecha)}</dd></div>
          <div><dt className="text-gris-500">Válida hasta</dt><dd className={vencida ? "text-error" : ""}>{formatoFecha(c.fechaVencimiento)} ({c.validezDias} días)</dd></div>
          <div><dt className="text-gris-500">Tasa USD (al emitir)</dt><dd>{tasa ? textoTasa(tasa) : "—"}</dd></div>
          <div><dt className="text-gris-500">Creada por</dt><dd>{c.creadoPorNombre ?? "—"} · {formatoFechaHora(c.creadoEn)}</dd></div>
          <FilasCondiciones db={ctx.db} doc={c} />
          <div className="sm:col-span-2"><dt className="text-gris-500">Observaciones</dt><dd>{c.observaciones ?? "—"}</dd></div>
          {c.pedidos.length > 0 ? <div><dt className="text-gris-500">Pedido</dt><dd>{c.pedidos.map((p) => <Link key={p.id} href={`/pedidos/${p.id}`} className="text-marca-texto hover:underline">{numeroPedido(p.numero)}</Link>)}</dd></div> : null}
          {c.estado === "RECHAZADA" ? <div className="sm:col-span-2"><dt className="text-gris-500">Motivo del rechazo</dt><dd>{c.motivoCierre ?? "—"}</dd></div> : null}
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
              {c.lineas.map((l) => (
                <tr key={l.id} className="border-b border-linea last:border-0">
                  <td className="px-4 py-3"><span className="font-semibold">{l.productoCodigo}</span> · {l.descripcion}{l.presentacionId ? <span className="ml-2 text-[12.5px] text-gris-500">{Number(l.cantidad) / Number(l.factor)} × presentación de {Number(l.factor)} = {Number(l.cantidad)} u.</span> : null}</td>
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
          <div className="flex justify-between"><dt className="text-gris-600">Subtotal</dt><dd className="tabular-nums">{formatoUsd(Number(c.subtotal))}</dd></div>
          <div className="flex justify-between"><dt className="text-gris-600">IVA</dt><dd className="tabular-nums">{formatoUsd(Number(c.iva))}</dd></div>
          <div className="flex justify-between border-t border-linea pt-1 text-[15px] font-semibold"><dt>Total USD</dt><dd className="tabular-nums">{formatoUsd(total)}</dd></div>
          {tasa ? <div className="flex justify-between text-gris-700"><dt>Total Bs.</dt><dd className="tabular-nums">{formatoUsd(aBolivares(total, tasa))}</dd></div> : null}
        </dl>
      </Tarjeta>
    </div>
  );
}
