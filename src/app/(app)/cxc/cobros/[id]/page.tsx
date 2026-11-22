import Link from "next/link";
import { notFound } from "next/navigation";
import { Etiqueta, Tarjeta } from "@/components/ui";
import { requerirSesion, tienePermiso } from "@/lib/dal";
import { ESTADOS_COBRO, FORMAS_PAGO, numeroCobro, numeroRecibo, type EstadoCobro } from "@/lib/cxc/estados";
import { numeroFactura } from "@/lib/facturacion/estados";
import { textoTasa } from "@/lib/tasas";
import { formatoFecha, formatoFechaHora, formatoUsd } from "../../formato";
import { BotonAnularCobro } from "./boton-anular";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DetalleCobro({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const ctx = await requerirSesion();
  const c = await ctx.db.cobro.findUnique({
    where: { id },
    include: { cuenta: { select: { id: true, codigo: true, nombre: true } }, cliente: { select: { id: true, razonSocial: true, documento: true } }, aplicaciones: { include: { factura: { select: { id: true, numero: true } } }, orderBy: { factura: { numero: "asc" } } } },
  });
  if (!c) notFound();
  const [cobrador, bancoCheque, recibo] = await Promise.all([
    c.cobradorId ? ctx.db.vendedor.findUnique({ where: { id: c.cobradorId }, select: { nombre: true } }) : null,
    c.bancoChequeId ? ctx.db.banco.findUnique({ where: { id: c.bancoChequeId }, select: { nombre: true } }) : null,
    c.reciboId ? ctx.db.reciboCobro.findUnique({ where: { id: c.reciboId }, select: { id: true, numero: true } }) : null,
  ]);
  const e = ESTADOS_COBRO[c.estado as EstadoCobro];
  const puedeAnular = c.estado === "REGISTRADO" && tienePermiso(ctx, "cxc", "eliminar");
  return (
    <div className="flex flex-col gap-6">
      <Tarjeta className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold">{numeroCobro(c.numero)}</h2>
              {e ? <Etiqueta tono={e.tono}>{e.etiqueta}</Etiqueta> : null}
            </div>
            <p className="text-sm text-gris-600"><Link href={`/cxc/cliente/${c.cliente.id}`} className="hover:underline">{c.cliente.razonSocial}</Link> ({c.cliente.documento})</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">{puedeAnular ? <BotonAnularCobro id={id} /> : null}</div>
        </div>
        <dl className="mt-4 grid gap-3 text-[13.5px] sm:grid-cols-2 xl:grid-cols-4">
          <div><dt className="text-gris-500">Fecha</dt><dd>{formatoFecha(c.fecha)}</dd></div>
          <div><dt className="text-gris-500">Forma de pago</dt><dd>{FORMAS_PAGO[c.formaPago as keyof typeof FORMAS_PAGO] ?? c.formaPago}</dd></div>
          <div><dt className="text-gris-500">Pagó</dt><dd>{c.moneda === "VES" ? "Bs. " : "$ "}{formatoUsd(Number(c.montoMoneda))}{c.tasaUsd ? ` (tasa ${textoTasa(Number(c.tasaUsd))})` : ""}</dd></div>
          <div><dt className="text-gris-500">Aplicado USD</dt><dd className="font-semibold">{formatoUsd(Number(c.montoUsd))}</dd></div>
          {Number(c.anticipoUsd) > 0 ? <div><dt className="text-gris-500">Anticipo (saldo a favor)</dt><dd className="font-semibold">{formatoUsd(Number(c.anticipoUsd))} USD · disponible {formatoUsd(Number(c.anticipoSaldoUsd))}</dd></div> : null}
          <div><dt className="text-gris-500">Cuenta</dt><dd>{c.cuenta ? <Link href={`/tesoreria/cuentas/${c.cuenta.id}`} className="text-marca-texto hover:underline">{c.cuenta.codigo}</Link> : "—"}</dd></div>
          <div><dt className="text-gris-500">Referencia</dt><dd>{c.referencia ?? "—"}</dd></div>
          <div><dt className="text-gris-500">Cobrador</dt><dd>{cobrador?.nombre ?? "—"}</dd></div>
          <div><dt className="text-gris-500">N.º de comprobante</dt><dd>{c.numeroComprobante ?? "—"}</dd></div>
          {c.numeroCheque ? <div><dt className="text-gris-500">Cheque</dt><dd>N.º {c.numeroCheque}{bancoCheque ? ` · ${bancoCheque.nombre}` : ""}{c.fechaCheque ? ` · ${formatoFecha(c.fechaCheque)}` : ""}</dd></div> : null}
          {recibo ? <div><dt className="text-gris-500">Recibo</dt><dd><Link href={`/cxc/recibos/${recibo.id}`} className="text-marca-texto hover:underline">{numeroRecibo(recibo.numero)}</Link></dd></div> : null}
          <div><dt className="text-gris-500">Registrado por</dt><dd>{c.creadoPorNombre ?? "—"} · {formatoFechaHora(c.creadoEn)}</dd></div>
          <div className="sm:col-span-2"><dt className="text-gris-500">Observaciones</dt><dd>{c.observaciones ?? "—"}</dd></div>
          {c.estado === "ANULADO" ? <div className="sm:col-span-2 xl:col-span-4"><dt className="text-gris-500">Anulado</dt><dd>{c.anuladoPorNombre ?? "—"} · {formatoFechaHora(c.anuladoEn)} · {c.motivoAnulacion}</dd></div> : null}
        </dl>
      </Tarjeta>
      <Tarjeta>
        <table className="w-full text-left text-[13.5px]">
          <thead><tr className="border-b border-linea text-[12.5px] text-gris-600"><th className="px-4 py-3 font-medium">Factura</th><th className="px-4 py-3 text-right font-medium">Aplicado USD</th></tr></thead>
          <tbody>
            {c.aplicaciones.map((a) => (
              <tr key={a.id} className="border-b border-linea last:border-0">
                <td className="px-4 py-3 font-semibold"><Link href={`/facturacion/${a.factura.id}`} className="hover:underline">{numeroFactura(a.factura.numero)}</Link></td>
                <td className="px-4 py-3 text-right tabular-nums">{formatoUsd(Number(a.montoUsd))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Tarjeta>
    </div>
  );
}
