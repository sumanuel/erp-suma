"use client";

import { Tecla } from "@/components/atajos";
import { AccionesDocumento } from "@/components/acciones-documento";
import { useState, useTransition } from "react";
import { Aviso, Tarjeta, claseControl } from "@/components/ui";
import { SelectorTercero } from "@/components/selector-tercero";
import { CapturaCompra, TablaCompra, totalLinea, type LineaCompra } from "@/components/compras/captura-compra";
import { MasDatos } from "@/components/ventas/condiciones-venta";
import { CamposBasicosCompra, CamposMasCompra, avanzarCompra, enterEnOrden, resumenMasDatosCompra, useCondicionesCompra, type CondicionesCompraInicial, type DatosCompraForm } from "@/components/compras/condiciones-compra";
import { buscarProductos, guardarOrdenCompra } from "./acciones";
import { formatoUsd } from "./formato";

export type LineaForm = LineaCompra;
export type InicialOrden = { proveedorId: string; fecha: string; fechaEsperada: string; observaciones: string; lineas: LineaForm[]; condiciones?: CondicionesCompraInicial };

const num = (s: string) => {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

export function FormularioOrden({ id, inicial, proveedores, compras }: { id: string | null; inicial: InicialOrden; proveedores: { valor: string; etiqueta: string }[]; compras: DatosCompraForm }) {
  const [proveedorId, setProveedorId] = useState(inicial.proveedorId);
  const cond = useCondicionesCompra(inicial.condiciones, compras);
  const [fecha, setFecha] = useState(inicial.fecha);
  const [fechaEsperada, setFechaEsperada] = useState(inicial.fechaEsperada);
  const [observaciones, setObservaciones] = useState(inicial.observaciones);
  const [lineas, setLineas] = useState<LineaForm[]>(inicial.lineas);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();


  const [masAbierto, setMasAbierto] = useState(false);

  // Vista previa (el servidor recalcula): el costo va en la moneda de la orden.
  const calculadas = lineas.map((l) => totalLinea(l, cond.cambio, cond.global));
  const totales = calculadas.reduce((t, c) => ({ subtotal: t.subtotal + c.neto, iva: t.iva + c.iva, total: t.total + c.total }), { subtotal: 0, iva: 0, total: 0 });

  function guardar() {
    setError(null);
    iniciar(async () => {
      const r = await guardarOrdenCompra(id, {
        proveedorId, fecha, fechaEsperada, observaciones, encabezado: cond.encabezado(),
        lineas: lineas.map((l) => ({ productoCodigo: l.productoCodigo, cantidad: num(l.cantidad), costoUnitario: num(l.costoUnitario), descuento: num(l.descuento), descuento2: num(l.descuento2), descuento3: num(l.descuento3), arancelId: l.arancelId })),
      });
      if (r?.error) setError(r.error);
    });
  }

  const celda = "flex flex-col gap-1.5";
  const etiqueta = "text-[13px] font-medium";
  const irAGuardar = () => requestAnimationFrame(() => document.getElementById("guardar-documento")?.focus());
  return (
    <form onSubmit={(e) => { e.preventDefault(); guardar(); }} onKeyDown={enterEnOrden} className="flex flex-col gap-4">
      {error ? <Aviso tono="error">{error}</Aviso> : null}
      <Tarjeta className="flex flex-col gap-4 p-4" recortar={false}>
        <div className="grid gap-x-4 gap-y-3 md:grid-cols-2 xl:grid-cols-4">
          <div className={`${celda} xl:col-span-2`}>
            <label htmlFor="proveedorId" className={etiqueta}>Proveedor <Tecla>F1</Tecla></label>
            <SelectorTercero tipo="proveedor" id="proveedorId" valor={proveedorId} opciones={proveedores} requerido placeholder="RIF o nombre del proveedor…" onCambio={(v) => { setProveedorId(v); cond.elegirProveedor(v); }} onElegido={() => avanzarCompra("proveedorId")} />
          </div>
          <div className={celda}>
            <label htmlFor="fecha" className={etiqueta}>Fecha</label>
            <input id="fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required className={claseControl} />
          </div>
          <div className={celda}>
            <label htmlFor="fechaEsperada" className={etiqueta}>Entrega esperada</label>
            <input id="fechaEsperada" type="date" value={fechaEsperada} onChange={(e) => setFechaEsperada(e.target.value)} className={claseControl} />
          </div>
          <CamposBasicosCompra cond={cond} datos={compras} />
        </div>
        <MasDatos abierto={masAbierto} onAlternar={() => setMasAbierto((x) => !x)} resumen={resumenMasDatosCompra(cond, observaciones.trim() ? ["observaciones"] : [])}>
          <div className={`${celda} md:col-span-2 xl:col-span-4`}>
            <label htmlFor="observaciones" className={etiqueta}>Observaciones</label>
            <input id="observaciones" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} maxLength={1000} className={claseControl} />
          </div>
          <CamposMasCompra cond={cond} datos={compras} />
        </MasDatos>
      </Tarjeta>

      <Tarjeta recortar={false}>
        <CapturaCompra buscar={buscarProductos} lineas={lineas} onCambio={setLineas} cambio={cond.cambio} global={cond.global} moneda={cond.moneda} aranceles={compras.aranceles} onEnterVacio={irAGuardar} />
        <TablaCompra lineas={lineas} onQuitar={(i) => setLineas((ls) => ls.filter((_x, k) => k !== i))} cambio={cond.cambio} global={cond.global} moneda={cond.moneda} aranceles={compras.aranceles} />
        <dl className="ml-auto flex w-full max-w-xs flex-col gap-1 p-4 text-[13.5px]">
          <div className="flex justify-between"><dt className="text-gris-600">Subtotal</dt><dd className="tabular-nums">{formatoUsd(totales.subtotal)}</dd></div>
          <div className="flex justify-between"><dt className="text-gris-600">IVA</dt><dd className="tabular-nums">{formatoUsd(totales.iva)}</dd></div>
          <div className="flex justify-between border-t border-linea pt-1 text-[15px] font-semibold"><dt>Total USD</dt><dd className="tabular-nums">{formatoUsd(totales.total)}</dd></div>
        </dl>
      </Tarjeta>

      <AccionesDocumento texto={id ? "Guardar cambios" : "Crear orden"} pendiente={pendiente} volver={id ? `/compras/${id}` : "/compras"} huella={JSON.stringify([proveedorId, fecha, fechaEsperada, observaciones, cond.encabezado(), lineas])} />
    </form>
  );
}
