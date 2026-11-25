"use client";

import { AccionesDocumento } from "@/components/acciones-documento";
import { useState, useTransition } from "react";
import { Aviso, Tarjeta, claseControl } from "@/components/ui";
import { SelectorTercero } from "@/components/selector-tercero";
import { Articulos, CapturaArticulo, TablaLineas, type LineaCapturada } from "@/components/ventas/captura-articulo";
import { CamposBasicos, CamposMas, MasDatos, avanzarDesde, enterEnFormulario, resumenMasDatos, useCondiciones, type CondicionesInicial, type DatosVentaForm } from "@/components/ventas/condiciones-venta";
import { descuentoEfectivo } from "@/lib/pedidos/calculos";
import { calcularTotales } from "@/lib/cotizaciones/estados";
import { buscarProductosCotizacion, guardarCotizacionVenta } from "./acciones";
import { formatoUsd } from "./formato";

export type LineaForm = LineaCapturada;
export type InicialCotizacion = { clienteId: string; fecha: string; validezDias: string; observaciones: string; lineas: LineaForm[]; condiciones?: CondicionesInicial };

const num = (s: string) => {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

export function FormularioCotizacion({ id, inicial, clientes, ventas, puedeCambiarPrecio }: { puedeCambiarPrecio: boolean; id: string | null; inicial: InicialCotizacion; clientes: { valor: string; etiqueta: string }[]; ventas: DatosVentaForm }) {
  const [clienteId, setClienteId] = useState(inicial.clienteId);
  const cond = useCondiciones(inicial.condiciones, ventas, inicial.clienteId);
  const [fecha, setFecha] = useState(inicial.fecha);
  const [validezDias, setValidezDias] = useState(inicial.validezDias);
  const [observaciones, setObservaciones] = useState(inicial.observaciones);
  const [lineas, setLineas] = useState<LineaForm[]>(inicial.lineas);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();


  const [masAbierto, setMasAbierto] = useState(false);
  const entrada = lineas.map((l) => ({ cantidad: num(l.cantidad), costoUnitario: num(l.precioUnitario), descuento: descuentoEfectivo(num(l.descuento), cond.global), ivaPorcentaje: l.ivaPorcentaje }));
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

  const celda = "flex flex-col gap-1.5";
  const etiqueta = "text-[13px] font-medium";
  const irAGuardar = () => requestAnimationFrame(() => document.getElementById("guardar-documento")?.focus());
  return (
    <form onSubmit={(e) => { e.preventDefault(); guardar(); }} onKeyDown={enterEnFormulario} className="flex flex-col gap-4">
      {error ? <Aviso tono="error">{error}</Aviso> : null}
      <Tarjeta className="flex flex-col gap-4 p-4" recortar={false}>
            <div className="grid gap-x-4 gap-y-3 md:grid-cols-2 xl:grid-cols-4">
              <div className={`${celda} xl:col-span-2`}>
                <label htmlFor="clienteId" className={etiqueta}>Cliente</label>
                <SelectorTercero tipo="cliente" id="clienteId" valor={clienteId} opciones={clientes} requerido placeholder="Cédula, RIF o nombre…" onCambio={(v) => { setClienteId(v); cond.elegirCliente(v); }} onElegido={() => avanzarDesde("clienteId")} />
              </div>
              <CamposBasicos cond={cond} datos={ventas} />
              <div className={celda}>
                <label htmlFor="fecha" className={etiqueta}>Fecha</label>
                <input id="fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required className={claseControl} />
              </div>
              <div className={celda}>
                <label htmlFor="validezDias" className={etiqueta}>Vigencia (días)</label>
                <input id="validezDias" inputMode="numeric" value={validezDias} onChange={(e) => setValidezDias(e.target.value)} required className={claseControl} />
              </div>
            </div>
            <MasDatos abierto={masAbierto} onAlternar={() => setMasAbierto((x) => !x)} resumen={resumenMasDatos(cond, observaciones.trim() ? ["observaciones"] : [])}>
              <div className={`${celda} md:col-span-2 xl:col-span-4`}>
                <label htmlFor="observaciones" className={etiqueta}>Observaciones</label>
                <input id="observaciones" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} maxLength={1000} className={claseControl} />
              </div>
              <CamposMas cond={cond} datos={ventas} />
            </MasDatos>
      </Tarjeta>

      <Articulos>
        <CapturaArticulo buscar={(q, limite) => buscarProductosCotizacion(q, cond.lista, limite)} lineas={lineas} onCambio={setLineas} puedeCambiarPrecio={puedeCambiarPrecio} descuentoGlobal={cond.global} onEnterVacio={irAGuardar} />
        <TablaLineas lineas={lineas} onQuitar={(i) => setLineas((ls) => ls.filter((_x, k) => k !== i))} descuentoGlobal={cond.global} vacio="Busca y agrega los productos de la cotización." />
        <dl className="ml-auto flex w-full max-w-xs flex-col gap-1 p-4 text-[13.5px]">
          <div className="flex justify-between"><dt className="text-gris-600">Subtotal</dt><dd className="tabular-nums">{formatoUsd(totales.subtotal)}</dd></div>
          <div className="flex justify-between"><dt className="text-gris-600">IVA</dt><dd className="tabular-nums">{formatoUsd(totales.iva)}</dd></div>
          <div className="flex justify-between border-t border-linea pt-1 text-[15px] font-semibold"><dt>Total USD</dt><dd className="tabular-nums">{formatoUsd(totales.total)}</dd></div>
        </dl>
      </Articulos>

      <AccionesDocumento texto={id ? "Guardar cambios" : "Crear cotización"} pendiente={pendiente} volver={id ? `/cotizaciones/${id}` : "/cotizaciones"} huella={JSON.stringify([clienteId, fecha, validezDias, observaciones, cond.encabezado(), lineas])} />
    </form>
  );
}
