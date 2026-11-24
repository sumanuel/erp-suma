"use client";

import Link from "next/link";
import { Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Aviso, Tarjeta, clasesBoton, claseControl } from "@/components/ui";
import { BuscadorProducto, alEnter, enfocarBuscador, enfocarCampo } from "@/components/buscador-producto";
import { SelectorBuscable } from "@/components/selector-buscable";
import { SelectorTercero } from "@/components/selector-tercero";
import { CondicionesCompra, useCondicionesCompra, type CondicionesCompraInicial, type DatosCompraForm } from "@/components/compras/condiciones-compra";
import { calcularLinea, calcularTotales } from "@/lib/compras/calculos";
import { descuentoEfectivo, descuentoGlobal } from "@/lib/pedidos/calculos";
import { buscarProductos, guardarOrdenCompra, type ProductoBusqueda } from "./acciones";
import { formatoUsd } from "./formato";

export type LineaForm = { productoCodigo: string; descripcion: string; ivaPorcentaje: number; cantidad: string; costoUnitario: string; descuento: string; descuento2: string; descuento3: string; arancelId: string };
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


  function agregar(p: ProductoBusqueda) {
    enfocarCampo(p.codigo, "descuento");
    setLineas((ls) => (ls.some((l) => l.productoCodigo === p.codigo) ? ls : [...ls, { productoCodigo: p.codigo, descripcion: p.descripcion, ivaPorcentaje: p.ivaPorcentaje, cantidad: "1", costoUnitario: String(p.ultimoCosto), descuento: "0", descuento2: "0", descuento3: "0", arancelId: "" }]));
  }
  const cambiar = (i: number, campo: "cantidad" | "costoUnitario" | "descuento" | "descuento2" | "descuento3" | "arancelId", v: string) => setLineas((ls) => ls.map((l, k) => (k === i ? { ...l, [campo]: v } : l)));

  // Vista previa: el costo va en la moneda de la orden y el descuento efectivo combina los tres de la línea con los del documento.
  const costoUsd = (l: LineaForm) => (cond.cambio > 0 ? num(l.costoUnitario) / cond.cambio : num(l.costoUnitario));
  const efectivo = (l: LineaForm) => descuentoEfectivo(descuentoGlobal([num(l.descuento), num(l.descuento2), num(l.descuento3)]), cond.global);
  const calculadas = lineas.map((l) => calcularLinea({ cantidad: num(l.cantidad), costoUnitario: costoUsd(l), descuento: efectivo(l), ivaPorcentaje: l.ivaPorcentaje }));
  const totales = calcularTotales(lineas.map((l) => ({ cantidad: num(l.cantidad), costoUnitario: costoUsd(l), descuento: efectivo(l), ivaPorcentaje: l.ivaPorcentaje })));

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

  const cel = "px-2 py-2";
  return (
    <form onSubmit={(e) => { e.preventDefault(); guardar(); }} className="flex flex-col gap-6">
      {error ? <Aviso tono="error">{error}</Aviso> : null}
      <Tarjeta className="p-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="proveedorId" className="text-[13px] font-medium">Proveedor</label>
            <SelectorTercero tipo="proveedor" id="proveedorId" valor={proveedorId} opciones={proveedores} requerido placeholder="Buscar proveedor por nombre o RIF…" onCambio={(v) => { setProveedorId(v); cond.elegirProveedor(v); }} onElegido={() => document.getElementById("buscar-producto")?.focus()} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="fecha" className="text-[13px] font-medium">Fecha</label>
            <input id="fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required className={claseControl} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="fechaEsperada" className="text-[13px] font-medium">Entrega esperada</label>
            <input id="fechaEsperada" type="date" value={fechaEsperada} onChange={(e) => setFechaEsperada(e.target.value)} className={claseControl} />
          </div>
          <div className="flex flex-col gap-1.5 md:col-span-2 xl:col-span-4">
            <label htmlFor="observaciones" className="text-[13px] font-medium">Observaciones</label>
            <input id="observaciones" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} maxLength={1000} className={claseControl} />
          </div>
        </div>
      </Tarjeta>

      <CondicionesCompra cond={cond} datos={compras} />

      <Tarjeta recortar={false}>
        <BuscadorProducto buscar={buscarProductos} onElegir={agregar} derecha={(p) => formatoUsd(p.ultimoCosto)} />
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13.5px]">
            <thead>
              <tr className="border-y border-linea text-[12.5px] text-gris-600">
                <th className="px-4 py-3 font-medium">Producto</th><th className="px-2 py-3 text-right font-medium">Cantidad</th><th className="px-2 py-3 text-right font-medium">Costo {cond.moneda === "VES" ? "Bs." : "USD"}</th>
                <th className="px-2 py-3 text-right font-medium">Desc. 1 %</th><th className="px-2 py-3 text-right font-medium">Desc. 2 %</th><th className="px-2 py-3 text-right font-medium">Desc. 3 %</th><th className="px-2 py-3 font-medium">Arancel</th><th className="px-2 py-3 text-right font-medium">IVA %</th><th className="px-2 py-3 text-right font-medium">Total</th><th className="px-4 py-3"><span className="sr-only">Quitar</span></th>
              </tr>
            </thead>
            <tbody>
              {lineas.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-gris-500">Busca y agrega los productos de la orden.</td></tr>
              ) : lineas.map((l, i) => (
                <tr key={l.productoCodigo} className="border-b border-linea last:border-0">
                  <td className="px-4 py-2"><span className="font-semibold">{l.productoCodigo}</span> · {l.descripcion}</td>
                  <td className={cel}><input aria-label={`Cantidad de ${l.productoCodigo}`} data-linea={l.productoCodigo} data-campo="cantidad" onKeyDown={(e) => alEnter(e, () => enfocarBuscador())} inputMode="decimal" value={l.cantidad} onChange={(e) => cambiar(i, "cantidad", e.target.value)} className={`${claseControl} w-24 text-right`} /></td>
                  <td className={cel}><input aria-label={`Costo de ${l.productoCodigo}`} inputMode="decimal" value={l.costoUnitario} onChange={(e) => cambiar(i, "costoUnitario", e.target.value)} className={`${claseControl} w-28 text-right`} /></td>
                  <td className={cel}><input aria-label={`Descuento de ${l.productoCodigo}`} data-linea={l.productoCodigo} data-campo="descuento" onKeyDown={(e) => alEnter(e, () => enfocarCampo(l.productoCodigo, "cantidad"))} inputMode="decimal" value={l.descuento} onChange={(e) => cambiar(i, "descuento", e.target.value)} className={`${claseControl} w-20 text-right`} /></td>
                  <td className={cel}><input aria-label={`Descuento 2 de ${l.productoCodigo}`} inputMode="decimal" value={l.descuento2} onChange={(e) => cambiar(i, "descuento2", e.target.value)} className={`${claseControl} w-16 text-right`} /></td>
                  <td className={cel}><input aria-label={`Descuento 3 de ${l.productoCodigo}`} inputMode="decimal" value={l.descuento3} onChange={(e) => cambiar(i, "descuento3", e.target.value)} className={`${claseControl} w-16 text-right`} /></td>
                  <td className={cel}>
                    <select aria-label={`Arancel de ${l.productoCodigo}`} value={l.arancelId} onChange={(e) => cambiar(i, "arancelId", e.target.value)} className={`${claseControl} w-40 pr-8`}>
                      <option value="">Sin arancel</option>{compras.aranceles.map((a) => <option key={a.valor} value={a.valor}>{a.etiqueta}</option>)}
                    </select>
                  </td>
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
        <button type="submit" disabled={pendiente} className={clasesBoton("primario")}>{pendiente ? "Guardando…" : id ? "Guardar cambios" : "Crear orden"}</button>
        <Link href={id ? `/compras/${id}` : "/compras"} className="px-2 text-sm text-gris-700 hover:text-tinta">Cancelar</Link>
      </div>
    </form>
  );
}
