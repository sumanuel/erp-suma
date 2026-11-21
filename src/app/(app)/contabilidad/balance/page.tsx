import { Tarjeta, claseControl, clasesBoton } from "@/components/ui";
import { requerirSesion } from "@/lib/dal";
import { balanceComprobacion } from "@/lib/contabilidad/reportes";
import { TIPOS_CUENTA_CONTABLE } from "@/lib/contabilidad/tipos";
import { hoyCaracas } from "@/lib/tasas";
import { formatoCentavos, rangoDeReporte } from "../formato";

export default async function Balance({ searchParams }: { searchParams: Promise<{ desde?: string; hasta?: string; todas?: string }> }) {
  const ctx = await requerirSesion();
  const sp = await searchParams;
  const { desde, hasta } = rangoDeReporte(hoyCaracas(), sp.desde, sp.hasta);
  const { filas, totales } = await balanceComprobacion(ctx.db, desde, hasta);
  const verTodas = sp.todas === "1";
  const clave = (c: string) => c.split(".").map((n) => n.padStart(6, "0")).join(".");
  const visibles = filas.filter((f) => verTodas || f.saldoInicial !== 0 || f.debe !== 0 || f.haber !== 0).sort((a, b) => clave(a.codigo).localeCompare(clave(b.codigo)));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const cuadra = totales.debe === totales.haber && totales.deudor === totales.acreedor;
  return (
    <Tarjeta>
      <form className="flex flex-wrap items-end gap-3 p-4" role="search">
        <div className="flex flex-col gap-1.5"><label htmlFor="desde" className="text-[13px] font-medium">Desde</label><input id="desde" name="desde" type="date" defaultValue={iso(desde)} className={`${claseControl} w-44`} /></div>
        <div className="flex flex-col gap-1.5"><label htmlFor="hasta" className="text-[13px] font-medium">Hasta</label><input id="hasta" name="hasta" type="date" defaultValue={iso(hasta)} className={`${claseControl} w-44`} /></div>
        <label className="flex h-10 items-center gap-2 text-sm"><input type="checkbox" name="todas" value="1" defaultChecked={verTodas} className="size-4 accent-marca-fuerte" /> Incluir cuentas sin movimiento</label>
        <button type="submit" className={clasesBoton("secundario")}>Ver balance</button>
      </form>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13.5px]">
          <thead>
            <tr className="border-y border-linea text-[12.5px] text-gris-600">
              <th className="px-4 py-3 font-medium">Código</th><th className="px-3 py-3 font-medium">Cuenta</th><th className="px-3 py-3 text-right font-medium">Saldo inicial</th>
              <th className="px-3 py-3 text-right font-medium">Debe</th><th className="px-3 py-3 text-right font-medium">Haber</th><th className="px-3 py-3 text-right font-medium">Saldo deudor</th><th className="px-4 py-3 text-right font-medium">Saldo acreedor</th>
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-gris-500">No hay movimientos en el período.</td></tr>
            ) : visibles.map((f) => (
              <tr key={f.id} className={`border-b border-linea last:border-0 ${f.posteable ? "" : "bg-neutro-suave/40 font-semibold"}`}>
                <td className="px-4 py-2.5 tabular-nums">{f.codigo}</td>
                <td className="px-3 py-2.5" style={{ paddingLeft: `${0.75 + (f.nivel - 1) * 1.1}rem` }}>{f.nombre} <span className="text-[11.5px] font-normal text-gris-500">{TIPOS_CUENTA_CONTABLE[f.tipo].etiqueta}</span></td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatoCentavos(f.saldoInicial)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatoCentavos(f.debe, true)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatoCentavos(f.haber, true)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatoCentavos(Math.max(f.saldoFinal, 0), true)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatoCentavos(Math.max(-f.saldoFinal, 0), true)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-linea font-semibold">
              <td className="px-4 py-3" colSpan={3}>Totales (cuentas de movimiento)</td>
              <td className="px-3 py-3 text-right tabular-nums">{formatoCentavos(totales.debe)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{formatoCentavos(totales.haber)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{formatoCentavos(totales.deudor)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatoCentavos(totales.acreedor)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className={`p-4 text-[13.5px] font-medium ${cuadra ? "text-exito" : "text-error"}`}>{cuadra ? "El balance cuadra: debe = haber y saldos deudores = acreedores." : "El balance NO cuadra: hay un error en los datos contables."}</p>
    </Tarjeta>
  );
}
