import Link from "next/link";
import { Tarjeta, clasesBoton } from "@/components/ui";
import { requerirSesion } from "@/lib/dal";
import { TRAMOS, diasMora, tramoDeMora, type TramoId } from "@/lib/cxc/estados";
import { hoyCaracas } from "@/lib/tasas";
import { formatoUsd } from "./formato";

type Fila = { id: string; razonSocial: string; documento: string; saldo: number; vencido: number; facturas: number; tramos: Record<TramoId, number> };
const vacio = (): Record<TramoId, number> => ({ porVencer: 0, d1_30: 0, d31_60: 0, d61_90: 0, d91: 0 });

export default async function SaldosPorCliente() {
  const ctx = await requerirSesion();
  const hoy = hoyCaracas();
  const abiertas = await ctx.db.factura.findMany({
    where: { estado: "EMITIDA", saldo: { gt: 0 } },
    select: { saldo: true, fechaVencimiento: true, cliente: { select: { id: true, razonSocial: true, documento: true } } },
  });
  const porCliente = new Map<string, Fila>();
  const totales = vacio();
  for (const f of abiertas) {
    const fila = porCliente.get(f.cliente.id) ?? { ...f.cliente, saldo: 0, vencido: 0, facturas: 0, tramos: vacio() };
    const saldo = Number(f.saldo);
    const tramo = tramoDeMora(diasMora(hoy, f.fechaVencimiento));
    fila.saldo += saldo;
    fila.facturas += 1;
    fila.tramos[tramo] += saldo;
    if (tramo !== "porVencer") fila.vencido += saldo;
    totales[tramo] += saldo;
    porCliente.set(f.cliente.id, fila);
  }
  const filas = [...porCliente.values()].sort((a, b) => b.saldo - a.saldo);
  const total = filas.reduce((s, f) => s + f.saldo, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Tarjeta className="p-4"><p className="text-[12.5px] text-gris-500">Por cobrar (USD)</p><p className="mt-1 text-xl font-semibold tabular-nums">{formatoUsd(total)}</p></Tarjeta>
        {TRAMOS.map((t) => (
          <Tarjeta key={t.id} className="p-4"><p className="text-[12.5px] text-gris-500">{t.etiqueta}</p><p className={`mt-1 text-xl font-semibold tabular-nums ${t.id !== "porVencer" && totales[t.id] > 0 ? "text-error" : ""}`}>{formatoUsd(totales[t.id])}</p></Tarjeta>
        ))}
      </div>
      <Tarjeta>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-linea text-[12.5px] text-gris-600">
                <th className="px-4 py-3 font-medium">Cliente</th><th className="px-3 py-3 text-right font-medium">Facturas</th><th className="px-3 py-3 text-right font-medium">Saldo USD</th>
                <th className="px-3 py-3 text-right font-medium">Vencido USD</th><th className="px-4 py-3 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filas.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-gris-500">No hay saldos pendientes por cobrar.</td></tr>
              ) : filas.map((f) => (
                <tr key={f.id} className="border-b border-linea last:border-0">
                  <td className="px-4 py-3"><Link href={`/cxc/cliente/${f.id}`} className="font-semibold hover:underline">{f.razonSocial}</Link> <span className="text-gris-500">({f.documento})</span></td>
                  <td className="px-3 py-3 text-right tabular-nums">{f.facturas}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatoUsd(f.saldo)}</td>
                  <td className={`px-3 py-3 text-right tabular-nums ${f.vencido > 0 ? "text-error" : ""}`}>{formatoUsd(f.vencido)}</td>
                  <td className="px-4 py-3"><div className="flex justify-end"><Link href={`/cxc/cliente/${f.id}`} className={clasesBoton("secundario")}>Estado de cuenta</Link></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>
    </div>
  );
}
