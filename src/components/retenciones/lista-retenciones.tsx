import Link from "next/link";
import { Eye } from "lucide-react";
import { Etiqueta, Tarjeta, claseControl, clasesBoton } from "@/components/ui";
import { requerirSesion } from "@/lib/dal";
import { ESTADOS_RETENCION, numeroRetencion, type EstadoRetencion } from "@/lib/retenciones/estados";

const fecha = new Intl.DateTimeFormat("es-VE", { dateStyle: "short", timeZone: "UTC" });
const monto = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

/** Lista de retenciones practicadas (a proveedores, en CxP) o sufridas (de clientes, en CxC). */
export async function ListaRetenciones({ sentido, base, searchParams }: { sentido: "PRACTICADA" | "SUFRIDA"; base: string; searchParams: { q?: string; tipo?: string; estado?: string } }) {
  const ctx = await requerirSesion();
  const { q = "", tipo = "", estado = "" } = searchParams;
  const texto = q.trim().slice(0, 60);
  const numero = /^(RET-?)?0*(\d{1,9})$/i.exec(texto)?.[2];
  const practicada = sentido === "PRACTICADA";
  const filas = await ctx.db.retencion.findMany({
    where: {
      sentido,
      ...(tipo === "IVA" || tipo === "ISLR" ? { tipo } : {}),
      ...(estado in ESTADOS_RETENCION ? { estado } : {}),
      ...(texto ? { OR: [...(numero ? [{ numero: Number(numero) }] : []), { comprobante: { contains: texto, mode: "insensitive" as const } }, practicada ? { proveedor: { razonSocial: { contains: texto, mode: "insensitive" as const } } } : { cliente: { razonSocial: { contains: texto, mode: "insensitive" as const } } }] } : {}),
    },
    include: { proveedor: { select: { razonSocial: true } }, cliente: { select: { razonSocial: true } } },
    orderBy: { numero: "desc" },
    take: 200,
  });
  return (
    <Tarjeta>
      <div className="flex flex-wrap items-center gap-3 p-4">
        <form className="flex flex-wrap items-center gap-2" role="search">
          <input name="q" defaultValue={texto} placeholder={`Número, comprobante o ${practicada ? "proveedor" : "cliente"}`} aria-label="Buscar" className={`${claseControl} w-64`} />
          <select name="tipo" defaultValue={tipo} aria-label="Impuesto" className={`${claseControl} w-36 pr-9`}><option value="">IVA e ISLR</option><option value="IVA">IVA</option><option value="ISLR">ISLR</option></select>
          <select name="estado" defaultValue={estado} aria-label="Estado" className={`${claseControl} w-40 pr-9`}><option value="">Todas</option>{Object.entries(ESTADOS_RETENCION).map(([k, v]) => <option key={k} value={k}>{v.etiqueta}</option>)}</select>
          <button type="submit" className={clasesBoton("secundario")}>Filtrar</button>
        </form>
        <p className="text-[13px] text-gris-500">Se registran desde la factura {practicada ? "del proveedor" : "de venta"} que afectan.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13.5px]">
          <thead>
            <tr className="border-y border-linea text-[12.5px] text-gris-600">
              <th className="px-4 py-3 font-medium">Retención</th><th className="px-3 py-3 font-medium">Fecha</th><th className="px-3 py-3 font-medium">Comprobante</th><th className="px-3 py-3 font-medium">{practicada ? "Proveedor" : "Cliente"}</th>
              <th className="px-3 py-3 font-medium">Impuesto</th><th className="px-3 py-3 font-medium">Estado</th><th className="px-3 py-3 text-right font-medium">Retenido USD</th><th className="px-3 py-3 text-right font-medium">Retenido Bs.</th><th className="px-4 py-3 text-right font-medium">Ver</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-10 text-center text-gris-500">No hay retenciones{texto || tipo || estado ? " con ese filtro" : " todavía"}.</td></tr>
            ) : filas.map((r) => {
              const e = ESTADOS_RETENCION[r.estado as EstadoRetencion];
              return (
                <tr key={r.id} className="border-b border-linea last:border-0">
                  <td className="px-4 py-3 font-semibold"><Link href={`${base}/${r.id}`} className="hover:underline">{numeroRetencion(r.numero)}</Link></td>
                  <td className="px-3 py-3">{fecha.format(r.fecha)}</td>
                  <td className="px-3 py-3">{r.comprobante}</td>
                  <td className="px-3 py-3">{(practicada ? r.proveedor : r.cliente)?.razonSocial}</td>
                  <td className="px-3 py-3">{r.tipo} {monto(Number(r.porcentaje))} %</td>
                  <td className="px-3 py-3">{e ? <Etiqueta tono={e.tono}>{e.etiqueta}</Etiqueta> : r.estado}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{monto(Number(r.montoUsd))}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{monto(Number(r.montoBs))}</td>
                  <td className="px-4 py-3"><div className="flex justify-end"><Link href={`${base}/${r.id}`} aria-label={`Ver ${numeroRetencion(r.numero)}`} className="flex size-9 items-center justify-center rounded-[9px] border border-borde-campo hover:bg-hover"><Eye className="size-4" aria-hidden /></Link></div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Tarjeta>
  );
}
