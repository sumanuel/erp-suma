import Link from "next/link";
import { notFound } from "next/navigation";
import { Etiqueta, Tarjeta } from "@/components/ui";
import { requerirSesion, tienePermiso } from "@/lib/dal";
import { numeroFactura } from "@/lib/facturacion/estados";
import { nombreFormaCobro } from "@/lib/cxc/estados";
import { ESTADOS_NOTA, MODOS_NOTA_VENTA, TIPOS_NOTA, numeroNotaVenta, type EstadoNota } from "@/lib/notas/estados";
import { textoTasa } from "@/lib/tasas";
import { formatoCantidad, formatoFecha, formatoFechaHora, formatoUsd } from "../../formato";
import { BotonAnularNota } from "./boton-anular";
import { DatosFiscales } from "@/components/ventas/datos-fiscales";
import { seriesDe } from "@/lib/series-fiscales";
import { registrarNumerosFiscalesNota } from "../../acciones";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DetalleNotaVenta({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const ctx = await requerirSesion();
  const n = await ctx.db.notaVenta.findUnique({ where: { id }, include: { cliente: { select: { razonSocial: true, documento: true } }, factura: { select: { id: true, numero: true, numeroFiscal: true, impresoraSerial: true } }, almacen: { select: { nombre: true } }, lineas: { orderBy: { linea: "asc" } }, reintegros: true } });
  if (!n) notFound();
  const e = ESTADOS_NOTA[n.estado as EstadoNota];
  const cuentas = new Map((await ctx.db.cuentaTesoreria.findMany({ where: { id: { in: n.reintegros.map((r) => r.cuentaId) } }, select: { id: true, codigo: true } })).map((c) => [c.id, c.codigo]));
  const credito = n.tipo === "CREDITO";
  return (
    <div className="flex flex-col gap-6">
      <Tarjeta className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3"><h2 className="text-xl font-semibold">{numeroNotaVenta(n.tipo, n.numero)}</h2>{e ? <Etiqueta tono={e.tono}>{e.etiqueta}</Etiqueta> : null}</div>
            <p className="text-sm text-gris-600">{TIPOS_NOTA[n.tipo as keyof typeof TIPOS_NOTA]} · {MODOS_NOTA_VENTA[n.modo as keyof typeof MODOS_NOTA_VENTA]}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">{n.estado === "ACTIVA" && tienePermiso(ctx, "facturacion", "eliminar") ? <BotonAnularNota id={id} /> : null}</div>
        </div>
        <dl className="mt-4 grid gap-3 text-[13.5px] sm:grid-cols-2 xl:grid-cols-4">
          <div><dt className="text-gris-500">Cliente</dt><dd>{n.cliente.razonSocial} ({n.cliente.documento})</dd></div>
          <div><dt className="text-gris-500">Factura</dt><dd><Link href={`/facturacion/${n.factura.id}`} className="text-marca-texto hover:underline">{numeroFactura(n.factura.numero)}</Link></dd></div>
          <div><dt className="text-gris-500">Nº fiscal de la factura afectada</dt><dd>{n.factura.numeroFiscal ?? "—"}{n.factura.impresoraSerial ? ` · ${n.factura.impresoraSerial}` : ""}</dd></div>
          <div><dt className="text-gris-500">Nº fiscal de la nota</dt><dd>{n.numeroFiscal ?? "—"}</dd></div>
          <div><dt className="text-gris-500">Nº de control</dt><dd>{n.numeroControl ?? "—"}</dd></div>
          <div><dt className="text-gris-500">Impresora fiscal</dt><dd>{n.impresoraSerial || n.impresoraModelo ? [n.impresoraModelo, n.impresoraSerial].filter(Boolean).join(" · ") : "—"}</dd></div>
          <div><dt className="text-gris-500">Fecha</dt><dd>{formatoFecha(n.fecha)}</dd></div>
          <div><dt className="text-gris-500">Tasa USD (la de la factura)</dt><dd>{textoTasa(Number(n.tasaUsd))}</dd></div>
          <div className="sm:col-span-2"><dt className="text-gris-500">Motivo</dt><dd>{n.motivo}</dd></div>
          {n.almacen ? <div><dt className="text-gris-500">Mercancía regresa a</dt><dd>{n.almacen.nombre}</dd></div> : null}
          <div><dt className="text-gris-500">Emitida por</dt><dd>{n.creadoPorNombre ?? "—"} · {formatoFechaHora(n.creadoEn)}</dd></div>
          {n.estado === "ANULADA" ? <div className="sm:col-span-2 xl:col-span-4"><dt className="text-gris-500">Anulada</dt><dd>{n.anuladaPorNombre ?? "—"} · {formatoFechaHora(n.anuladaEn)} · {n.motivoAnulacion}</dd></div> : null}
        </dl>
        {n.estado === "ACTIVA" && tienePermiso(ctx, "facturacion", "editar") ? <div className="mt-4"><DatosFiscales valores={{ numeroFiscal: n.numeroFiscal, numeroControl: n.numeroControl, impresoraSerial: n.impresoraSerial, impresoraModelo: n.impresoraModelo }} series={await seriesDe(ctx.db, credito ? "NOTA_CREDITO" : "NOTA_DEBITO")} accion={registrarNumerosFiscalesNota.bind(null, id)} /></div> : null}
      </Tarjeta>
      {n.lineas.length > 0 ? (
        <Tarjeta>
          <table className="w-full text-left text-[13.5px]">
            <thead><tr className="border-b border-linea text-[12.5px] text-gris-600"><th className="px-4 py-3 font-medium">Producto devuelto</th><th className="px-3 py-3 text-right font-medium">Cantidad</th><th className="px-3 py-3 text-right font-medium">Precio USD</th><th className="px-3 py-3 text-right font-medium">IVA %</th><th className="px-4 py-3 text-right font-medium">Total</th></tr></thead>
            <tbody>
              {n.lineas.map((l) => (
                <tr key={l.id} className="border-b border-linea last:border-0">
                  <td className="px-4 py-3"><span className="font-semibold">{l.productoCodigo}</span> · {l.descripcion}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatoCantidad(Number(l.cantidad))}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatoUsd(Number(l.precioUnitario))}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatoCantidad(Number(l.ivaPorcentaje))}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatoUsd(Number(l.total))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Tarjeta>
      ) : null}
      {Number(n.excedente) > 0 ? (
        <Tarjeta className="p-6">
          <h3 className="mb-1 text-base font-semibold">Dinero devuelto al cliente</h3>
          <p className="mb-3 text-[13px] text-gris-600">{formatoUsd(Number(n.excedente))} USD ya estaban cobrados; el resto de la nota bajó lo que debía.{n.estado === "ANULADA" ? " Al anular la nota, el dinero volvió a las cuentas." : ""}</p>
          <ul className="flex flex-col gap-2 text-[13.5px]">
            {n.reintegros.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-linea p-3">
                <span>{nombreFormaCobro(r.formaPago)} · sale de {cuentas.get(r.cuentaId) ?? "—"}{r.referencia ? ` · ref. ${r.referencia}` : ""}</span>
                <span className="font-semibold tabular-nums">{formatoUsd(Number(r.monto))} {r.moneda === "VES" ? "Bs." : "USD"}</span>
              </li>
            ))}
            {Number(n.saldoFavor) > 0 ? (
              <li className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-linea p-3">
                <span>Saldo a favor del cliente{n.cobroFavorId ? <> · <Link href={`/cxc/cobros/${n.cobroFavorId}`} className="text-marca-texto hover:underline">ver y aplicar</Link></> : null}</span>
                <span className="font-semibold tabular-nums">{formatoUsd(Number(n.saldoFavor))} USD</span>
              </li>
            ) : null}
          </ul>
        </Tarjeta>
      ) : null}
      <Tarjeta>
        <dl className="ml-auto flex w-full max-w-xs flex-col gap-1 p-4 text-[13.5px]">
          <div className="flex justify-between"><dt className="text-gris-600">Subtotal</dt><dd className="tabular-nums">{formatoUsd(Number(n.subtotal))}</dd></div>
          <div className="flex justify-between"><dt className="text-gris-600">IVA{n.ivaPorcentaje ? ` ${formatoCantidad(Number(n.ivaPorcentaje))} %` : ""}</dt><dd className="tabular-nums">{formatoUsd(Number(n.iva))}</dd></div>
          <div className="flex justify-between border-t border-linea pt-1 text-[15px] font-semibold"><dt>Total USD</dt><dd className="tabular-nums">{credito ? "−" : ""}{formatoUsd(Number(n.total))}</dd></div>
        </dl>
      </Tarjeta>
    </div>
  );
}
