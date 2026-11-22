import Link from "next/link";
import { notFound } from "next/navigation";
import { Etiqueta, Tarjeta } from "@/components/ui";
import { requerirSesion } from "@/lib/dal";
import { ESTADOS_COBRO, FORMAS_PAGO, numeroCobro, numeroRecibo, type EstadoCobro } from "@/lib/cxc/estados";
import { formatoFecha, formatoFechaHora, formatoUsd } from "../../formato";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Recibo de ingreso: los cobros (una forma de pago cada uno) de una misma operación. */
export default async function DetalleRecibo({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const ctx = await requerirSesion();
  const r = await ctx.db.reciboCobro.findUnique({ where: { id }, include: { cobros: { orderBy: { numero: "asc" }, include: { cuenta: { select: { codigo: true } } } } } });
  if (!r) notFound();
  const [cliente, cobrador] = await Promise.all([
    ctx.db.cliente.findUniqueOrThrow({ where: { id: r.clienteId }, select: { id: true, razonSocial: true, documento: true } }),
    r.cobradorId ? ctx.db.vendedor.findUnique({ where: { id: r.cobradorId }, select: { nombre: true } }) : null,
  ]);
  const vigentes = r.cobros.filter((c) => c.estado === "REGISTRADO");
  const totalUsd = vigentes.reduce((s, c) => s + Number(c.montoUsd), 0);
  return (
    <div className="flex flex-col gap-6">
      <Tarjeta className="p-6">
        <h2 className="text-xl font-semibold">{numeroRecibo(r.numero)}</h2>
        <p className="text-sm text-gris-600"><Link href={`/cxc/cliente/${cliente.id}`} className="hover:underline">{cliente.razonSocial}</Link> ({cliente.documento})</p>
        <dl className="mt-4 grid gap-3 text-[13.5px] sm:grid-cols-2 xl:grid-cols-4">
          <div><dt className="text-gris-500">Fecha</dt><dd>{formatoFecha(r.fecha)}</dd></div>
          <div><dt className="text-gris-500">Cobrador</dt><dd>{cobrador?.nombre ?? "—"}</dd></div>
          <div><dt className="text-gris-500">Total aplicado USD</dt><dd className="font-semibold">{formatoUsd(totalUsd)}</dd></div>
          <div><dt className="text-gris-500">Registrado por</dt><dd>{r.creadoPorNombre ?? "—"} · {formatoFechaHora(r.creadoEn)}</dd></div>
          <div className="sm:col-span-2"><dt className="text-gris-500">Observaciones</dt><dd>{r.observaciones ?? "—"}</dd></div>
        </dl>
      </Tarjeta>
      <Tarjeta>
        <table className="w-full text-left text-[13.5px]">
          <thead><tr className="border-b border-linea text-[12.5px] text-gris-600"><th className="px-4 py-3 font-medium">Cobro</th><th className="px-4 py-3 font-medium">Forma de pago</th><th className="px-4 py-3 font-medium">Cuenta</th><th className="px-4 py-3 text-right font-medium">Pagó</th><th className="px-4 py-3 text-right font-medium">Aplicado USD</th><th className="px-4 py-3 font-medium">Estado</th></tr></thead>
          <tbody>
            {r.cobros.map((c) => {
              const e = ESTADOS_COBRO[c.estado as EstadoCobro];
              return (
                <tr key={c.id} className="border-b border-linea last:border-0">
                  <td className="px-4 py-3 font-semibold"><Link href={`/cxc/cobros/${c.id}`} className="hover:underline">{numeroCobro(c.numero)}</Link></td>
                  <td className="px-4 py-3">{FORMAS_PAGO[c.formaPago as keyof typeof FORMAS_PAGO] ?? c.formaPago}{c.numeroCheque ? ` · cheque ${c.numeroCheque}` : ""}</td>
                  <td className="px-4 py-3">{c.cuenta?.codigo ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{c.moneda === "VES" ? "Bs. " : "$ "}{formatoUsd(Number(c.montoMoneda))}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatoUsd(Number(c.montoUsd))}</td>
                  <td className="px-4 py-3">{e ? <Etiqueta tono={e.tono}>{e.etiqueta}</Etiqueta> : c.estado}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Tarjeta>
    </div>
  );
}
