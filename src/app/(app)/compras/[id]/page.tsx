import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { Etiqueta, Tarjeta, clasesBoton } from "@/components/ui";
import { FilasCondicionesCompra } from "@/components/compras/filas-condiciones-compra";
import { requerirSesion, tienePermiso } from "@/lib/dal";
import { ESTADOS_ORDEN, numeroOrden, numeroRecepcion, type EstadoOrden } from "@/lib/compras/calculos";
import { formatoCantidad, formatoFecha, formatoFechaHora, formatoUsd } from "../formato";
import { BotonesEstado } from "./botones";
import { FormularioRecepcion } from "./formulario-recepcion";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DetalleOrden({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const ctx = await requerirSesion();
  const o = await ctx.db.ordenCompra.findUnique({
    where: { id },
    include: {
      proveedor: { select: { razonSocial: true, documento: true } },
      lineas: { orderBy: { linea: "asc" } },
      recepciones: { orderBy: { numero: "asc" }, include: { almacen: { select: { nombre: true } }, lineas: true } },
    },
  });
  if (!o) notFound();
  const e = ESTADOS_ORDEN[o.estado as EstadoOrden];
  const puedeEditar = tienePermiso(ctx, "compras", "editar");
  const puedeRecibir = puedeEditar && (o.estado === "EMITIDA" || o.estado === "RECIBIDA_PARCIAL");
  const almacenes = puedeRecibir ? await ctx.db.almacen.findMany({ where: { activo: true }, orderBy: { nombre: "asc" } }) : [];
  const borrador = o.estado === "BORRADOR";
  const anulable = (o.estado === "BORRADOR" || o.estado === "EMITIDA") && o.recepciones.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <Tarjeta className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold">{numeroOrden(o.numero)}</h2>
              {e ? <Etiqueta tono={e.tono}>{e.etiqueta}</Etiqueta> : null}
            </div>
            <p className="text-sm text-gris-600">{o.proveedor.razonSocial} ({o.proveedor.documento})</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {borrador && puedeEditar ? <Link href={`/compras/${id}/editar`} className={clasesBoton("secundario")}><Pencil className="size-4" aria-hidden />Editar</Link> : null}
            <BotonesEstado id={id} puedeEmitir={borrador && puedeEditar} puedeAnular={anulable && tienePermiso(ctx, "compras", "eliminar")} />
          </div>
        </div>
        <dl className="mt-4 grid gap-3 text-[13.5px] sm:grid-cols-2 xl:grid-cols-4">
          <div><dt className="text-gris-500">Fecha</dt><dd>{formatoFecha(o.fecha)}</dd></div>
          <div><dt className="text-gris-500">Entrega esperada</dt><dd>{formatoFecha(o.fechaEsperada)}</dd></div>
          <div><dt className="text-gris-500">Creada por</dt><dd>{o.creadoPorNombre ?? "—"} · {formatoFechaHora(o.creadoEn)}</dd></div>
          <FilasCondicionesCompra db={ctx.db} doc={o} />
          <div><dt className="text-gris-500">Observaciones</dt><dd>{o.observaciones ?? "—"}</dd></div>
        </dl>
      </Tarjeta>

      <Tarjeta>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-linea text-[12.5px] text-gris-600">
                <th className="px-4 py-3 font-medium">Producto</th><th className="px-3 py-3 text-right font-medium">Pedida</th><th className="px-3 py-3 text-right font-medium">Recibida</th>
                <th className="px-3 py-3 text-right font-medium">Costo USD</th><th className="px-3 py-3 text-right font-medium">Desc. %</th><th className="px-3 py-3 text-right font-medium">IVA %</th><th className="px-4 py-3 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {o.lineas.map((l) => (
                <tr key={l.id} className="border-b border-linea last:border-0">
                  <td className="px-4 py-3"><span className="font-semibold">{l.productoCodigo}</span> · {l.descripcion}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatoCantidad(Number(l.cantidad))}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatoCantidad(Number(l.cantidadRecibida))}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatoUsd(Number(l.costoUnitario))}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatoCantidad(Number(l.descuento))}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatoCantidad(Number(l.ivaPorcentaje))}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatoUsd(Number(l.total))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="ml-auto flex w-full max-w-xs flex-col gap-1 p-4 text-[13.5px]">
          <div className="flex justify-between"><dt className="text-gris-600">Subtotal</dt><dd className="tabular-nums">{formatoUsd(Number(o.subtotal))}</dd></div>
          <div className="flex justify-between"><dt className="text-gris-600">IVA</dt><dd className="tabular-nums">{formatoUsd(Number(o.iva))}</dd></div>
          <div className="flex justify-between border-t border-linea pt-1 text-[15px] font-semibold"><dt>Total USD</dt><dd className="tabular-nums">{formatoUsd(Number(o.total))}</dd></div>
        </dl>
      </Tarjeta>

      {puedeRecibir ? (
        <FormularioRecepcion
          key={o.lineas.map((l) => `${l.id}:${l.cantidadRecibida}`).join("|")}
          ordenId={id}
          almacenes={almacenes.map((a) => ({ valor: a.id, etiqueta: `${a.codigo} · ${a.nombre}` }))}
          lineas={o.lineas
            .filter((l) => Number(l.cantidadRecibida) < Number(l.cantidad))
            .map((l) => ({ id: l.id, productoCodigo: l.productoCodigo, descripcion: l.descripcion, pedida: Number(l.cantidad), recibida: Number(l.cantidadRecibida) }))}
        />
      ) : null}

      {o.recepciones.length > 0 ? (
        <Tarjeta className="p-6">
          <h2 className="mb-3 text-base font-semibold">Recepciones</h2>
          <ul className="flex flex-col gap-3 text-[13.5px]">
            {o.recepciones.map((r) => (
              <li key={r.id} className="rounded-[10px] border border-linea p-3">
                <p className="font-semibold">{numeroRecepcion(r.numero)} <span className="font-normal text-gris-600">· {formatoFechaHora(r.fecha)} · {r.almacen.nombre} · {r.usuarioNombre ?? "—"}{r.documento ? ` · doc. ${r.documento}` : ""}</span></p>
                <p className="mt-1 text-gris-700">{r.lineas.map((l) => `${l.productoCodigo} × ${formatoCantidad(Number(l.cantidad))}`).join(", ")}</p>
              </li>
            ))}
          </ul>
        </Tarjeta>
      ) : null}
    </div>
  );
}
