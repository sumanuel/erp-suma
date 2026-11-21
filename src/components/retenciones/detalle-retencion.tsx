import Link from "next/link";
import { notFound } from "next/navigation";
import { Etiqueta, Tarjeta } from "@/components/ui";
import { requerirSesion, tienePermiso } from "@/lib/dal";
import { numeroFactura } from "@/lib/facturacion/estados";
import { numeroFacturaCompra } from "@/lib/cxp/estados";
import { ESTADOS_RETENCION, SENTIDOS_RETENCION, numeroEntero, numeroRetencion, type EstadoRetencion } from "@/lib/retenciones/estados";
import { textoTasa } from "@/lib/tasas";
import { AccionesRetencion } from "./acciones-retencion";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fecha = new Intl.DateTimeFormat("es-VE", { dateStyle: "short", timeZone: "UTC" });
const fechaHora = new Intl.DateTimeFormat("es-VE", { dateStyle: "short", timeStyle: "short", timeZone: "America/Caracas" });
const monto = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

/** Detalle (e impresión) de una retención. `modulo` define el permiso y a dónde se enlaza la factura. */
export async function DetalleRetencion({ id, modulo, anular }: { id: string; modulo: "cxc" | "cxp"; anular: (id: string, motivo: string) => Promise<string | null> }) {
  if (!UUID.test(id)) notFound();
  const ctx = await requerirSesion();
  const empresa = await ctx.db.empresa.findUnique({ where: { id: 1 } });
  const r = await ctx.db.retencion.findUnique({
    where: { id },
    include: { entero: { select: { id: true, numero: true, estado: true } }, proveedor: { select: { id: true, razonSocial: true, documento: true } }, cliente: { select: { id: true, razonSocial: true, documento: true } }, facturaCompra: { select: { id: true, numero: true, documento: true } }, factura: { select: { id: true, numero: true, numeroFiscal: true } } },
  });
  if (!r) notFound();
  const practicada = r.sentido === "PRACTICADA";
  if ((modulo === "cxp") !== practicada) notFound();
  const e = ESTADOS_RETENCION[r.estado as EstadoRetencion];
  const t = practicada ? r.proveedor : r.cliente;
  return (
    <div className="flex flex-col gap-6">
      {practicada ? (
        <Tarjeta className="hidden p-6 print:block">
          <p className="text-[13px] text-gris-500">Comprobante de retención de {r.tipo} · Agente de retención</p>
          <p className="text-lg font-semibold">{empresa?.razonSocial ?? "(sin razón social)"}</p>
          <p className="text-sm">RIF {empresa?.rif ?? "(sin RIF)"}{empresa?.direccion ? ` · ${empresa.direccion}` : ""}{empresa?.telefono ? ` · Tel. ${empresa.telefono}` : ""}</p>
        </Tarjeta>
      ) : null}
      <Tarjeta className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3"><h2 className="text-xl font-semibold">{numeroRetencion(r.numero)} · Comprobante {r.comprobante}</h2>{e ? <Etiqueta tono={e.tono}>{e.etiqueta}</Etiqueta> : null}</div>
            <p className="text-sm text-gris-600">Retención de {r.tipo} · {SENTIDOS_RETENCION[r.sentido as keyof typeof SENTIDOS_RETENCION]}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden"><AccionesRetencion id={id} vigente={r.estado === "ACTIVA"} puedeAnular={tienePermiso(ctx, modulo, "eliminar")} anular={anular} /></div>
        </div>
        <dl className="mt-4 grid gap-3 text-[13.5px] sm:grid-cols-2 xl:grid-cols-4">
          <div><dt className="text-gris-500">{practicada ? "Proveedor (sujeto retenido)" : "Cliente (agente de retención)"}</dt><dd>{t?.razonSocial} ({t?.documento})</dd></div>
          <div><dt className="text-gris-500">Factura</dt><dd>{practicada && r.facturaCompra ? <Link href={`/cxp/facturas/${r.facturaCompra.id}`} className="text-marca-texto hover:underline">{numeroFacturaCompra(r.facturaCompra.numero)} · {r.facturaCompra.documento}</Link> : r.factura ? <Link href={`/facturacion/${r.factura.id}`} className="text-marca-texto hover:underline">{r.factura.numeroFiscal ?? numeroFactura(r.factura.numero)}</Link> : "—"}</dd></div>
          <div><dt className="text-gris-500">Fecha del comprobante</dt><dd>{fecha.format(r.fecha)}</dd></div>
          <div><dt className="text-gris-500">Concepto</dt><dd>{r.concepto ?? "—"}</dd></div>
          <div><dt className="text-gris-500">Base (USD)</dt><dd className="tabular-nums">{monto(Number(r.baseUsd))}</dd></div>
          <div><dt className="text-gris-500">Porcentaje</dt><dd className="tabular-nums">{monto(Number(r.porcentaje))} %</dd></div>
          <div><dt className="text-gris-500">Retenido USD</dt><dd className="font-semibold tabular-nums">{monto(Number(r.montoUsd))}</dd></div>
          <div><dt className="text-gris-500">Retenido Bs. (tasa {textoTasa(Number(r.tasaUsd))})</dt><dd className="font-semibold tabular-nums">{monto(Number(r.montoBs))}</dd></div>
          {practicada ? <div><dt className="text-gris-500">Enterada al fisco</dt><dd>{r.entero ? <Link href={`/cxp/enteros/${r.entero.id}`} className="text-marca-texto hover:underline">{numeroEntero(r.entero.numero)}</Link> : "Pendiente"}</dd></div> : null}
          <div className="sm:col-span-2"><dt className="text-gris-500">Registrada por</dt><dd>{r.creadoPorNombre ?? "—"} · {fechaHora.format(r.creadoEn)}</dd></div>
          {r.estado === "ANULADA" ? <div className="sm:col-span-2 xl:col-span-4"><dt className="text-gris-500">Anulada</dt><dd>{r.anuladaPorNombre ?? "—"} · {r.anuladaEn ? fechaHora.format(r.anuladaEn) : ""} · {r.motivoAnulacion}</dd></div> : null}
        </dl>
      </Tarjeta>
    </div>
  );
}
