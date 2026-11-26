import Link from "next/link";
import { claseControl } from "@/components/ui";

// Piezas comunes de los listados con rango de fechas.

/** La misma lista sin límite de fechas, conservando la búsqueda y los demás filtros. */
export function enlaceTodasLasFechas(ruta: string, filtros: Record<string, string | undefined>) {
  const q = new URLSearchParams(Object.entries(filtros).filter((x): x is [string, string] => !!x[1] && x[0] !== "desde" && x[0] !== "hasta"));
  q.set("desde", "");
  q.set("hasta", "");
  return `${ruta}?${q.toString()}`;
}

/** «Desde» y «Hasta», dentro del formulario de filtros. */
export function FiltroFechas({ desde, hasta }: { desde: string; hasta: string }) {
  const campo = "flex w-40 flex-col gap-1 text-[12.5px] text-gris-600";
  return (
    <>
      <label className={campo}>Desde<input type="date" name="desde" defaultValue={desde} className={claseControl} /></label>
      <label className={campo}>Hasta<input type="date" name="hasta" defaultValue={hasta} className={claseControl} /></label>
    </>
  );
}

export const VerTodasLasFechas = ({ href }: { href: string }) => <Link href={href} className="flex h-10 items-center px-2 text-sm text-gris-700 hover:text-tinta">Ver todas las fechas</Link>;

/** La fila de «no hay nada». Si hay fechas puestas, ofrece repetir la búsqueda sin ellas: lo que se busca puede ser anterior. */
export function SinResultados({ columnas, que, filtrado, conFechas, href }: { columnas: number; que: string; filtrado: boolean; conFechas: boolean; href: string }) {
  return (
    <tr>
      <td colSpan={columnas} className="px-4 py-10 text-center text-gris-500">
        No hay {que}{conFechas ? " en esas fechas" : filtrado ? " con ese filtro" : " todavía"}.
        {conFechas ? <> <Link href={href} className="font-medium text-marca-texto hover:underline">Buscar en todas las fechas</Link></> : null}
      </td>
    </tr>
  );
}

export const AvisoTope = ({ mostrados, total }: { mostrados: number; total: number }) =>
  total > mostrados ? <p className="p-3 text-[12.5px] text-gris-500">Se muestran {mostrados} de {total}: acota las fechas o la búsqueda para ver los demás.</p> : null;
