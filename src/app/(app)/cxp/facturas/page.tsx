import Link from "next/link";
import { Eye, Plus } from "lucide-react";
import { Etiqueta, Tarjeta, claseControl, clasesBoton } from "@/components/ui";
import { requerirSesion, tienePermiso } from "@/lib/dal";
import { ESTADOS_FACTURA_COMPRA, numeroFacturaCompra, type EstadoFacturaCompra } from "@/lib/cxp/estados";
import { formatoFecha, formatoUsd } from "../formato";

export default async function ListaFacturasProveedor({ searchParams }: { searchParams: Promise<{ q?: string; estado?: string }> }) {
  const ctx = await requerirSesion();
  const { q = "", estado = "" } = await searchParams;
  const texto = q.trim().slice(0, 60);
  const numero = /^(FC-?)?0*(\d{1,9})$/i.exec(texto)?.[2];
  const facturas = await ctx.db.facturaCompra.findMany({
    where: {
      ...(estado in ESTADOS_FACTURA_COMPRA ? { estado } : {}),
      ...(texto
        ? { OR: [...(numero ? [{ numero: Number(numero) }] : []), { documento: { contains: texto, mode: "insensitive" as const } }, { proveedor: { razonSocial: { contains: texto, mode: "insensitive" as const } } }] }
        : {}),
    },
    include: { proveedor: { select: { razonSocial: true } } },
    orderBy: { numero: "desc" },
    take: 200,
  });
  const puedeCrear = tienePermiso(ctx, "cxp", "crear");
  return (
    <Tarjeta>
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <form className="flex flex-wrap items-center gap-2" role="search">
          <input name="q" defaultValue={texto} placeholder="Número, factura o proveedor" aria-label="Buscar" className={`${claseControl} w-64`} />
          <select name="estado" defaultValue={estado} aria-label="Estado" className={`${claseControl} w-48 pr-9`}>
            <option value="">Todos los estados</option>
            {Object.entries(ESTADOS_FACTURA_COMPRA).map(([k, v]) => <option key={k} value={k}>{v.etiqueta}</option>)}
          </select>
          <button type="submit" className={clasesBoton("secundario")}>Filtrar</button>
        </form>
        {puedeCrear ? <Link href="/cxp/facturas/nueva" className={clasesBoton("primario")}><Plus className="size-4" aria-hidden />Registrar factura</Link> : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13.5px]">
          <thead>
            <tr className="border-y border-linea text-[12.5px] text-gris-600">
              <th className="px-4 py-3 font-medium">Interno</th><th className="px-3 py-3 font-medium">Factura</th><th className="px-3 py-3 font-medium">Proveedor</th><th className="px-3 py-3 font-medium">Fecha</th>
              <th className="px-3 py-3 font-medium">Vence</th><th className="px-3 py-3 font-medium">Estado</th><th className="px-3 py-3 text-right font-medium">Total USD</th><th className="px-3 py-3 text-right font-medium">Saldo USD</th><th className="px-4 py-3 text-right font-medium">Ver</th>
            </tr>
          </thead>
          <tbody>
            {facturas.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-10 text-center text-gris-500">No hay facturas de proveedores{texto || estado ? " con ese filtro" : " todavía"}.</td></tr>
            ) : facturas.map((f) => {
              const e = ESTADOS_FACTURA_COMPRA[f.estado as EstadoFacturaCompra];
              return (
                <tr key={f.id} className="border-b border-linea last:border-0">
                  <td className="px-4 py-3 font-semibold"><Link href={`/cxp/facturas/${f.id}`} className="hover:underline">{numeroFacturaCompra(f.numero)}</Link></td>
                  <td className="px-3 py-3">{f.documento}</td>
                  <td className="px-3 py-3">{f.proveedor.razonSocial}</td>
                  <td className="px-3 py-3">{formatoFecha(f.fecha)}</td>
                  <td className="px-3 py-3">{formatoFecha(f.fechaVencimiento)}</td>
                  <td className="px-3 py-3">{e ? <Etiqueta tono={e.tono}>{e.etiqueta}</Etiqueta> : f.estado}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatoUsd(Number(f.total))}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatoUsd(Number(f.saldo))}</td>
                  <td className="px-4 py-3"><div className="flex justify-end"><Link href={`/cxp/facturas/${f.id}`} aria-label={`Ver ${numeroFacturaCompra(f.numero)}`} className="flex size-9 items-center justify-center rounded-[9px] border border-borde-campo hover:bg-hover"><Eye className="size-4" aria-hidden /></Link></div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Tarjeta>
  );
}
