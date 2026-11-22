import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { Etiqueta, Tarjeta, clasesBoton } from "@/components/ui";
import { requerirSesion, tienePermiso } from "@/lib/dal";
import { ESTADOS_IMPORTACION, numeroImportacion, type EstadoImportacion } from "@/lib/importaciones/calculos";
import { formatoCantidad, formatoFecha, formatoFechaHora, formatoUsd } from "../../pedidos/formato";
import { BotonesImportacion } from "./botones";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DetalleImportacion({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const ctx = await requerirSesion();
  const i = await ctx.db.importacion.findUnique({
    where: { id },
    include: { proveedor: { select: { razonSocial: true, documento: true } }, almacen: { select: { codigo: true, nombre: true } }, lineas: { orderBy: { linea: "asc" }, include: { producto: { select: { descripcion: true } } } }, gastos: true },
  });
  if (!i) notFound();
  const e = ESTADOS_IMPORTACION[i.estado as EstadoImportacion];
  const borrador = i.estado === "BORRADOR";
  const dato = (t: string, v: string) => <div><dt className="text-gris-500">{t}</dt><dd>{v}</dd></div>;
  return (
    <div className="flex flex-col gap-6">
      <Tarjeta className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold">{numeroImportacion(i.numero)}</h2>
              {e ? <Etiqueta tono={e.tono}>{e.etiqueta}</Etiqueta> : null}
            </div>
            <p className="text-sm text-gris-600">{i.proveedor.razonSocial} ({i.proveedor.documento}) · documento {i.documento}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {borrador && tienePermiso(ctx, "importaciones", "editar") ? <Link href={`/importaciones/${id}/editar`} className={clasesBoton("secundario")}><Pencil className="size-4" aria-hidden />Editar</Link> : null}
            <BotonesImportacion id={id} procesada={i.estado === "PROCESADA"} puedeProcesar={borrador && tienePermiso(ctx, "importaciones", "editar")} puedeAnular={i.estado !== "ANULADA" && tienePermiso(ctx, "importaciones", "eliminar")} />
          </div>
        </div>
        <dl className="mt-4 grid gap-3 text-[13.5px] sm:grid-cols-2 xl:grid-cols-4">
          {dato("Fecha", formatoFecha(i.fecha))}
          {dato("Almacén de ingreso", `${i.almacen.codigo} · ${i.almacen.nombre}`)}
          {dato("Moneda y cambio", `${i.moneda} · ${formatoCantidad(Number(i.cambioUsd))} USD`)}
          {dato("Factor CIF / otros", `${formatoCantidad(Number(i.factorCif))} / ${formatoCantidad(Number(i.factorOtros))}`)}
          {dato("Creado por", `${i.creadoPorNombre ?? "—"} · ${formatoFechaHora(i.creadoEn)}`)}
          {i.procesadaEn ? dato("Procesada", `${i.procesadaPorNombre ?? "—"} · ${formatoFechaHora(i.procesadaEn)}`) : null}
          {i.anuladaEn ? dato("Anulada", `${i.anuladaPorNombre ?? "—"} · ${formatoFechaHora(i.anuladaEn)} · ${i.motivoAnulacion ?? ""}`) : null}
          {dato("Observaciones", i.observaciones ?? "—")}
        </dl>
      </Tarjeta>

      <Tarjeta>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-linea text-[12.5px] text-gris-600">
                <th className="px-4 py-3 font-medium">Producto</th><th className="px-3 py-3 text-right font-medium">Cantidad</th><th className="px-3 py-3 text-right font-medium">FOB unit.</th><th className="px-3 py-3 text-right font-medium">Arancel %</th>
                <th className="px-3 py-3 text-right font-medium">FOB USD</th><th className="px-3 py-3 text-right font-medium">CIF USD</th><th className="px-3 py-3 text-right font-medium">Gastos USD</th><th className="px-3 py-3 text-right font-medium">Arancel USD</th>
                <th className="px-3 py-3 text-right font-medium">Total USD</th><th className="px-4 py-3 text-right font-medium">Costo unit. USD</th>
              </tr>
            </thead>
            <tbody>
              {i.lineas.map((l) => (
                <tr key={l.id} className="border-b border-linea last:border-0">
                  <td className="px-4 py-3"><span className="font-semibold">{l.productoCodigo}</span> · {l.producto.descripcion}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatoCantidad(Number(l.cantidad))}</td><td className="px-3 py-3 text-right tabular-nums">{formatoUsd(Number(l.fobUnitario))}</td><td className="px-3 py-3 text-right tabular-nums">{formatoCantidad(Number(l.arancelPct))}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatoUsd(Number(l.fobUsd))}</td><td className="px-3 py-3 text-right tabular-nums">{formatoUsd(Number(l.cifUsd))}</td><td className="px-3 py-3 text-right tabular-nums">{formatoUsd(Number(l.gastoUsd))}</td><td className="px-3 py-3 text-right tabular-nums">{formatoUsd(Number(l.arancelUsd))}</td>
                  <td className="px-3 py-3 text-right font-medium tabular-nums">{formatoUsd(Number(l.totalUsd))}</td><td className="px-4 py-3 text-right font-semibold tabular-nums">{Number(l.costoUnitarioUsd).toLocaleString("es-VE", { minimumFractionDigits: 4, maximumFractionDigits: 6 })}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-linea font-semibold">
                <td className="px-4 py-3" colSpan={4}>Totales</td>
                <td className="px-3 py-3 text-right tabular-nums">{formatoUsd(Number(i.fobUsd))}</td><td className="px-3 py-3 text-right tabular-nums">{formatoUsd(Number(i.cifUsd))}</td><td className="px-3 py-3 text-right tabular-nums">{formatoUsd(Number(i.gastosUsd))}</td><td className="px-3 py-3 text-right tabular-nums">{formatoUsd(Number(i.arancelesUsd))}</td>
                <td className="px-3 py-3 text-right tabular-nums">{formatoUsd(Number(i.totalUsd))}</td><td className="px-4 py-3" />
              </tr>
            </tfoot>
          </table>
        </div>
      </Tarjeta>

      <Tarjeta className="p-6">
        <h3 className="mb-3 text-base font-semibold">Gastos de la importación</h3>
        {i.gastos.length === 0 ? <p className="text-sm text-gris-500">Sin gastos.</p> : (
          <table className="w-full max-w-2xl text-left text-[13.5px]">
            <tbody>
              {i.gastos.map((g) => <tr key={g.id} className="border-b border-linea last:border-0"><td className="py-2">{g.descripcion}</td><td className="py-2 text-right tabular-nums">{formatoUsd(Number(g.montoUsd))} USD</td></tr>)}
            </tbody>
          </table>
        )}
      </Tarjeta>
    </div>
  );
}
