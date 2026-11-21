import Link from "next/link";
import { clasesBoton } from "@/components/ui";

export const POR_PAGINA = 50;

export function Paginacion({ pagina, total, ruta, params }: { pagina: number; total: number; ruta: string; params: Record<string, string> }) {
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const href = (p: number) => `${ruta}?${new URLSearchParams({ ...params, pagina: String(p) })}`;
  return (
    <div className="flex items-center justify-between gap-3 border-t border-linea px-4 py-3 text-[13px] text-gris-500">
      <span>{total === 0 ? "Sin registros" : `${(pagina - 1) * POR_PAGINA + 1}–${Math.min(pagina * POR_PAGINA, total)} de ${total}`}</span>
      <div className="flex gap-2">
        {pagina > 1 ? <Link href={href(pagina - 1)} className={clasesBoton("secundario")}>Anterior</Link> : null}
        {pagina < paginas ? <Link href={href(pagina + 1)} className={clasesBoton("secundario")}>Siguiente</Link> : null}
      </div>
    </div>
  );
}
