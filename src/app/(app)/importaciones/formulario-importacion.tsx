"use client";

import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Aviso, Tarjeta, clasesBoton, claseControl } from "@/components/ui";
import { BuscadorProducto, alEnter, enfocarBuscador, enfocarCampo } from "@/components/buscador-producto";
import { SelectorBuscable } from "@/components/selector-buscable";
import { SelectorTercero } from "@/components/selector-tercero";
import { liquidarImportacion } from "@/lib/importaciones/calculos";
import { buscarProductosImportacion, guardarImportacionForm, type ProductoImportacion } from "./acciones";

export type LineaImp = { productoCodigo: string; descripcion: string; cantidad: string; fobUnitario: string; arancelPct: string };
export type GastoImp = { descripcion: string; montoUsd: string; proveedorId: string };
export type InicialImportacion = {
  proveedorId: string; documento: string; fecha: string; almacenId: string; moneda: string; cambioUsd: string; factorCif: string; factorOtros: string; observaciones: string;
  lineas: LineaImp[]; gastos: GastoImp[];
};
type Opc = { valor: string; etiqueta: string };

const num = (s: string) => {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const fmt = (n: number, d = 2) => n.toLocaleString("es-VE", { minimumFractionDigits: d, maximumFractionDigits: Math.max(d, 4) });

/** Expediente de importación: datos del documento, productos con precio FOB, gastos y la liquidación del costo en vivo (la misma fórmula que aplica el servidor). */
export function FormularioImportacion({ id, inicial, proveedores, almacenes }: { id: string | null; inicial: InicialImportacion; proveedores: Opc[]; almacenes: Opc[] }) {
  const [f, setF] = useState(inicial);
  const [lineas, setLineas] = useState<LineaImp[]>(inicial.lineas);
  const [gastos, setGastos] = useState<GastoImp[]>(inicial.gastos);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const campo = (k: keyof Omit<InicialImportacion, "lineas" | "gastos">, v: string) => setF((x) => ({ ...x, [k]: v }));


  const agregar = (p: ProductoImportacion) => {
    enfocarCampo(p.codigo, "cantidad");
    setLineas((ls) => (ls.some((l) => l.productoCodigo === p.codigo) ? ls : [...ls, { productoCodigo: p.codigo, descripcion: p.descripcion, cantidad: "1", fobUnitario: "0", arancelPct: String(p.arancelPct) }]));
  };
  const cambiarLinea = (i: number, k: "cantidad" | "fobUnitario" | "arancelPct", v: string) => setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const cambiarGasto = (i: number, k: keyof GastoImp, v: string) => setGastos((gs) => gs.map((g, j) => (j === i ? { ...g, [k]: v } : g)));

  const gastosUsd = gastos.reduce((s, g) => s + Math.max(0, num(g.montoUsd)), 0);
  const liq = liquidarImportacion(lineas.map((l) => ({ cantidad: num(l.cantidad), fobUnitario: num(l.fobUnitario), arancelPct: num(l.arancelPct) })), { cambioUsd: num(f.cambioUsd) || 1, factorCif: num(f.factorCif) || 1, factorOtros: num(f.factorOtros), gastosUsd });

  function guardar() {
    setError(null);
    iniciar(async () => {
      const r = await guardarImportacionForm(id, {
        proveedorId: f.proveedorId, documento: f.documento, fecha: f.fecha, almacenId: f.almacenId, moneda: f.moneda, cambioUsd: num(f.cambioUsd), factorCif: num(f.factorCif), factorOtros: num(f.factorOtros), observaciones: f.observaciones,
        lineas: lineas.map((l) => ({ productoCodigo: l.productoCodigo, cantidad: num(l.cantidad), fobUnitario: num(l.fobUnitario), arancelPct: num(l.arancelPct) })),
        gastos: gastos.map((g) => ({ descripcion: g.descripcion, montoUsd: num(g.montoUsd), proveedorId: g.proveedorId })),
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
            <label htmlFor="proveedorId" className="text-[13px] font-medium">Proveedor del exterior</label>
            <SelectorTercero tipo="proveedor" id="proveedorId" valor={f.proveedorId} opciones={proveedores} requerido placeholder="Buscar proveedor por nombre o RIF…" onCambio={(v) => { campo("proveedorId", v); }} onElegido={() => document.getElementById("buscar-producto")?.focus()} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="documento" className="text-[13px] font-medium">Documento (factura del proveedor)</label>
            <input id="documento" value={f.documento} onChange={(e) => campo("documento", e.target.value)} required maxLength={40} className={claseControl} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="fecha" className="text-[13px] font-medium">Fecha</label>
            <input id="fecha" type="date" value={f.fecha} onChange={(e) => campo("fecha", e.target.value)} required className={claseControl} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="almacenId" className="text-[13px] font-medium">Almacén de ingreso</label>
            <select id="almacenId" value={f.almacenId} onChange={(e) => campo("almacenId", e.target.value)} required className={`${claseControl} pr-9`}>
              <option value="">Elegir…</option>{almacenes.map((a) => <option key={a.valor} value={a.valor}>{a.etiqueta}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="moneda" className="text-[13px] font-medium">Moneda del FOB</label>
            <input id="moneda" value={f.moneda} onChange={(e) => campo("moneda", e.target.value.toUpperCase())} required maxLength={3} className={claseControl} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="cambioUsd" className="text-[13px] font-medium">Cambio a USD</label>
            <input id="cambioUsd" inputMode="decimal" value={f.cambioUsd} onChange={(e) => campo("cambioUsd", e.target.value)} required className={`${claseControl} text-right`} />
            <p className="text-[12.5px] text-gris-500">USD por 1 unidad de la moneda (1 si es USD).</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="factorCif" className="text-[13px] font-medium">Factor CIF</label>
            <input id="factorCif" inputMode="decimal" value={f.factorCif} onChange={(e) => campo("factorCif", e.target.value)} required className={`${claseControl} text-right`} />
            <p className="text-[12.5px] text-gris-500">Flete y seguro sobre el FOB (1,05 = 5 %).</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="factorOtros" className="text-[13px] font-medium">Factor de otros</label>
            <input id="factorOtros" inputMode="decimal" value={f.factorOtros} onChange={(e) => campo("factorOtros", e.target.value)} className={`${claseControl} text-right`} />
            <p className="text-[12.5px] text-gris-500">Se suma a la base del arancel.</p>
          </div>
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <label htmlFor="observaciones" className="text-[13px] font-medium">Observaciones <span className="font-normal text-gris-500">(opcional)</span></label>
            <input id="observaciones" value={f.observaciones} onChange={(e) => campo("observaciones", e.target.value)} maxLength={1000} className={claseControl} />
          </div>
        </div>
      </Tarjeta>

      <Tarjeta recortar={false}>
        <BuscadorProducto buscar={buscarProductosImportacion} onElegir={agregar} derecha={(p) => `arancel ${p.arancelPct} %`} />
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13.5px]">
            <thead>
              <tr className="border-y border-linea text-[12.5px] text-gris-600">
                <th className="px-4 py-3 font-medium">Producto</th><th className="px-2 py-3 text-right font-medium">Cantidad</th><th className="px-2 py-3 text-right font-medium">FOB unit. ({f.moneda || "USD"})</th><th className="px-2 py-3 text-right font-medium">Arancel %</th>
                <th className="px-2 py-3 text-right font-medium">FOB USD</th><th className="px-2 py-3 text-right font-medium">CIF USD</th><th className="px-2 py-3 text-right font-medium">Gastos USD</th><th className="px-2 py-3 text-right font-medium">Arancel USD</th>
                <th className="px-2 py-3 text-right font-medium">Total USD</th><th className="px-2 py-3 text-right font-medium">Costo unit. USD</th><th className="px-4 py-3"><span className="sr-only">Quitar</span></th>
              </tr>
            </thead>
            <tbody>
              {lineas.length === 0 ? <tr><td colSpan={11} className="px-4 py-8 text-center text-gris-500">Busca y agrega los productos de la importación.</td></tr> : lineas.map((l, i) => (
                <tr key={l.productoCodigo} className="border-b border-linea last:border-0">
                  <td className="px-4 py-2"><span className="font-semibold">{l.productoCodigo}</span> · {l.descripcion}</td>
                  <td className={cel}><input aria-label={`Cantidad de ${l.productoCodigo}`} data-linea={l.productoCodigo} data-campo="cantidad" onKeyDown={(e) => alEnter(e, () => enfocarCampo(l.productoCodigo, "fob"))} inputMode="decimal" value={l.cantidad} onChange={(e) => cambiarLinea(i, "cantidad", e.target.value)} className={`${claseControl} w-24 text-right`} /></td>
                  <td className={cel}><input aria-label={`FOB de ${l.productoCodigo}`} data-linea={l.productoCodigo} data-campo="fob" onKeyDown={(e) => alEnter(e, () => enfocarBuscador())} inputMode="decimal" value={l.fobUnitario} onChange={(e) => cambiarLinea(i, "fobUnitario", e.target.value)} className={`${claseControl} w-28 text-right`} /></td>
                  <td className={cel}><input aria-label={`Arancel de ${l.productoCodigo}`} inputMode="decimal" value={l.arancelPct} onChange={(e) => cambiarLinea(i, "arancelPct", e.target.value)} className={`${claseControl} w-20 text-right`} /></td>
                  <td className={`${cel} text-right tabular-nums`}>{fmt(liq.filas[i].fobUsd)}</td><td className={`${cel} text-right tabular-nums`}>{fmt(liq.filas[i].cifUsd)}</td>
                  <td className={`${cel} text-right tabular-nums`}>{fmt(liq.filas[i].gastoUsd)}</td><td className={`${cel} text-right tabular-nums`}>{fmt(liq.filas[i].arancelUsd)}</td>
                  <td className={`${cel} text-right font-medium tabular-nums`}>{fmt(liq.filas[i].totalUsd)}</td><td className={`${cel} text-right font-semibold tabular-nums`}>{fmt(liq.filas[i].costoUnitarioUsd, 4)}</td>
                  <td className="px-4 py-2 text-right"><button type="button" aria-label={`Quitar ${l.productoCodigo}`} onClick={() => setLineas((ls) => ls.filter((_, k) => k !== i))} className="inline-flex size-9 items-center justify-center rounded-[9px] border border-[#f3c7c7] text-error hover:bg-error-suave"><Trash2 className="size-4" aria-hidden /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>

      <Tarjeta className="p-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold">Gastos de la importación (USD)</h3>
          <button type="button" onClick={() => setGastos((g) => [...g, { descripcion: "", montoUsd: "", proveedorId: "" }])} className={clasesBoton("secundario")}><Plus className="size-4" aria-hidden />Agregar gasto</button>
        </div>
        {gastos.length === 0 ? <p className="text-sm text-gris-500">Sin gastos: flete interno, agente aduanal, almacenaje, etc. se reparten entre los productos según su valor CIF.</p> : (
          <div className="flex flex-col gap-3">
            {gastos.map((g, i) => (
              <div key={i} className="grid items-end gap-3 md:grid-cols-[1fr_10rem_16rem_auto]">
                <div className="flex flex-col gap-1.5"><label className="text-[13px] font-medium" htmlFor={`gd${i}`}>Gasto</label><input id={`gd${i}`} value={g.descripcion} onChange={(e) => cambiarGasto(i, "descripcion", e.target.value)} maxLength={120} className={claseControl} /></div>
                <div className="flex flex-col gap-1.5"><label className="text-[13px] font-medium" htmlFor={`gm${i}`}>Monto USD</label><input id={`gm${i}`} inputMode="decimal" value={g.montoUsd} onChange={(e) => cambiarGasto(i, "montoUsd", e.target.value)} className={`${claseControl} text-right`} /></div>
                <div className="flex flex-col gap-1.5"><label className="text-[13px] font-medium" htmlFor={`gp${i}`}>Proveedor <span className="font-normal text-gris-500">(opcional)</span></label>
                  <select id={`gp${i}`} value={g.proveedorId} onChange={(e) => cambiarGasto(i, "proveedorId", e.target.value)} className={`${claseControl} pr-9`}><option value="">—</option>{proveedores.map((p) => <option key={p.valor} value={p.valor}>{p.etiqueta}</option>)}</select></div>
                <button type="button" aria-label="Quitar gasto" onClick={() => setGastos((gs) => gs.filter((_, k) => k !== i))} className="inline-flex size-9 items-center justify-center rounded-[9px] border border-[#f3c7c7] text-error hover:bg-error-suave"><Trash2 className="size-4" aria-hidden /></button>
              </div>
            ))}
          </div>
        )}
        <dl className="ml-auto mt-4 flex w-full max-w-sm flex-col gap-1 text-[13.5px]">
          <div className="flex justify-between"><dt className="text-gris-600">FOB total</dt><dd className="tabular-nums">{fmt(liq.totales.fobUsd)}</dd></div>
          <div className="flex justify-between"><dt className="text-gris-600">CIF total</dt><dd className="tabular-nums">{fmt(liq.totales.cifUsd)}</dd></div>
          <div className="flex justify-between"><dt className="text-gris-600">Gastos (factor {liq.factorGasto.toLocaleString("es-VE", { maximumFractionDigits: 6 })})</dt><dd className="tabular-nums">{fmt(liq.totales.gastoUsd)}</dd></div>
          <div className="flex justify-between"><dt className="text-gris-600">Aranceles</dt><dd className="tabular-nums">{fmt(liq.totales.arancelUsd)}</dd></div>
          <div className="flex justify-between border-t border-linea pt-1 text-[15px] font-semibold"><dt>Costo total USD</dt><dd className="tabular-nums">{fmt(liq.totales.totalUsd)}</dd></div>
        </dl>
      </Tarjeta>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pendiente} className={clasesBoton("primario")}>{pendiente ? "Guardando…" : id ? "Guardar cambios" : "Crear importación"}</button>
        <Link href={id ? `/importaciones/${id}` : "/importaciones"} className="px-2 text-sm text-gris-700 hover:text-tinta">Cancelar</Link>
      </div>
    </form>
  );
}
