import Link from "next/link";
import { AvisoTope, FiltroFechas, SinResultados, VerTodasLasFechas, enlaceTodasLasFechas } from "@/components/listado/filtro-fechas";
import { LIMITES_FECHA, porFecha, rangoDeFechas } from "@/lib/filtros-fecha";
import { Eye, Plus } from "lucide-react";
import { Etiqueta, Tarjeta, claseControl, clasesBoton } from "@/components/ui";
import { requerirSesion, tienePermiso } from "@/lib/dal";
import { ESTADOS_FACTURA_COMPRA, numeroFacturaCompra, type EstadoFacturaCompra } from "@/lib/cxp/estados";
import { formatoFecha, formatoUsd } from "../formato";

export default async function ListaFacturasProveedor({ searchParams }: { searchParams: Promise<{ q?: string; estado?: string; desde?: string; hasta?: string }> }) {
  const ctx = await requerirSesion();
  const filtros = await searchParams;
  const { q = "", estado = "" } = filtros;
  const fechas = rangoDeFechas(filtros, "todas", await ctx.db.facturaCompra.aggregate(LIMITES_FECHA));
  const conFechas = fechas.restringe;
  const todas = enlaceTodasLasFechas("/cxp/facturas", { q, estado });
  const texto = q.trim().slice(0, 60);
  const numero = /^(FC-?)?0*(\d{1,9})$/i.exec(texto)?.[2];
  const where = {
    ...porFecha(fechas.desdeFecha, fechas.hastaFecha),
    ...(estado in ESTADOS_FACTURA_COMPRA ? { estado } : {}),
    ...(texto
      ? { OR: [...(numero ? [{ numero: Number(numero) }] : []), { documento: { contains: texto, mode: "insensitive" as const } }, { proveedor: { razonSocial: { contains: texto, mode: "insensitive" as const } } }, { proveedor: { documento: { contains: texto, mode: "insensitive" as const } } }] }
      : {}),
  };
  const encontrados = await ctx.db.facturaCompra.count({ where });
  const facturas = await ctx.db.facturaCompra.findMany({
    where,
    include: { proveedor: { select: { razonSocial: true } } },
    orderBy: { numero: "desc" },
    take: 200,
  });
  const puedeCrear = tienePermiso(ctx, "cxp", "crear");
  return (
    <Tarjeta>
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <form className="flex flex-wrap items-end gap-2" role="search">
          <FiltroFechas desde={fechas.desde} hasta={fechas.hasta} />
          <div className="w-72"><input name="q" defaultValue={texto} placeholder="Número, factura o proveedor (o RIF)" aria-label="Buscar" className={claseControl} /></div>
          <div className="w-48">
            <select name="estado" defaultValue={estado} aria-label="Estado" className={`${claseControl} pr-9`}>
              <option value="">Todos los estados</option>
              {Object.entries(ESTADOS_FACTURA_COMPRA).map(([k, v]) => <option key={k} value={k}>{v.etiqueta}</option>)}
            </select>
          </div>
          <button type="submit" className={clasesBoton("secundario")}>Filtrar</button>
          <VerTodasLasFechas href={todas} />
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
              <SinResultados columnas={9} que="facturas de proveedores" filtrado={!!(texto || estado)} conFechas={conFechas} href={todas} />
            ) : facturas.map((f) => {
              const e = ESTADOS_FACTURA_COMPRA[f.estado as EstadoFacturaCompra];
              return (
                <tr key={f.id} className="border-b border-linea last:border-0">
                  <td className="px-4 py-3 font-semibold"><Link href={`/cxp/facturas/${f.id}`} className="hover:underline">{numeroFacturaCompra(f.numero)}</Link></td>
                  <td className="px-3 py-3">{f.documento}{f.tipoDocumento !== "FACTURA" ? <span className="ml-2 text-[12px] text-gris-500">{f.tipoDocumento === "PAGARE" ? "Pagaré" : "Otro"}</span> : null}</td>
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
      <AvisoTope mostrados={facturas.length} total={encontrados} />
    </Tarjeta>
  );
}
