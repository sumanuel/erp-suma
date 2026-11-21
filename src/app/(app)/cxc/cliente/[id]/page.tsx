import Link from "next/link";
import { notFound } from "next/navigation";
import { Etiqueta, Tarjeta, clasesBoton } from "@/components/ui";
import { requerirSesion, tienePermiso } from "@/lib/dal";
import { ESTADOS_COBRO, FORMAS_PAGO, TRAMOS, diasMora, numeroCobro, tramoDeMora, type EstadoCobro, type TramoId } from "@/lib/cxc/estados";
import { numeroFactura } from "@/lib/facturacion/estados";
import { hoyCaracas } from "@/lib/tasas";
import { formatoFecha, formatoUsd } from "../../formato";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EstadoDeCuenta({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const ctx = await requerirSesion();
  const cliente = await ctx.db.cliente.findUnique({ where: { id } });
  if (!cliente) notFound();
  const hoy = hoyCaracas();
  const [abiertas, cobros] = await Promise.all([
    ctx.db.factura.findMany({ where: { clienteId: id, estado: "EMITIDA", saldo: { gt: 0 } }, orderBy: { fechaVencimiento: "asc" } }),
    ctx.db.cobro.findMany({ where: { clienteId: id }, orderBy: { numero: "desc" }, take: 20 }),
  ]);
  const tramos: Record<TramoId, number> = { porVencer: 0, d1_30: 0, d31_60: 0, d61_90: 0, d91: 0 };
  for (const f of abiertas) tramos[tramoDeMora(diasMora(hoy, f.fechaVencimiento))] += Number(f.saldo);
  const total = abiertas.reduce((s, f) => s + Number(f.saldo), 0);

  return (
    <div className="flex flex-col gap-6">
      <Tarjeta className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">{cliente.razonSocial}</h2>
            <p className="text-sm text-gris-600">{cliente.documento}{cliente.telefono ? ` · ${cliente.telefono}` : ""}</p>
          </div>
          {abiertas.length > 0 && tienePermiso(ctx, "cxc", "crear") ? <Link href={`/cxc/cobros/nuevo?cliente=${id}`} className={clasesBoton("primario")}>Registrar cobro</Link> : null}
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-[13.5px] md:grid-cols-3 xl:grid-cols-6">
          <div><dt className="text-gris-500">Saldo total USD</dt><dd className="text-lg font-semibold tabular-nums">{formatoUsd(total)}</dd></div>
          {TRAMOS.map((t) => <div key={t.id}><dt className="text-gris-500">{t.etiqueta}</dt><dd className={`text-lg font-semibold tabular-nums ${t.id !== "porVencer" && tramos[t.id] > 0 ? "text-error" : ""}`}>{formatoUsd(tramos[t.id])}</dd></div>)}
        </dl>
      </Tarjeta>

      <Tarjeta>
        <h3 className="px-4 pt-4 text-base font-semibold">Facturas con saldo</h3>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full text-left text-[13.5px]">
            <thead>
              <tr className="border-y border-linea text-[12.5px] text-gris-600">
                <th className="px-4 py-3 font-medium">Factura</th><th className="px-3 py-3 font-medium">Emitida</th><th className="px-3 py-3 font-medium">Vence</th><th className="px-3 py-3 text-right font-medium">Mora (días)</th>
                <th className="px-3 py-3 text-right font-medium">Total USD</th><th className="px-4 py-3 text-right font-medium">Saldo USD</th>
              </tr>
            </thead>
            <tbody>
              {abiertas.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gris-500">Este cliente no tiene saldo pendiente.</td></tr>
              ) : abiertas.map((f) => {
                const mora = diasMora(hoy, f.fechaVencimiento);
                return (
                  <tr key={f.id} className="border-b border-linea last:border-0">
                    <td className="px-4 py-3 font-semibold"><Link href={`/facturacion/${f.id}`} className="hover:underline">{numeroFactura(f.numero)}</Link></td>
                    <td className="px-3 py-3">{formatoFecha(f.fecha)}</td>
                    <td className="px-3 py-3">{formatoFecha(f.fechaVencimiento)}</td>
                    <td className={`px-3 py-3 text-right tabular-nums ${mora > 0 ? "text-error" : "text-gris-500"}`}>{mora > 0 ? mora : "—"}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatoUsd(Number(f.total))}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatoUsd(Number(f.saldo))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Tarjeta>

      <Tarjeta>
        <h3 className="px-4 pt-4 text-base font-semibold">Últimos cobros</h3>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full text-left text-[13.5px]">
            <thead>
              <tr className="border-y border-linea text-[12.5px] text-gris-600">
                <th className="px-4 py-3 font-medium">Cobro</th><th className="px-3 py-3 font-medium">Fecha</th><th className="px-3 py-3 font-medium">Forma</th><th className="px-3 py-3 font-medium">Estado</th><th className="px-4 py-3 text-right font-medium">USD</th>
              </tr>
            </thead>
            <tbody>
              {cobros.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gris-500">Sin cobros registrados.</td></tr>
              ) : cobros.map((c) => {
                const e = ESTADOS_COBRO[c.estado as EstadoCobro];
                return (
                  <tr key={c.id} className="border-b border-linea last:border-0">
                    <td className="px-4 py-3 font-semibold"><Link href={`/cxc/cobros/${c.id}`} className="hover:underline">{numeroCobro(c.numero)}</Link></td>
                    <td className="px-3 py-3">{formatoFecha(c.fecha)}</td>
                    <td className="px-3 py-3">{FORMAS_PAGO[c.formaPago as keyof typeof FORMAS_PAGO] ?? c.formaPago}</td>
                    <td className="px-3 py-3">{e ? <Etiqueta tono={e.tono}>{e.etiqueta}</Etiqueta> : c.estado}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatoUsd(Number(c.montoUsd))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Tarjeta>
    </div>
  );
}
