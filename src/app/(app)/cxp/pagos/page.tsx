import Link from "next/link";
import { Eye } from "lucide-react";
import { Etiqueta, Tarjeta, claseControl, clasesBoton } from "@/components/ui";
import { requerirSesion } from "@/lib/dal";
import { ESTADOS_PAGO, FORMAS_PAGO, numeroPago, type EstadoPago } from "@/lib/cxp/estados";
import { formatoFecha, formatoUsd } from "../formato";

export default async function ListaPagos({ searchParams }: { searchParams: Promise<{ q?: string; estado?: string }> }) {
  const ctx = await requerirSesion();
  const { q = "", estado = "" } = await searchParams;
  const texto = q.trim().slice(0, 60);
  const numero = /^(PAG-?)?0*(\d{1,9})$/i.exec(texto)?.[2];
  const pagos = await ctx.db.pagoProveedor.findMany({
    where: {
      ...(estado in ESTADOS_PAGO ? { estado } : {}),
      ...(texto
        ? { OR: [...(numero ? [{ numero: Number(numero) }] : []), { proveedor: { razonSocial: { contains: texto, mode: "insensitive" as const } } }, { referencia: { contains: texto, mode: "insensitive" as const } }] }
        : {}),
    },
    include: { proveedor: { select: { razonSocial: true } } },
    orderBy: { numero: "desc" },
    take: 200,
  });
  return (
    <Tarjeta>
      <div className="flex flex-wrap items-center gap-3 p-4">
        <form className="flex flex-wrap items-center gap-2" role="search">
          <input name="q" defaultValue={texto} placeholder="Número, proveedor o referencia" aria-label="Buscar" className={`${claseControl} w-64`} />
          <select name="estado" defaultValue={estado} aria-label="Estado" className={`${claseControl} w-48 pr-9`}>
            <option value="">Todos los estados</option>
            {Object.entries(ESTADOS_PAGO).map(([k, v]) => <option key={k} value={k}>{v.etiqueta}</option>)}
          </select>
          <button type="submit" className={clasesBoton("secundario")}>Filtrar</button>
        </form>
        <p className="text-[13px] text-gris-500">Los pagos se registran desde el estado de cuenta de cada proveedor.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13.5px]">
          <thead>
            <tr className="border-y border-linea text-[12.5px] text-gris-600">
              <th className="px-4 py-3 font-medium">Pago</th><th className="px-3 py-3 font-medium">Fecha</th><th className="px-3 py-3 font-medium">Proveedor</th><th className="px-3 py-3 font-medium">Forma</th>
              <th className="px-3 py-3 font-medium">Estado</th><th className="px-3 py-3 text-right font-medium">Pagó</th><th className="px-3 py-3 text-right font-medium">USD</th><th className="px-4 py-3 text-right font-medium">Ver</th>
            </tr>
          </thead>
          <tbody>
            {pagos.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-gris-500">No hay pagos{texto || estado ? " con ese filtro" : " todavía"}.</td></tr>
            ) : pagos.map((c) => {
              const e = ESTADOS_PAGO[c.estado as EstadoPago];
              return (
                <tr key={c.id} className="border-b border-linea last:border-0">
                  <td className="px-4 py-3 font-semibold"><Link href={`/cxp/pagos/${c.id}`} className="hover:underline">{numeroPago(c.numero)}</Link></td>
                  <td className="px-3 py-3">{formatoFecha(c.fecha)}</td>
                  <td className="px-3 py-3">{c.proveedor.razonSocial}</td>
                  <td className="px-3 py-3">{FORMAS_PAGO[c.formaPago as keyof typeof FORMAS_PAGO] ?? c.formaPago}</td>
                  <td className="px-3 py-3">{e ? <Etiqueta tono={e.tono}>{e.etiqueta}</Etiqueta> : c.estado}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{c.moneda === "VES" ? "Bs. " : "$ "}{formatoUsd(Number(c.montoMoneda))}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatoUsd(Number(c.montoUsd))}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end"><Link href={`/cxp/pagos/${c.id}`} aria-label={`Ver ${numeroPago(c.numero)}`} className="flex size-9 items-center justify-center rounded-[9px] border border-borde-campo hover:bg-hover"><Eye className="size-4" aria-hidden /></Link></div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Tarjeta>
  );
}
