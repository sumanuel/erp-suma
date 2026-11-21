import Link from "next/link";
import { Eye } from "lucide-react";
import { Etiqueta, Tarjeta, claseControl, clasesBoton } from "@/components/ui";
import { requerirSesion } from "@/lib/dal";
import { numeroFactura } from "@/lib/facturacion/estados";
import { ESTADOS_NOTA, MODOS_NOTA_VENTA, numeroNotaVenta, type EstadoNota } from "@/lib/notas/estados";
import { formatoFecha, formatoUsd } from "../formato";

export default async function ListaNotasVenta({ searchParams }: { searchParams: Promise<{ q?: string; tipo?: string; estado?: string }> }) {
  const ctx = await requerirSesion();
  const { q = "", tipo = "", estado = "" } = await searchParams;
  const texto = q.trim().slice(0, 60);
  const numero = /^(NC|ND)?-?0*(\d{1,9})$/i.exec(texto)?.[2];
  const notas = await ctx.db.notaVenta.findMany({
    where: {
      ...(tipo === "CREDITO" || tipo === "DEBITO" ? { tipo } : {}),
      ...(estado in ESTADOS_NOTA ? { estado } : {}),
      ...(texto ? { OR: [...(numero ? [{ numero: Number(numero) }] : []), { cliente: { razonSocial: { contains: texto, mode: "insensitive" as const } } }, { motivo: { contains: texto, mode: "insensitive" as const } }] } : {}),
    },
    include: { cliente: { select: { razonSocial: true } }, factura: { select: { numero: true } } },
    orderBy: { numero: "desc" },
    take: 200,
  });
  return (
    <Tarjeta>
      <div className="flex flex-wrap items-center gap-3 p-4">
        <form className="flex flex-wrap items-center gap-2" role="search">
          <input name="q" defaultValue={texto} placeholder="Número, cliente o motivo" aria-label="Buscar" className={`${claseControl} w-60`} />
          <select name="tipo" defaultValue={tipo} aria-label="Tipo" className={`${claseControl} w-44 pr-9`}><option value="">Créditos y débitos</option><option value="CREDITO">Notas de crédito</option><option value="DEBITO">Notas de débito</option></select>
          <select name="estado" defaultValue={estado} aria-label="Estado" className={`${claseControl} w-40 pr-9`}><option value="">Todas</option>{Object.entries(ESTADOS_NOTA).map(([k, v]) => <option key={k} value={k}>{v.etiqueta}</option>)}</select>
          <button type="submit" className={clasesBoton("secundario")}>Filtrar</button>
        </form>
        <p className="text-[13px] text-gris-500">Las notas se emiten desde la factura que corrigen.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13.5px]">
          <thead>
            <tr className="border-y border-linea text-[12.5px] text-gris-600">
              <th className="px-4 py-3 font-medium">Nota</th><th className="px-3 py-3 font-medium">Fecha</th><th className="px-3 py-3 font-medium">Cliente</th><th className="px-3 py-3 font-medium">Factura</th>
              <th className="px-3 py-3 font-medium">Concepto</th><th className="px-3 py-3 font-medium">Estado</th><th className="px-3 py-3 text-right font-medium">Total USD</th><th className="px-4 py-3 text-right font-medium">Ver</th>
            </tr>
          </thead>
          <tbody>
            {notas.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-gris-500">No hay notas{texto || tipo || estado ? " con ese filtro" : " todavía"}.</td></tr>
            ) : notas.map((n) => {
              const e = ESTADOS_NOTA[n.estado as EstadoNota];
              const t = numeroNotaVenta(n.tipo, n.numero);
              return (
                <tr key={n.id} className="border-b border-linea last:border-0">
                  <td className="px-4 py-3 font-semibold"><Link href={`/facturacion/notas/${n.id}`} className="hover:underline">{t}</Link></td>
                  <td className="px-3 py-3">{formatoFecha(n.fecha)}</td>
                  <td className="px-3 py-3">{n.cliente.razonSocial}</td>
                  <td className="px-3 py-3">{numeroFactura(n.factura.numero)}</td>
                  <td className="px-3 py-3">{MODOS_NOTA_VENTA[n.modo as keyof typeof MODOS_NOTA_VENTA]}</td>
                  <td className="px-3 py-3">{e ? <Etiqueta tono={e.tono}>{e.etiqueta}</Etiqueta> : n.estado}</td>
                  <td className={`px-3 py-3 text-right tabular-nums ${n.tipo === "CREDITO" ? "text-error" : ""}`}>{n.tipo === "CREDITO" ? "−" : ""}{formatoUsd(Number(n.total))}</td>
                  <td className="px-4 py-3"><div className="flex justify-end"><Link href={`/facturacion/notas/${n.id}`} aria-label={`Ver ${t}`} className="flex size-9 items-center justify-center rounded-[9px] border border-borde-campo hover:bg-hover"><Eye className="size-4" aria-hidden /></Link></div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Tarjeta>
  );
}
