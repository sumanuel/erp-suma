import { Aviso, Etiqueta, Tarjeta, claseControl, clasesBoton } from "@/components/ui";
import { requerirSesion, tienePermiso } from "@/lib/dal";
import { previsualizarCierre } from "@/lib/contabilidad/cierre";
import { numeroAsiento } from "@/lib/contabilidad/tipos";
import { hoyCaracas } from "@/lib/tasas";
import { formatoCentavos, formatoFechaHora } from "../formato";

const formatoBs = (n: number) => formatoCentavos(Math.round(n * 100));
import { BotonesCierre } from "./botones-cierre";

// Cierre del ejercicio contable: vista previa de los resultados del año (ingresos, costos y gastos) y el asiento que los lleva a resultados acumulados.
export default async function CierreEjercicio({ searchParams }: { searchParams: Promise<{ anio?: string }> }) {
  const ctx = await requerirSesion();
  const hoy = hoyCaracas();
  const pedido = Number((await searchParams).anio);
  const anio = Number.isInteger(pedido) && pedido >= 2000 && pedido <= 2100 ? pedido : hoy.getUTCFullYear() - 1;
  const [ejercicios, concepto] = await Promise.all([
    ctx.db.ejercicioContable.findMany({ orderBy: { anio: "desc" }, include: { asiento: { select: { numero: true } } } }),
    ctx.db.cuentaConcepto.findUnique({ where: { concepto: "RESULTADO_EJERCICIO" }, include: { cuenta: { select: { codigo: true, nombre: true } } } }),
  ]);
  const cerrado = ejercicios.find((e) => e.anio === anio);
  const ultimoCerrado = ejercicios[0]?.anio;
  const { lineas, resultado } = await previsualizarCierre(ctx.db, anio);
  const terminado = new Date(Date.UTC(anio, 11, 31)).getTime() <= hoy.getTime();
  const m = (c: number) => formatoBs(c / 100);
  return (
    <div className="flex flex-col gap-6">
      <Tarjeta className="p-6">
        <form className="flex flex-wrap items-end gap-3" role="search">
          <div className="flex flex-col gap-1.5"><label htmlFor="anio" className="text-[13px] font-medium">Ejercicio (año)</label><input id="anio" name="anio" inputMode="numeric" defaultValue={anio} className={`${claseControl} w-28`} /></div>
          <button type="submit" className={clasesBoton("secundario")}>Ver</button>
          <div className="ml-auto">
            <BotonesCierre anio={anio} cerrado={!!cerrado} puedeCerrar={terminado && lineas.length > 0 && !!concepto && tienePermiso(ctx, "contabilidad", "editar")} puedeReabrir={!!cerrado && anio === ultimoCerrado && tienePermiso(ctx, "contabilidad", "eliminar")} />
          </div>
        </form>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          {cerrado ? <Etiqueta tono="neutro">Cerrado</Etiqueta> : <Etiqueta tono="exito">Abierto</Etiqueta>}
          {cerrado ? <span className="text-gris-600">Asiento {numeroAsiento(cerrado.asiento.numero)} · {cerrado.cerradoPorNombre ?? "—"} · {formatoFechaHora(cerrado.cerradoEn)} · resultado {formatoBs(Number(cerrado.resultadoBs))} Bs.</span> : null}
        </div>
        {!concepto ? <div className="mt-4"><Aviso tono="aviso">Falta asignar la cuenta de «Resultados acumulados (cierre del ejercicio)» en Contabilidad → Configuración.</Aviso></div> : null}
        {!terminado && !cerrado ? <div className="mt-4"><Aviso tono="aviso">El ejercicio {anio} aún no termina: se cierra a partir del 31 de diciembre.</Aviso></div> : null}
        {concepto ? <p className="mt-4 text-[13px] text-gris-600">La utilidad o pérdida se lleva a {concepto.cuenta.codigo} · {concepto.cuenta.nombre}.</p> : null}
      </Tarjeta>

      <Tarjeta>
        <h3 className="px-4 pt-4 text-base font-semibold">Resultados del ejercicio {anio}{cerrado ? " (ya cerrados)" : ""}</h3>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full text-left text-[13.5px]">
            <thead><tr className="border-y border-linea text-[12.5px] text-gris-600"><th className="px-4 py-3 font-medium">Cuenta</th><th className="px-3 py-3 font-medium">Tipo</th><th className="px-4 py-3 text-right font-medium">Saldo Bs. (debe − haber)</th></tr></thead>
            <tbody>
              {lineas.length === 0 ? <tr><td colSpan={3} className="px-4 py-8 text-center text-gris-500">{cerrado ? "El cierre ya puso en cero las cuentas de resultados." : "Sin movimientos de ingresos, costos o gastos en este año."}</td></tr> : lineas.map((l) => (
                <tr key={l.cuentaId} className="border-b border-linea last:border-0"><td className="px-4 py-2.5"><span className="font-semibold">{l.codigo}</span> · {l.nombre}</td><td className="px-3 py-2.5 capitalize">{l.tipo.toLowerCase()}</td><td className="px-4 py-2.5 text-right tabular-nums">{m(l.saldo)}</td></tr>
              ))}
            </tbody>
            {lineas.length > 0 ? <tfoot><tr className="border-t border-linea font-semibold"><td className="px-4 py-3" colSpan={2}>{resultado >= 0 ? "Utilidad del ejercicio" : "Pérdida del ejercicio"}</td><td className="px-4 py-3 text-right tabular-nums">{m(Math.abs(resultado))}</td></tr></tfoot> : null}
          </table>
        </div>
      </Tarjeta>

      {ejercicios.length > 0 ? (
        <Tarjeta>
          <h3 className="px-4 pt-4 text-base font-semibold">Ejercicios cerrados</h3>
          <table className="mt-2 w-full text-left text-[13.5px]">
            <tbody>
              {ejercicios.map((e) => <tr key={e.anio} className="border-t border-linea"><td className="px-4 py-2.5 font-semibold"><a href={`/contabilidad/cierre?anio=${e.anio}`} className="hover:underline">{e.anio}</a></td><td className="px-3 py-2.5">{numeroAsiento(e.asiento.numero)}</td><td className="px-3 py-2.5">{formatoFechaHora(e.cerradoEn)}</td><td className="px-4 py-2.5 text-right tabular-nums">{formatoBs(Number(e.resultadoBs))} Bs.</td></tr>)}
            </tbody>
          </table>
        </Tarjeta>
      ) : null}
    </div>
  );
}
