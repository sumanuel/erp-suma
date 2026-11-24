"use client";

import Link from "next/link";
import { Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Aviso, Tarjeta, clasesBoton, claseControl } from "@/components/ui";
import { BuscadorProducto, alEnter, enfocarBuscador, enfocarCampo } from "@/components/buscador-producto";
import { SelectorBuscable } from "@/components/selector-buscable";
import { SelectorTercero } from "@/components/selector-tercero";
import { CondicionesVenta, useCondiciones, type CondicionesInicial, type DatosVentaForm } from "@/components/ventas/condiciones-venta";
import { descuentoEfectivo } from "@/lib/pedidos/calculos";
import { SelectorUnidad } from "@/components/ventas/selector-unidad";
import { conUnidad, type PresentacionVenta } from "@/lib/ventas/presentaciones";
import { calcularLinea, calcularTotales } from "@/lib/cotizaciones/estados";
import { buscarProductosCotizacion, guardarCotizacionVenta } from "./acciones";
import type { ProductoVenta } from "@/lib/pedidos/servicio";
import { formatoCantidad, formatoUsd } from "./formato";

export type LineaForm = { productoCodigo: string; descripcion: string; ivaPorcentaje: number; cantidad: string; precioUnitario: string; descuento: string; presentacionId?: string; presentaciones?: PresentacionVenta[]; precioUnidad?: number };
export type InicialCotizacion = { clienteId: string; fecha: string; validezDias: string; observaciones: string; lineas: LineaForm[]; condiciones?: CondicionesInicial };

const num = (s: string) => {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

export function FormularioCotizacion({ id, inicial, clientes, ventas }: { id: string | null; inicial: InicialCotizacion; clientes: { valor: string; etiqueta: string }[]; ventas: DatosVentaForm }) {
  const [clienteId, setClienteId] = useState(inicial.clienteId);
  const cond = useCondiciones(inicial.condiciones, ventas, inicial.clienteId);
  const [fecha, setFecha] = useState(inicial.fecha);
  const [validezDias, setValidezDias] = useState(inicial.validezDias);
  const [observaciones, setObservaciones] = useState(inicial.observaciones);
  const [lineas, setLineas] = useState<LineaForm[]>(inicial.lineas);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();


  function agregar(p: ProductoVenta) {
    enfocarCampo(p.codigo, "descuento");
    setLineas((ls) => (ls.some((l) => l.productoCodigo === p.codigo) ? ls : [...ls, { productoCodigo: p.codigo, descripcion: p.descripcion, ivaPorcentaje: p.ivaPorcentaje, cantidad: "1", presentaciones: p.presentaciones, precioUnidad: p.precioLista, precioUnitario: String(p.precioLista), descuento: String(p.descuentoSugerido ?? 0) }]));
  }
  const cambiar = (i: number, campo: "cantidad" | "precioUnitario" | "descuento", v: string) => setLineas((ls) => ls.map((l, k) => (k === i ? { ...l, [campo]: v } : l)));

  const cambiarUnidad = (i: number, id: string) => setLineas((ls) => ls.map((l, k) => (k === i ? conUnidad(l, id) : l)));
  const entrada = lineas.map((l) => ({ cantidad: num(l.cantidad), costoUnitario: num(l.precioUnitario), descuento: descuentoEfectivo(num(l.descuento), cond.global), ivaPorcentaje: l.ivaPorcentaje }));
  const calculadas = entrada.map(calcularLinea);
  const totales = calcularTotales(entrada);

  function guardar() {
    setError(null);
    iniciar(async () => {
      const r = await guardarCotizacionVenta(id, {
        clienteId, fecha, validezDias: Math.trunc(num(validezDias)), observaciones, encabezado: cond.encabezado(),
        lineas: lineas.map((l) => ({ productoCodigo: l.productoCodigo, presentacionId: l.presentacionId || null, cantidad: num(l.cantidad), precioUnitario: num(l.precioUnitario), descuento: num(l.descuento) })),
      });
      if (r?.error) setError(r.error);
    });
  }

  const cel = "px-2 py-2";
  return (
    <form onSubmit={(e) => { e.preventDefault(); guardar(); }} className="flex flex-col gap-6">
      {error ? <Aviso tono="error">{error}</Aviso> : null}
      <Tarjeta className="p-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="flex flex-col gap-1.5 xl:col-span-2">
            <label htmlFor="clienteId" className="text-[13px] font-medium">Cliente</label>
            <SelectorTercero tipo="cliente" id="clienteId" valor={clienteId} opciones={clientes} requerido placeholder="Buscar cliente por nombre o cédula/RIF…" onCambio={(v) => { setClienteId(v); cond.elegirCliente(v); }} onElegido={() => document.getElementById("vendedorId")?.focus()} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="fecha" className="text-[13px] font-medium">Fecha</label>
            <input id="fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required className={claseControl} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="validezDias" className="text-[13px] font-medium">Vigencia (días)</label>
            <input id="validezDias" inputMode="numeric" value={validezDias} onChange={(e) => setValidezDias(e.target.value)} required className={claseControl} />
          </div>
          <div className="flex flex-col gap-1.5 md:col-span-2 xl:col-span-4">
            <label htmlFor="observaciones" className="text-[13px] font-medium">Observaciones</label>
            <input id="observaciones" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} maxLength={1000} className={claseControl} />
          </div>
        </div>
      </Tarjeta>

      <CondicionesVenta cond={cond} datos={ventas} />

      <Tarjeta recortar={false}>
        <BuscadorProducto buscar={(q) => buscarProductosCotizacion(q, cond.lista)} onElegir={agregar} derecha={(p) => `${formatoUsd(p.precioLista)} · disp. ${formatoCantidad(p.disponible)}`} />
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13.5px]">
            <thead>
              <tr className="border-y border-linea text-[12.5px] text-gris-600">
                <th className="px-4 py-3 font-medium">Producto</th><th className="px-2 py-3 text-right font-medium">Cantidad</th><th className="px-2 py-3 text-right font-medium">Precio USD</th>
                <th className="px-2 py-3 text-right font-medium">Desc. %</th><th className="px-2 py-3 text-right font-medium">IVA %</th><th className="px-2 py-3 text-right font-medium">Total</th><th className="px-4 py-3"><span className="sr-only">Quitar</span></th>
              </tr>
            </thead>
            <tbody>
              {lineas.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gris-500">Busca y agrega los productos de la cotización.</td></tr>
              ) : lineas.map((l, i) => (
                <tr key={l.productoCodigo} className="border-b border-linea last:border-0">
                  <td className="px-4 py-2"><span className="font-semibold">{l.productoCodigo}</span> · {l.descripcion}<SelectorUnidad codigo={l.productoCodigo} presentaciones={l.presentaciones} valor={l.presentacionId} onCambio={(id) => cambiarUnidad(i, id)} /></td>
                  <td className={cel}><input aria-label={`Cantidad de ${l.productoCodigo}`} data-linea={l.productoCodigo} data-campo="cantidad" onKeyDown={(e) => alEnter(e, () => enfocarBuscador())} inputMode="decimal" value={l.cantidad} onChange={(e) => cambiar(i, "cantidad", e.target.value)} className={`${claseControl} w-24 text-right`} /></td>
                  <td className={cel}><input aria-label={`Precio de ${l.productoCodigo}`} inputMode="decimal" value={l.precioUnitario} onChange={(e) => cambiar(i, "precioUnitario", e.target.value)} className={`${claseControl} w-28 text-right`} /></td>
                  <td className={cel}><input aria-label={`Descuento de ${l.productoCodigo}`} data-linea={l.productoCodigo} data-campo="descuento" onKeyDown={(e) => alEnter(e, () => enfocarCampo(l.productoCodigo, "cantidad"))} inputMode="decimal" value={l.descuento} onChange={(e) => cambiar(i, "descuento", e.target.value)} className={`${claseControl} w-20 text-right`} /></td>
                  <td className={`${cel} text-right tabular-nums`}>{l.ivaPorcentaje}</td>
                  <td className={`${cel} text-right tabular-nums`}>{formatoUsd(calculadas[i].total)}</td>
                  <td className="px-4 py-2 text-right">
                    <button type="button" aria-label={`Quitar ${l.productoCodigo}`} onClick={() => setLineas((ls) => ls.filter((_, k) => k !== i))} className="inline-flex size-9 items-center justify-center rounded-[9px] border border-[#f3c7c7] text-error hover:bg-error-suave"><Trash2 className="size-4" aria-hidden /></button>
                  </td>
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
        <button type="submit" disabled={pendiente} className={clasesBoton("primario")}>{pendiente ? "Guardando…" : id ? "Guardar cambios" : "Crear cotización"}</button>
        <Link href={id ? `/cotizaciones/${id}` : "/cotizaciones"} className="px-2 text-sm text-gris-700 hover:text-tinta">Cancelar</Link>
      </div>
    </form>
  );
}
