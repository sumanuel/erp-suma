import Link from "next/link";
import { notFound } from "next/navigation";
import { Etiqueta, Tarjeta } from "@/components/ui";
import { requerirSesion, tienePermiso } from "@/lib/dal";
import { ESTADOS_PAGO, FORMAS_PAGO, numeroPago, type EstadoPago } from "@/lib/cxp/estados";
import { numeroFacturaCompra } from "@/lib/cxp/estados";
import { textoTasa } from "@/lib/tasas";
import { formatoFecha, formatoFechaHora, formatoUsd } from "../../formato";
import { BotonAnularPago } from "./boton-anular";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DetallePago({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const ctx = await requerirSesion();
  const c = await ctx.db.pagoProveedor.findUnique({
    where: { id },
    include: { cuenta: { select: { id: true, codigo: true, nombre: true } }, proveedor: { select: { id: true, razonSocial: true, documento: true } }, aplicaciones: { include: { factura: { select: { id: true, numero: true } } }, orderBy: { factura: { numero: "asc" } } } },
  });
  if (!c) notFound();
  const e = ESTADOS_PAGO[c.estado as EstadoPago];
  const puedeAnular = c.estado === "REGISTRADO" && tienePermiso(ctx, "cxp", "eliminar");
  return (
    <div className="flex flex-col gap-6">
      <Tarjeta className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold">{numeroPago(c.numero)}</h2>
              {e ? <Etiqueta tono={e.tono}>{e.etiqueta}</Etiqueta> : null}
            </div>
            <p className="text-sm text-gris-600"><Link href={`/cxp/proveedor/${c.proveedor.id}`} className="hover:underline">{c.proveedor.razonSocial}</Link> ({c.proveedor.documento})</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">{puedeAnular ? <BotonAnularPago id={id} /> : null}</div>
        </div>
        <dl className="mt-4 grid gap-3 text-[13.5px] sm:grid-cols-2 xl:grid-cols-4">
          <div><dt className="text-gris-500">Fecha</dt><dd>{formatoFecha(c.fecha)}</dd></div>
          <div><dt className="text-gris-500">Forma de pago</dt><dd>{FORMAS_PAGO[c.formaPago as keyof typeof FORMAS_PAGO] ?? c.formaPago}</dd></div>
          <div><dt className="text-gris-500">Pagó</dt><dd>{c.moneda === "VES" ? "Bs. " : "$ "}{formatoUsd(Number(c.montoMoneda))}{c.tasaUsd ? ` (tasa ${textoTasa(Number(c.tasaUsd))})` : ""}</dd></div>
          <div><dt className="text-gris-500">Aplicado USD</dt><dd className="font-semibold">{formatoUsd(Number(c.montoUsd))}</dd></div>
          <div><dt className="text-gris-500">Cuenta</dt><dd>{c.cuenta ? <Link href={`/tesoreria/cuentas/${c.cuenta.id}`} className="text-marca-texto hover:underline">{c.cuenta.codigo}</Link> : "—"}</dd></div>
          <div><dt className="text-gris-500">Referencia</dt><dd>{c.referencia ?? "—"}</dd></div>
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
                <td className="px-4 py-3 font-semibold"><Link href={`/cxp/facturas/${a.factura.id}`} className="hover:underline">{numeroFacturaCompra(a.factura.numero)}</Link></td>
                <td className="px-4 py-3 text-right tabular-nums">{formatoUsd(Number(a.montoUsd))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Tarjeta>
    </div>
  );
}
