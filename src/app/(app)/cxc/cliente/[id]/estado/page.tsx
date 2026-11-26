import Link from "next/link";
import { rangoDeFechas } from "@/lib/filtros-fecha";
import { notFound } from "next/navigation";
import { Tarjeta, claseControl, clasesBoton } from "@/components/ui";
import { requerirPermiso } from "@/lib/dal";
import { estadoDeCuenta } from "@/lib/cxc/estado-cuenta";
import { formatoFecha, formatoUsd } from "../../../formato";
import { BotonImprimir } from "../../../../reportes/[reporte]/imprimir";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Estado de cuenta imprimible de un cliente (movimientos en USD con saldo corrido; opcionalmente desde/hasta una fecha).
export default async function EstadoCuentaImprimible({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ desde?: string; hasta?: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const filtros = await searchParams;
  const ctx = await requerirPermiso("cxc", "ver");
  const cliente = await ctx.db.cliente.findUnique({ where: { id }, select: { razonSocial: true, documento: true, telefono: true } });
  if (!cliente) notFound();
  const empresa = await ctx.db.empresa.findUnique({ where: { id: 1 } });
  // Sin filtro, los calendarios muestran desde el primer movimiento del cliente.
  const todo = await estadoDeCuenta(ctx.db, id);
  const fechas = rangoDeFechas(filtros, "todas", { _min: { fecha: todo.movimientos[0]?.fecha ?? null }, _max: { fecha: todo.movimientos.at(-1)?.fecha ?? null } });
  const r = fechas.restringe ? await estadoDeCuenta(ctx.db, id, fechas.desdeFecha, fechas.hastaFecha) : todo;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/cxc/cliente/${id}`} className="text-sm font-medium text-marca-fuerte hover:underline">← Cuenta del cliente</Link>
        <form className="flex flex-wrap items-center gap-2">
          <label className="text-[13px]">Desde <input type="date" name="desde" defaultValue={fechas.desde} className={`${claseControl} ml-1 w-40`} /></label>
          <label className="text-[13px]">Hasta <input type="date" name="hasta" defaultValue={fechas.hasta} className={`${claseControl} ml-1 w-40`} /></label>
          <button type="submit" className={clasesBoton("secundario")}>Filtrar</button>
          <BotonImprimir />
        </form>
      </div>
      <Tarjeta className="p-6">
        <div className="mb-4">
          <p className="text-[15px] font-semibold">{empresa?.razonSocial ?? "Estado de cuenta"}</p>
          {empresa?.rif ? <p className="text-sm text-gris-600">RIF {empresa.rif}</p> : null}
          <h2 className="mt-2 text-xl font-semibold">Estado de cuenta · {cliente.razonSocial}</h2>
          <p className="text-sm text-gris-600">{cliente.documento}{cliente.telefono ? ` · ${cliente.telefono}` : ""}{fechas.restringe ? ` · desde ${formatoFecha(new Date(`${fechas.desde}T00:00:00.000Z`))} hasta ${formatoFecha(new Date(`${fechas.hasta}T00:00:00.000Z`))}` : ""}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13.5px]">
            <thead>
              <tr className="border-y border-linea text-[12.5px] text-gris-600">
                <th className="px-3 py-2.5 font-medium">Fecha</th><th className="px-3 py-2.5 font-medium">Movimiento</th><th className="px-3 py-2.5 font-medium">Documento</th><th className="px-3 py-2.5 font-medium">Detalle</th>
                <th className="px-3 py-2.5 text-right font-medium">Cargo USD</th><th className="px-3 py-2.5 text-right font-medium">Abono USD</th><th className="px-3 py-2.5 text-right font-medium">Saldo USD</th>
              </tr>
            </thead>
            <tbody>
              {fechas.desdeFecha ? <tr className="border-b border-linea"><td colSpan={6} className="px-3 py-2 text-gris-600">Saldo anterior</td><td className="px-3 py-2 text-right tabular-nums">{formatoUsd(r.saldoAnterior)}</td></tr> : null}
              {r.movimientos.length === 0 ? <tr><td colSpan={7} className="px-3 py-8 text-center text-gris-500">Sin movimientos.</td></tr> : r.movimientos.map((m, i) => (
                <tr key={i} className={`border-b border-linea last:border-0 ${m.info ? "text-gris-500" : ""}`}>
                  <td className="px-3 py-2">{formatoFecha(m.fecha)}</td><td className="px-3 py-2">{m.tipo}</td><td className="px-3 py-2 font-medium">{m.documento}</td><td className="px-3 py-2">{m.detalle}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{m.cargo ? formatoUsd(m.cargo) : ""}</td><td className="px-3 py-2 text-right tabular-nums">{m.abono ? formatoUsd(m.abono) : ""}</td><td className="px-3 py-2 text-right tabular-nums">{m.info ? "" : formatoUsd(m.saldo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-right text-[15px] font-semibold">Saldo {r.saldoFinal < 0 ? "a favor del cliente" : "por cobrar"}: {formatoUsd(Math.abs(r.saldoFinal))} USD</p>
      </Tarjeta>
    </div>
  );
}
