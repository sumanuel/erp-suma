import Link from "next/link";
import { Tarjeta, claseControl, clasesBoton } from "@/components/ui";
import { requerirSesion } from "@/lib/dal";
import { libroMayor } from "@/lib/contabilidad/reportes";
import { numeroAsiento } from "@/lib/contabilidad/tipos";
import { hoyCaracas } from "@/lib/tasas";
import { formatoCentavos, formatoFecha, rangoDeReporte } from "../formato";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Mayor({ searchParams }: { searchParams: Promise<{ cuenta?: string; desde?: string; hasta?: string }> }) {
  const ctx = await requerirSesion();
  const sp = await searchParams;
  const { desde, hasta } = rangoDeReporte(hoyCaracas(), sp.desde, sp.hasta);
  const cuentas = await ctx.db.cuentaContable.findMany({ select: { id: true, codigo: true, nombre: true, posteable: true } });
  const clave = (c: string) => c.split(".").map((n) => n.padStart(6, "0")).join(".");
  cuentas.sort((a, b) => clave(a.codigo).localeCompare(clave(b.codigo)));
  const elegida = sp.cuenta && UUID.test(sp.cuenta) ? cuentas.find((c) => c.id === sp.cuenta) : undefined;
  const mayor = elegida ? await libroMayor(ctx.db, elegida.id, desde, hasta) : null;
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return (
    <Tarjeta>
      <form className="flex flex-wrap items-end gap-3 p-4" role="search">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="cuenta" className="text-[13px] font-medium">Cuenta</label>
          <select id="cuenta" name="cuenta" defaultValue={elegida?.id ?? ""} required className={`${claseControl} w-80 pr-9`}>
            <option value="">Elegir…</option>
            {cuentas.map((c) => <option key={c.id} value={c.id}>{c.codigo} {c.nombre}{c.posteable ? "" : " (agrupa)"}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5"><label htmlFor="desde" className="text-[13px] font-medium">Desde</label><input id="desde" name="desde" type="date" defaultValue={iso(desde)} className={`${claseControl} w-44`} /></div>
        <div className="flex flex-col gap-1.5"><label htmlFor="hasta" className="text-[13px] font-medium">Hasta</label><input id="hasta" name="hasta" type="date" defaultValue={iso(hasta)} className={`${claseControl} w-44`} /></div>
        <button type="submit" className={clasesBoton("secundario")}>Ver mayor</button>
      </form>
      {mayor && elegida ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13.5px]">
            <thead>
              <tr className="border-y border-linea text-[12.5px] text-gris-600">
                <th className="px-4 py-3 font-medium">Fecha</th><th className="px-3 py-3 font-medium">Asiento</th><th className="px-3 py-3 font-medium">Descripción</th>
                <th className="px-3 py-3 text-right font-medium">Debe</th><th className="px-3 py-3 text-right font-medium">Haber</th><th className="px-4 py-3 text-right font-medium">Saldo</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-linea bg-neutro-suave/40 font-semibold"><td className="px-4 py-3" colSpan={5}>Saldo inicial al {formatoFecha(desde)}</td><td className="px-4 py-3 text-right tabular-nums">{formatoCentavos(mayor.saldoInicial)}</td></tr>
              {mayor.movimientos.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gris-500">Sin movimientos en el período.</td></tr>
              ) : mayor.movimientos.map((m, i) => (
                <tr key={i} className="border-b border-linea last:border-0">
                  <td className="px-4 py-3">{formatoFecha(m.fecha)}</td>
                  <td className="px-3 py-3 font-semibold"><Link href={`/contabilidad/asientos/${m.asientoId}`} className="hover:underline">{numeroAsiento(m.numero)}</Link></td>
                  <td className="px-3 py-3">{m.detalle ? `${m.descripcion} · ${m.detalle}` : m.descripcion}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatoCentavos(m.debe, true)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatoCentavos(m.haber, true)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatoCentavos(m.saldo)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="border-t border-linea font-semibold"><td className="px-4 py-3" colSpan={5}>Saldo final al {formatoFecha(hasta)}</td><td className="px-4 py-3 text-right tabular-nums">{formatoCentavos(mayor.saldoFinal)}</td></tr></tfoot>
          </table>
          {mayor.truncado ? <p className="p-4 text-[13px] text-aviso">Se muestran los primeros 2.000 movimientos: acorta el rango de fechas.</p> : null}
          <p className="p-4 text-[12.5px] text-gris-500">Saldo positivo = deudor, negativo = acreedor. Solo cuentan los asientos registrados (no los anulados).</p>
        </div>
      ) : (
        <p className="px-4 pb-6 text-center text-gris-500">Elige una cuenta para ver su libro mayor.</p>
      )}
    </Tarjeta>
  );
}
