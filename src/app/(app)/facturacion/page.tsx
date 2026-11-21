import Link from "next/link";
import { Eye, Plus } from "lucide-react";
import { Etiqueta, Tarjeta, clasesBoton, claseControl } from "@/components/ui";
import { requerirSesion, tienePermiso } from "@/lib/dal";
import { ESTADOS_FACTURA, numeroFactura, type EstadoFactura } from "@/lib/facturacion/estados";
import { formatoFecha, formatoUsd } from "./formato";

export default async function ListaFacturas({ searchParams }: { searchParams: Promise<{ q?: string; estado?: string }> }) {
  const ctx = await requerirSesion();
  const { q = "", estado = "" } = await searchParams;
  const texto = q.trim().slice(0, 60);
  const numero = /^(FAC-?)?0*(\d{1,9})$/i.exec(texto)?.[2];
  const facturas = await ctx.db.factura.findMany({
    where: {
      ...(estado in ESTADOS_FACTURA ? { estado } : {}),
      ...(texto
        ? { OR: [...(numero ? [{ numero: Number(numero) }] : []), { cliente: { razonSocial: { contains: texto, mode: "insensitive" as const } } }, { cliente: { documento: { contains: texto, mode: "insensitive" as const } } }] }
        : {}),
    },
    include: { cliente: { select: { razonSocial: true } } },
    orderBy: { numero: "desc" },
    take: 200,
  });
  const puedeCrear = tienePermiso(ctx, "facturacion", "crear");
  return (
    <Tarjeta>
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <form className="flex flex-wrap items-center gap-2" role="search">
          <input name="q" defaultValue={texto} placeholder="Número o cliente" aria-label="Buscar" className={`${claseControl} w-60`} />
          <select name="estado" defaultValue={estado} aria-label="Estado" className={`${claseControl} w-48 pr-9`}>
            <option value="">Todos los estados</option>
            {Object.entries(ESTADOS_FACTURA).map(([k, v]) => <option key={k} value={k}>{v.etiqueta}</option>)}
          </select>
          <button type="submit" className={clasesBoton("secundario")}>Filtrar</button>
        </form>
        {puedeCrear ? <Link href="/facturacion/nueva" className={clasesBoton("primario")}><Plus className="size-4" aria-hidden />Nueva factura</Link> : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13.5px]">
          <thead>
            <tr className="border-y border-linea text-[12.5px] text-gris-600">
              <th className="px-4 py-3 font-medium">Factura</th><th className="px-3 py-3 font-medium">Fecha</th><th className="px-3 py-3 font-medium">Cliente</th>
              <th className="px-3 py-3 font-medium">Estado</th><th className="px-3 py-3 text-right font-medium">Total (USD)</th><th className="px-3 py-3 text-right font-medium">Total (Bs.)</th><th className="px-4 py-3 text-right font-medium">Ver</th>
            </tr>
          </thead>
          <tbody>
            {facturas.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-gris-500">No hay facturas{texto || estado ? " con ese filtro" : " todavía"}.</td></tr>
            ) : facturas.map((f) => {
              const e = ESTADOS_FACTURA[f.estado as EstadoFactura];
              return (
                <tr key={f.id} className="border-b border-linea last:border-0">
                  <td className="px-4 py-3 font-semibold"><Link href={`/facturacion/${f.id}`} className="hover:underline">{numeroFactura(f.numero)}</Link></td>
                  <td className="px-3 py-3">{formatoFecha(f.fecha)}</td>
                  <td className="px-3 py-3">{f.cliente.razonSocial}</td>
                  <td className="px-3 py-3">{e ? <Etiqueta tono={e.tono}>{e.etiqueta}</Etiqueta> : f.estado}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatoUsd(Number(f.total))}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatoUsd(Number(f.totalBs))}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      <Link href={`/facturacion/${f.id}`} aria-label={`Ver ${numeroFactura(f.numero)}`} className="flex size-9 items-center justify-center rounded-[9px] border border-borde-campo hover:bg-hover"><Eye className="size-4" aria-hidden /></Link>
                    </div>
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
