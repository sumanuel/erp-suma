import { Etiqueta, Tarjeta, claseControl, clasesBoton } from "@/components/ui";
import { requerirSesion, tienePermiso } from "@/lib/dal";
import { MESES } from "@/lib/contabilidad/tipos";
import { hoyCaracas } from "@/lib/tasas";
import { formatoFechaHora } from "../formato";
import { BotonPeriodo } from "./boton-periodo";

export default async function Periodos({ searchParams }: { searchParams: Promise<{ anio?: string }> }) {
  const ctx = await requerirSesion();
  const hoy = hoyCaracas();
  const pedido = Number((await searchParams).anio);
  const anio = Number.isInteger(pedido) && pedido >= 2000 && pedido <= 2100 ? pedido : hoy.getUTCFullYear();
  const [periodos, cuentas] = await Promise.all([
    ctx.db.periodoContable.findMany({ where: { anio } }),
    ctx.db.asiento.groupBy({ by: ["mes"], where: { anio, estado: "REGISTRADO" }, _count: true }),
  ]);
  const porMes = new Map(periodos.map((p) => [p.mes, p]));
  const asientos = new Map(cuentas.map((c) => [c.mes, c._count]));
  const puedeEditar = tienePermiso(ctx, "contabilidad", "editar");
  return (
    <Tarjeta>
      <form className="flex items-end gap-3 p-4" role="search">
        <div className="flex flex-col gap-1.5"><label htmlFor="anio" className="text-[13px] font-medium">Año</label><input id="anio" name="anio" inputMode="numeric" defaultValue={anio} className={`${claseControl} w-28`} /></div>
        <button type="submit" className={clasesBoton("secundario")}>Ver</button>
      </form>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13.5px]">
          <thead>
            <tr className="border-y border-linea text-[12.5px] text-gris-600">
              <th className="px-4 py-3 font-medium">Mes</th><th className="px-3 py-3 font-medium">Estado</th><th className="px-3 py-3 text-right font-medium">Asientos</th><th className="px-3 py-3 font-medium">Cerrado</th><th className="px-4 py-3 text-right font-medium">Acción</th>
            </tr>
          </thead>
          <tbody>
            {MESES.map((nombre, i) => {
              const mes = i + 1;
              const p = porMes.get(mes);
              const cerrado = p?.estado === "CERRADO";
              return (
                <tr key={mes} className="border-b border-linea last:border-0">
                  <td className="px-4 py-3 font-semibold capitalize">{nombre} {anio}</td>
                  <td className="px-3 py-3"><Etiqueta tono={cerrado ? "neutro" : "exito"}>{cerrado ? "Cerrado" : "Abierto"}</Etiqueta></td>
                  <td className="px-3 py-3 text-right tabular-nums">{asientos.get(mes) ?? 0}</td>
                  <td className="px-3 py-3">{cerrado ? `${p?.cerradoPorNombre ?? "—"} · ${formatoFechaHora(p?.cerradoEn)}` : "—"}</td>
                  <td className="px-4 py-2"><div className="flex justify-end">{puedeEditar ? <BotonPeriodo anio={anio} mes={mes} cerrado={cerrado} /> : null}</div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="p-4 text-[12.5px] text-gris-500">Un período cerrado no admite asientos nuevos ni anulaciones. Un mes sin asientos figura como abierto.</p>
    </Tarjeta>
  );
}
