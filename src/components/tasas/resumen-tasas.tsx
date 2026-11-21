import { Etiqueta, Tarjeta } from "@/components/ui";
import { hoyCaracas, tasaVigente, textoTasa } from "@/lib/tasas";
import type { Db } from "@/lib/tenant";

const fechaCorta = new Intl.DateTimeFormat("es-VE", { dateStyle: "medium", timeZone: "UTC" });

/** Tarjetas con la tasa vigente de cada moneda con tasa, y aviso si no es la de hoy. */
export async function ResumenTasas({ db }: { db: Db }) {
  const monedas = await db.moneda.findMany({ where: { activo: true, esBase: false }, orderBy: { codigo: "asc" } });
  const hoy = hoyCaracas();
  const vigentes = await Promise.all(monedas.map(async (m) => ({ m, t: await tasaVigente(db, m.codigo, hoy) })));
  if (vigentes.length === 0) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {vigentes.map(({ m, t }) => {
        const alDia = t !== null && t.fecha.getTime() === hoy.getTime();
        return (
          <Tarjeta key={m.id} className="flex flex-col gap-1.5 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-medium text-gris-600">{m.nombre} ({m.codigo})</span>
              {t === null ? <Etiqueta tono="error">Sin tasa</Etiqueta> : alDia ? <Etiqueta tono="exito">Al día</Etiqueta> : <Etiqueta tono="aviso">Desde {fechaCorta.format(t.fecha)}</Etiqueta>}
            </div>
            <p className="text-[26px] font-semibold tracking-[-0.02em]">{t ? `Bs. ${textoTasa(t.valor)}` : "—"}</p>
            <p className="text-[12.5px] text-gris-500">Bolívares por 1 {m.simbolo}</p>
          </Tarjeta>
        );
      })}
    </div>
  );
}
