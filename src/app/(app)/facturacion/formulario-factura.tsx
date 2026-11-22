"use client";

import Link from "next/link";
import { Trash2 } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { Aviso, Tarjeta, clasesBoton, claseControl } from "@/components/ui";
import { CondicionesVenta, useCondiciones, type CondicionesInicial, type DatosVentaForm } from "@/components/ventas/condiciones-venta";
import { SelectorUnidad } from "@/components/ventas/selector-unidad";
import { conUnidad, type PresentacionVenta } from "@/lib/ventas/presentaciones";
import { calcularLinea, calcularTotales, descuentoEfectivo } from "@/lib/pedidos/calculos";
import type { ProductoVenta } from "@/lib/pedidos/servicio";
import { buscarProductosFactura, emitirFacturaVenta } from "./acciones";
import { formatoCantidad, formatoUsd } from "./formato";

export type LineaForm = { productoCodigo: string; descripcion: string; ivaPorcentaje: number; cantidad: string; precioUnitario: string; descuento: string; presentacionId?: string; presentaciones?: PresentacionVenta[]; precioUnidad?: number; almacenId?: string; bonificacion?: boolean };
export type InicialFactura = { clienteId: string; almacenId: string; observaciones: string; diasCredito: string; lineas: LineaForm[]; condiciones?: CondicionesInicial };

const num = (s: string) => {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Formulario de factura. Con `pedido` las líneas y el cliente vienen del pedido confirmado y no se editan (solo se elige el almacén);
 * sin él, es una factura directa con buscador de productos. El servidor recalcula todo.
 */
export function FormularioFactura({ pedido, inicial, clientes, almacenes, ventas, puedeAprobar }: {
  puedeAprobar: boolean; pedido: { id: string; etiqueta: string } | null; inicial: InicialFactura; clientes: { valor: string; etiqueta: string }[]; almacenes: { valor: string; etiqueta: string }[]; ventas: DatosVentaForm;
}) {
  const [clienteId, setClienteId] = useState(inicial.clienteId);
  const cond = useCondiciones(inicial.condiciones, ventas, inicial.clienteId);
  const [almacenId, setAlmacenId] = useState(inicial.almacenId);
  const [observaciones, setObservaciones] = useState(inicial.observaciones);
  const [diasCredito, setDiasCredito] = useState(inicial.diasCredito);
  const [lineas, setLineas] = useState<LineaForm[]>(inicial.lineas);
  const [aprobar, setAprobar] = useState(false);
  const [motivoAprobacion, setMotivoAprobacion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const fijo = pedido !== null;

  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState<ProductoVenta[]>([]);
  const ultima = useRef(0);
  useEffect(() => {
    const q = texto.trim();
    if (fijo || q.length < 2) return;
    const turno = ++ultima.current;
    const t = setTimeout(async () => {
      const r = await buscarProductosFactura(q, cond.lista).catch(() => []);
      if (turno === ultima.current) setResultados(r);
    }, 250);
    return () => clearTimeout(t);
  }, [texto, fijo, cond.lista]);
  const visibles = texto.trim().length < 2 ? [] : resultados;

  function agregar(p: ProductoVenta) {
    setTexto("");
    setResultados([]);
    setLineas((ls) => (ls.some((l) => l.productoCodigo === p.codigo) ? ls : [...ls, { productoCodigo: p.codigo, descripcion: p.descripcion, ivaPorcentaje: p.ivaPorcentaje, cantidad: "1", presentaciones: p.presentaciones, precioUnidad: p.precioLista, precioUnitario: String(p.precioLista), descuento: String(p.descuentoSugerido ?? 0) }]));
  }
  const cambiar = (i: number, campo: "cantidad" | "precioUnitario" | "descuento" | "almacenId", v: string) => setLineas((ls) => ls.map((l, k) => (k === i ? { ...l, [campo]: v } : l)));

  const cambiarUnidad = (i: number, id: string) => setLineas((ls) => ls.map((l, k) => (k === i ? conUnidad(l, id) : l)));
  const entrada = lineas.map((l) => ({ cantidad: num(l.cantidad), costoUnitario: num(l.precioUnitario), descuento: fijo ? num(l.descuento) : descuentoEfectivo(num(l.descuento), cond.global), ivaPorcentaje: l.ivaPorcentaje }));
  const calculadas = entrada.map(calcularLinea);
  const totales = calcularTotales(entrada);

  function emitir() {
    setError(null);
    if (!confirm("¿Emitir la factura? Descuenta el inventario y no se puede editar (solo anular).")) return;
    const aprobacion = puedeAprobar && aprobar ? { motivo: motivoAprobacion } : null;
    iniciar(async () => {
      const r = await emitirFacturaVenta(
        pedido?.id ?? null,
        fijo
          ? { almacenId, observaciones, diasCredito: Math.trunc(num(diasCredito)), aprobacion }
          : { clienteId, almacenId, observaciones, diasCredito: Math.trunc(num(diasCredito)), aprobacion, encabezado: cond.encabezado(), lineas: lineas.map((l) => ({ productoCodigo: l.productoCodigo, presentacionId: l.presentacionId || null, cantidad: num(l.cantidad), precioUnitario: num(l.precioUnitario), descuento: num(l.descuento), almacenId: l.almacenId || null })) },
      );
      if (r?.error) setError(r.error);
    });
  }

  const cel = "px-2 py-2";
  return (
    <form onSubmit={(e) => { e.preventDefault(); emitir(); }} className="flex flex-col gap-6">
      {error ? <Aviso tono="error">{error}</Aviso> : null}
      {fijo ? <Aviso tono="marca">Facturando el pedido {pedido.etiqueta}: se usan sus líneas y precios.</Aviso> : null}
      <Tarjeta className="p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="clienteId" className="text-[13px] font-medium">Cliente</label>
            <select id="clienteId" value={clienteId} onChange={(e) => { setClienteId(e.target.value); setDiasCredito(String(cond.elegirCliente(e.target.value))); }} required disabled={fijo} className={`${claseControl} pr-9`}>
              <option value="">Elegir…</option>
              {clientes.map((c) => <option key={c.valor} value={c.valor}>{c.etiqueta}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="almacenId" className="text-[13px] font-medium">Almacén de salida</label>
            <select id="almacenId" value={almacenId} onChange={(e) => setAlmacenId(e.target.value)} required className={`${claseControl} pr-9`}>
              <option value="">Elegir…</option>
              {almacenes.map((a) => <option key={a.valor} value={a.valor}>{a.etiqueta}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="diasCredito" className="text-[13px] font-medium">Días de crédito</label>
            <input id="diasCredito" inputMode="numeric" value={diasCredito} onChange={(e) => setDiasCredito(e.target.value)} className={claseControl} />
            <p className="text-[12.5px] text-gris-500">0 = contado. Define el vencimiento en Cuentas por cobrar.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="observaciones" className="text-[13px] font-medium">Observaciones</label>
            <input id="observaciones" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} maxLength={1000} className={claseControl} />
          </div>
        </div>
      </Tarjeta>

      {puedeAprobar ? (
        <Tarjeta className="p-6">
          <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-gris-600">Aprobación gerencial</h3>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={aprobar} onChange={(e) => setAprobar(e.target.checked)} className="size-4 accent-marca-fuerte" /> Aprobar las excepciones de crédito de esta factura (moroso, sin crédito, límite o vencidas)</label>
          {aprobar ? (
            <div className="mt-3 flex max-w-xl flex-col gap-1.5">
              <label htmlFor="motivoAprobacion" className="text-[13px] font-medium">Motivo de la aprobación</label>
              <input id="motivoAprobacion" value={motivoAprobacion} onChange={(e) => setMotivoAprobacion(e.target.value)} maxLength={300} className={claseControl} />
              <p className="text-[12.5px] text-gris-500">Queda en la factura y en la auditoría con tu nombre. Un cliente bloqueado no se puede aprobar.</p>
            </div>
          ) : null}
        </Tarjeta>
      ) : null}

      {fijo ? null : <CondicionesVenta cond={cond} datos={ventas} onCondicion={(dias) => setDiasCredito(String(dias))} />}

      <Tarjeta recortar={false}>
        {fijo ? null : (
          <div className="relative p-4">
            <label htmlFor="buscar-producto" className="mb-1.5 block text-[13px] font-medium">Agregar producto</label>
            <input id="buscar-producto" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Código, descripción o código de barras" autoComplete="off" className={`${claseControl} max-w-xl`} />
            {visibles.length > 0 ? (
              <ul className="absolute z-10 mt-1 max-h-72 w-full max-w-xl overflow-auto rounded-[10px] border border-borde bg-white py-1 shadow-lg">
                {visibles.map((p) => (
                  <li key={p.codigo}>
                    <button type="button" onClick={() => agregar(p)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[13.5px] hover:bg-hover">
                      <span className="min-w-0 truncate"><span className="font-semibold">{p.codigo}</span> · {p.descripcion}</span>
                      <span className="shrink-0 text-gris-500">{formatoUsd(p.precioLista)} · disp. {formatoCantidad(p.disponible)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13.5px]">
            <thead>
              <tr className="border-y border-linea text-[12.5px] text-gris-600">
                <th className="px-4 py-3 font-medium">Producto</th><th className="px-2 py-3 text-right font-medium">Cantidad</th><th className="px-2 py-3 text-right font-medium">Precio USD</th>
                <th className="px-2 py-3 text-right font-medium">Desc. %</th><th className="px-2 py-3 text-right font-medium">IVA %</th><th className="px-2 py-3 text-right font-medium">Total</th>
                {fijo ? null : <th className="px-2 py-3 font-medium">Almacén</th>}
                {fijo ? null : <th className="px-4 py-3"><span className="sr-only">Quitar</span></th>}
              </tr>
            </thead>
            <tbody>
              {lineas.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gris-500">Busca y agrega los productos de la factura.</td></tr>
              ) : lineas.map((l, i) => (
                <tr key={`${l.productoCodigo}-${i}`} className="border-b border-linea last:border-0">
                  <td className="px-4 py-2"><span className="font-semibold">{l.productoCodigo}</span> · {l.descripcion}{fijo && l.presentacionId ? <span className="ml-2 text-[12.5px] text-gris-500">{l.presentaciones?.find((x) => x.id === l.presentacionId)?.nombre}</span> : null}{l.bonificacion ? <span className="ml-2 rounded-full bg-exito-suave px-2 py-0.5 text-[11.5px] text-exito">Bonificación</span> : null}<SelectorUnidad codigo={l.productoCodigo} presentaciones={fijo ? undefined : l.presentaciones} valor={l.presentacionId} onCambio={(id) => cambiarUnidad(i, id)} /></td>
                  {fijo ? (
                    <>
                      <td className={`${cel} text-right tabular-nums`}>{formatoCantidad(num(l.cantidad))}</td>
                      <td className={`${cel} text-right tabular-nums`}>{formatoUsd(num(l.precioUnitario))}</td>
                      <td className={`${cel} text-right tabular-nums`}>{formatoCantidad(num(l.descuento))}</td>
                    </>
                  ) : (
                    <>
                      <td className={cel}><input aria-label={`Cantidad de ${l.productoCodigo}`} inputMode="decimal" value={l.cantidad} onChange={(e) => cambiar(i, "cantidad", e.target.value)} className={`${claseControl} w-24 text-right`} /></td>
                      <td className={cel}><input aria-label={`Precio de ${l.productoCodigo}`} inputMode="decimal" value={l.precioUnitario} onChange={(e) => cambiar(i, "precioUnitario", e.target.value)} className={`${claseControl} w-28 text-right`} /></td>
                      <td className={cel}><input aria-label={`Descuento de ${l.productoCodigo}`} inputMode="decimal" value={l.descuento} onChange={(e) => cambiar(i, "descuento", e.target.value)} className={`${claseControl} w-20 text-right`} /></td>
                    </>
                  )}
                  <td className={`${cel} text-right tabular-nums`}>{l.ivaPorcentaje}</td>
                  <td className={`${cel} text-right tabular-nums`}>{formatoUsd(calculadas[i].total)}</td>
                  {fijo ? null : (
                    <td className={cel}>
                      <select aria-label={`Almacén de ${l.productoCodigo}`} value={l.almacenId ?? ""} onChange={(e) => cambiar(i, "almacenId", e.target.value)} className={`${claseControl} w-44 pr-8`}>
                        <option value="">Del documento</option>
                        {almacenes.map((a) => <option key={a.valor} value={a.valor}>{a.etiqueta}</option>)}
                      </select>
                    </td>
                  )}
                  {fijo ? null : (
                    <td className="px-4 py-2 text-right">
                      <button type="button" aria-label={`Quitar ${l.productoCodigo}`} onClick={() => setLineas((ls) => ls.filter((_, k) => k !== i))} className="inline-flex size-9 items-center justify-center rounded-[9px] border border-[#f3c7c7] text-error hover:bg-error-suave"><Trash2 className="size-4" aria-hidden /></button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="ml-auto flex w-full max-w-xs flex-col gap-1 p-4 text-[13.5px]">
          <div className="flex justify-between"><dt className="text-gris-600">Subtotal</dt><dd className="tabular-nums">{formatoUsd(totales.subtotal)}</dd></div>
          <div className="flex justify-between"><dt className="text-gris-600">IVA</dt><dd className="tabular-nums">{formatoUsd(totales.iva)}</dd></div>
          <div className="flex justify-between border-t border-linea pt-1 text-[15px] font-semibold"><dt>Total USD</dt><dd className="tabular-nums">{formatoUsd(totales.total)}</dd></div>
        </dl>
      </Tarjeta>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pendiente} className={clasesBoton("primario")}>{pendiente ? "Emitiendo…" : "Emitir factura"}</button>
        <Link href={fijo ? `/pedidos/${pedido.id}` : "/facturacion"} className="px-2 text-sm text-gris-700 hover:text-tinta">Cancelar</Link>
      </div>
    </form>
  );
}
