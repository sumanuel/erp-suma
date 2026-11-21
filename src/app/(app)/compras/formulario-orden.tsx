"use client";

import Link from "next/link";
import { Trash2 } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { Aviso, Tarjeta, clasesBoton, claseControl } from "@/components/ui";
import { calcularLinea, calcularTotales } from "@/lib/compras/calculos";
import { buscarProductos, guardarOrdenCompra, type ProductoBusqueda } from "./acciones";
import { formatoUsd } from "./formato";

export type LineaForm = { productoCodigo: string; descripcion: string; ivaPorcentaje: number; cantidad: string; costoUnitario: string; descuento: string };
export type InicialOrden = { proveedorId: string; fecha: string; fechaEsperada: string; observaciones: string; lineas: LineaForm[] };

const num = (s: string) => {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

export function FormularioOrden({ id, inicial, proveedores }: { id: string | null; inicial: InicialOrden; proveedores: { valor: string; etiqueta: string }[] }) {
  const [proveedorId, setProveedorId] = useState(inicial.proveedorId);
  const [fecha, setFecha] = useState(inicial.fecha);
  const [fechaEsperada, setFechaEsperada] = useState(inicial.fechaEsperada);
  const [observaciones, setObservaciones] = useState(inicial.observaciones);
  const [lineas, setLineas] = useState<LineaForm[]>(inicial.lineas);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  // Buscador de productos con espera corta entre teclas; descarta respuestas que llegan fuera de orden.
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState<ProductoBusqueda[]>([]);
  const ultima = useRef(0);
  useEffect(() => {
    const q = texto.trim();
    if (q.length < 2) return;
    const turno = ++ultima.current;
    const t = setTimeout(async () => {
      const r = await buscarProductos(q).catch(() => []);
      if (turno === ultima.current) setResultados(r);
    }, 250);
    return () => clearTimeout(t);
  }, [texto]);
  const visibles = texto.trim().length < 2 ? [] : resultados;

  function agregar(p: ProductoBusqueda) {
    setTexto("");
    setResultados([]);
    setLineas((ls) => (ls.some((l) => l.productoCodigo === p.codigo) ? ls : [...ls, { productoCodigo: p.codigo, descripcion: p.descripcion, ivaPorcentaje: p.ivaPorcentaje, cantidad: "1", costoUnitario: String(p.ultimoCosto), descuento: "0" }]));
  }
  const cambiar = (i: number, campo: "cantidad" | "costoUnitario" | "descuento", v: string) => setLineas((ls) => ls.map((l, k) => (k === i ? { ...l, [campo]: v } : l)));

  const calculadas = lineas.map((l) => calcularLinea({ cantidad: num(l.cantidad), costoUnitario: num(l.costoUnitario), descuento: num(l.descuento), ivaPorcentaje: l.ivaPorcentaje }));
  const totales = calcularTotales(lineas.map((l) => ({ cantidad: num(l.cantidad), costoUnitario: num(l.costoUnitario), descuento: num(l.descuento), ivaPorcentaje: l.ivaPorcentaje })));

  function guardar() {
    setError(null);
    iniciar(async () => {
      const r = await guardarOrdenCompra(id, {
        proveedorId, fecha, fechaEsperada, observaciones,
        lineas: lineas.map((l) => ({ productoCodigo: l.productoCodigo, cantidad: num(l.cantidad), costoUnitario: num(l.costoUnitario), descuento: num(l.descuento) })),
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
            <select id="proveedorId" value={proveedorId} onChange={(e) => setProveedorId(e.target.value)} required className={`${claseControl} pr-9`}>
              <option value="">Elegir…</option>
              {proveedores.map((p) => <option key={p.valor} value={p.valor}>{p.etiqueta}</option>)}
            </select>
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

      <Tarjeta recortar={false}>
        <div className="relative p-4">
          <label htmlFor="buscar-producto" className="mb-1.5 block text-[13px] font-medium">Agregar producto</label>
          <input id="buscar-producto" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Código, descripción o código de barras" autoComplete="off" className={`${claseControl} max-w-xl`} />
          {visibles.length > 0 ? (
            <ul className="absolute z-10 mt-1 max-h-72 w-full max-w-xl overflow-auto rounded-[10px] border border-borde bg-white py-1 shadow-lg">
              {visibles.map((p) => (
                <li key={p.codigo}>
                  <button type="button" onClick={() => agregar(p)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[13.5px] hover:bg-hover">
                    <span className="min-w-0 truncate"><span className="font-semibold">{p.codigo}</span> · {p.descripcion}</span>
                    <span className="shrink-0 text-gris-500">{formatoUsd(p.ultimoCosto)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13.5px]">
            <thead>
              <tr className="border-y border-linea text-[12.5px] text-gris-600">
                <th className="px-4 py-3 font-medium">Producto</th><th className="px-2 py-3 text-right font-medium">Cantidad</th><th className="px-2 py-3 text-right font-medium">Costo USD</th>
                <th className="px-2 py-3 text-right font-medium">Desc. %</th><th className="px-2 py-3 text-right font-medium">IVA %</th><th className="px-2 py-3 text-right font-medium">Total</th><th className="px-4 py-3"><span className="sr-only">Quitar</span></th>
              </tr>
            </thead>
            <tbody>
              {lineas.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gris-500">Busca y agrega los productos de la orden.</td></tr>
              ) : lineas.map((l, i) => (
                <tr key={l.productoCodigo} className="border-b border-linea last:border-0">
                  <td className="px-4 py-2"><span className="font-semibold">{l.productoCodigo}</span> · {l.descripcion}</td>
                  <td className={cel}><input aria-label={`Cantidad de ${l.productoCodigo}`} inputMode="decimal" value={l.cantidad} onChange={(e) => cambiar(i, "cantidad", e.target.value)} className={`${claseControl} w-24 text-right`} /></td>
                  <td className={cel}><input aria-label={`Costo de ${l.productoCodigo}`} inputMode="decimal" value={l.costoUnitario} onChange={(e) => cambiar(i, "costoUnitario", e.target.value)} className={`${claseControl} w-28 text-right`} /></td>
                  <td className={cel}><input aria-label={`Descuento de ${l.productoCodigo}`} inputMode="decimal" value={l.descuento} onChange={(e) => cambiar(i, "descuento", e.target.value)} className={`${claseControl} w-20 text-right`} /></td>
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
