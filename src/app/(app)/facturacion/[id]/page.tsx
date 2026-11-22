import Link from "next/link";
import { notFound } from "next/navigation";
import { Etiqueta, Tarjeta, clasesBoton } from "@/components/ui";
import { FilasCondiciones } from "@/components/ventas/filas-condiciones";
import { requerirSesion, tienePermiso } from "@/lib/dal";
import { ESTADOS_FACTURA, numeroFactura, type EstadoFactura } from "@/lib/facturacion/estados";
import { numeroPedido } from "@/lib/pedidos/calculos";
import { textoTasa } from "@/lib/tasas";
import { formatoCantidad, formatoFecha, formatoFechaHora, formatoUsd } from "../formato";
import { ESTADOS_NOTA, TIPOS_NOTA, numeroNotaVenta, type EstadoNota } from "@/lib/notas/estados";
import { BotonAnular } from "./boton-anular";
import { numeroRetencion } from "@/lib/retenciones/estados";
import { NumerosFiscales } from "./numeros-fiscales";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DetalleFactura({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const ctx = await requerirSesion();
  const f = await ctx.db.factura.findUnique({
    where: { id },
    include: {
      cliente: { select: { razonSocial: true, documento: true } }, almacen: { select: { nombre: true } },
      pedido: { select: { id: true, numero: true } }, lineas: { orderBy: { linea: "asc" } }, notas: { orderBy: { numero: "asc" } }, retenciones: { orderBy: { numero: "asc" } },
    },
  });
  if (!f) notFound();
  const e = ESTADOS_FACTURA[f.estado as EstadoFactura];
  const puedeAnular = f.estado === "EMITIDA" && tienePermiso(ctx, "facturacion", "eliminar");

  return (
    <div className="flex flex-col gap-6">
      <Tarjeta className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold">{numeroFactura(f.numero)}</h2>
              {e ? <Etiqueta tono={e.tono}>{e.etiqueta}</Etiqueta> : null}
            </div>
            <p className="text-sm text-gris-600">{f.cliente.razonSocial} ({f.cliente.documento})</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {f.estado === "EMITIDA" && tienePermiso(ctx, "facturacion", "crear") ? (
              <>
                <Link href={`/facturacion/notas/nueva?factura=${id}&tipo=CREDITO`} className={clasesBoton("secundario")}>Nota de crédito</Link>
                <Link href={`/facturacion/notas/nueva?factura=${id}&tipo=DEBITO`} className={clasesBoton("secundario")}>Nota de débito</Link>
                {tienePermiso(ctx, "cxc", "crear") ? <Link href={`/cxc/retenciones/nueva?factura=${id}`} className={clasesBoton("secundario")}>Retención sufrida</Link> : null}
              </>
            ) : null}
            {puedeAnular ? <BotonAnular id={id} /> : null}
          </div>
        </div>
        <dl className="mt-4 grid gap-3 text-[13.5px] sm:grid-cols-2 xl:grid-cols-4">
          <div><dt className="text-gris-500">Fecha</dt><dd>{formatoFecha(f.fecha)}</dd></div>
          <div><dt className="text-gris-500">Almacén</dt><dd>{f.almacen.nombre}</dd></div>
          <div><dt className="text-gris-500">Vence</dt><dd>{formatoFecha(f.fechaVencimiento)}{f.diasCredito > 0 ? ` (${f.diasCredito} días)` : " (contado)"}</dd></div>
          <div><dt className="text-gris-500">Tasa USD</dt><dd>{textoTasa(Number(f.tasaUsd))}</dd></div>
          <div><dt className="text-gris-500">Nº de factura fiscal</dt><dd>{f.numeroFiscal ?? "—"}</dd></div>
          <div><dt className="text-gris-500">Nº de control</dt><dd>{f.numeroControl ?? "—"}</dd></div>
          <div><dt className="text-gris-500">Pedido</dt><dd>{f.pedido ? <Link href={`/pedidos/${f.pedido.id}`} className="text-marca-texto hover:underline">{numeroPedido(f.pedido.numero)}</Link> : "—"}</dd></div>
          <div><dt className="text-gris-500">Emitida por</dt><dd>{f.creadoPorNombre ?? "—"} · {formatoFechaHora(f.creadoEn)}</dd></div>
          <FilasCondiciones db={ctx.db} doc={f} />
          <div className="sm:col-span-2"><dt className="text-gris-500">Observaciones</dt><dd>{f.observaciones ?? "—"}</dd></div>
          {f.estado === "ANULADA" ? <div className="sm:col-span-2 xl:col-span-4"><dt className="text-gris-500">Anulada</dt><dd>{f.anuladaPorNombre ?? "—"} · {formatoFechaHora(f.anuladaEn)} · {f.motivoAnulacion}</dd></div> : null}
        </dl>
        {f.estado === "EMITIDA" && tienePermiso(ctx, "facturacion", "editar") ? <div className="mt-4"><NumerosFiscales id={id} fiscal={f.numeroFiscal} control={f.numeroControl} /></div> : null}
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
              {f.lineas.map((l) => (
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
          <div className="flex justify-between"><dt className="text-gris-600">Subtotal</dt><dd className="tabular-nums">{formatoUsd(Number(f.subtotal))}</dd></div>
          <div className="flex justify-between"><dt className="text-gris-600">IVA</dt><dd className="tabular-nums">{formatoUsd(Number(f.iva))}</dd></div>
          <div className="flex justify-between border-t border-linea pt-1 text-[15px] font-semibold"><dt>Total USD</dt><dd className="tabular-nums">{formatoUsd(Number(f.total))}</dd></div>
          {Number(f.ajuste) !== 0 ? <div className="flex justify-between"><dt className="text-gris-600">Ajuste por notas</dt><dd className="tabular-nums">{formatoUsd(Number(f.ajuste))}</dd></div> : null}
          {f.estado === "EMITIDA" ? <div className="flex justify-between font-semibold"><dt>Saldo por cobrar USD</dt><dd className="tabular-nums">{formatoUsd(Number(f.saldo))}</dd></div> : null}
          <div className="flex justify-between text-gris-700"><dt>Total Bs.</dt><dd className="tabular-nums">{formatoUsd(Number(f.totalBs))}</dd></div>
        </dl>
      </Tarjeta>
      {f.notas.length > 0 ? (
        <Tarjeta className="p-6">
          <h3 className="mb-3 text-base font-semibold">Notas de crédito y débito</h3>
          <ul className="flex flex-col gap-2 text-[13.5px]">
            {f.notas.map((n) => {
              const en = ESTADOS_NOTA[n.estado as EstadoNota];
              return (
                <li key={n.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-linea p-3">
                  <span><Link href={`/facturacion/notas/${n.id}`} className="font-semibold hover:underline">{numeroNotaVenta(n.tipo, n.numero)}</Link> · {TIPOS_NOTA[n.tipo as keyof typeof TIPOS_NOTA]} · {n.motivo}</span>
                  <span className="flex items-center gap-2">{en ? <Etiqueta tono={en.tono}>{en.etiqueta}</Etiqueta> : null}<span className="tabular-nums">{n.tipo === "CREDITO" ? "−" : ""}{formatoUsd(Number(n.total))}</span></span>
                </li>
              );
            })}
          </ul>
        </Tarjeta>
      ) : null}
      {f.retenciones.length > 0 ? (
        <Tarjeta className="p-6">
          <h3 className="mb-3 text-base font-semibold">Retenciones sufridas</h3>
          <ul className="flex flex-col gap-2 text-[13.5px]">
            {f.retenciones.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-linea p-3">
                <span><Link href={`/cxc/retenciones/${r.id}`} className="font-semibold hover:underline">{numeroRetencion(r.numero)}</Link> · {r.tipo} {formatoCantidad(Number(r.porcentaje))} % · comprobante {r.comprobante}</span>
                <span className="flex items-center gap-2">{r.estado === "ANULADA" ? <Etiqueta tono="error">Anulada</Etiqueta> : null}<span className="tabular-nums">−{formatoUsd(Number(r.montoUsd))}</span></span>
              </li>
            ))}
          </ul>
        </Tarjeta>
      ) : null}
    </div>
  );
}
