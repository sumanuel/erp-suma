"use client";

import { Plus, Trash2 } from "lucide-react";
import { AccionesDocumento } from "@/components/acciones-documento";
import { useState, useTransition, type KeyboardEvent } from "react";
import { Aviso, Tarjeta, clasesBoton, claseControl } from "@/components/ui";
import { alEnter } from "@/components/buscador-producto";
import { CapturaImportacion, TablaImportacion, fmtImp as fmt, numImp as num, type LineaImp } from "@/components/importaciones/captura-importacion";
import { MasDatos } from "@/components/ventas/condiciones-venta";
import { SelectorTercero } from "@/components/selector-tercero";
import { liquidarImportacion } from "@/lib/importaciones/calculos";
import { buscarProductosImportacion, guardarImportacionForm } from "./acciones";

export type GastoImp = { descripcion: string; montoUsd: string; proveedorId: string };
export type InicialImportacion = {
  proveedorId: string; documento: string; fecha: string; almacenId: string; moneda: string; cambioUsd: string; factorCif: string; factorOtros: string; observaciones: string;
  lineas: LineaImp[]; gastos: GastoImp[];
};
type Opc = { valor: string; etiqueta: string };

/** Orden de los datos de arriba al avanzar con Enter; el último paso es el buscador de productos. La fecha ya viene puesta y se salta. */
const ORDEN = ["proveedorId", "documento", "almacenId", "moneda", "cambioUsd", "factorCif", "buscar-producto"];

const enfocar = (id: string) => requestAnimationFrame(() => {
  const el = document.getElementById(id);
  el?.focus();
  if (el instanceof HTMLInputElement) el.select();
});
function avanzar(id: string) {
  const siguiente = ORDEN[ORDEN.indexOf(id) + 1];
  if (siguiente) enfocar(siguiente);
}
/** Enter nunca guarda la importación desde un campo; en los datos de arriba pasa al siguiente. */
function enterEnImportacion(e: KeyboardEvent<HTMLFormElement>) {
  const t = e.target as HTMLElement;
  if (e.key !== "Enter" || e.defaultPrevented || !(t instanceof HTMLInputElement || t instanceof HTMLSelectElement)) return;
  e.preventDefault();
  if (ORDEN.includes(t.id)) avanzar(t.id);
}

/** Expediente de importación: datos del documento, productos con precio FOB, gastos y la liquidación del costo en vivo (la misma fórmula que aplica el servidor). */
export function FormularioImportacion({ id, inicial, proveedores, almacenes }: { id: string | null; inicial: InicialImportacion; proveedores: Opc[]; almacenes: Opc[] }) {
  const [f, setF] = useState(inicial);
  const [lineas, setLineas] = useState<LineaImp[]>(inicial.lineas);
  const [gastos, setGastos] = useState<GastoImp[]>(inicial.gastos);
  const [error, setError] = useState<string | null>(null);
  // En una importación que ya usa algo de «Más datos» el panel empieza abierto.
  const [masAbierto, setMasAbierto] = useState(num(inicial.factorOtros) !== 0 || inicial.observaciones.trim() !== "");
  const [pendiente, iniciar] = useTransition();
  const campo = (k: keyof Omit<InicialImportacion, "lineas" | "gastos">, v: string) => setF((x) => ({ ...x, [k]: v }));


  const cambiarGasto = (i: number, k: keyof GastoImp, v: string) => setGastos((gs) => gs.map((g, j) => (j === i ? { ...g, [k]: v } : g)));

  const resumenMas = [...(num(f.factorOtros) !== 0 ? ["factor de otros"] : []), ...(f.observaciones.trim() ? ["observaciones"] : [])];
  const agregarGasto = () => { enfocar(`gd${gastos.length}`); setGastos((g) => [...g, { descripcion: "", montoUsd: "", proveedorId: "" }]); };
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

  return (
    <form onSubmit={(e) => { e.preventDefault(); guardar(); }} onKeyDown={enterEnImportacion} className="flex flex-col gap-6">
      {error ? <Aviso tono="error">{error}</Aviso> : null}
      <Tarjeta className="p-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="flex flex-col gap-1.5 xl:col-span-2">
            <label htmlFor="proveedorId" className="text-[13px] font-medium">Proveedor del exterior</label>
            <SelectorTercero tipo="proveedor" id="proveedorId" valor={f.proveedorId} opciones={proveedores} requerido placeholder="Buscar proveedor por nombre o RIF…" onCambio={(v) => { campo("proveedorId", v); }} onElegido={() => avanzar("proveedorId")} />
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
        </div>
        <div className="mt-4">
          <MasDatos abierto={masAbierto} onAlternar={() => setMasAbierto((v) => !v)} resumen={resumenMas}>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="factorOtros" className="text-[13px] font-medium">Factor de otros</label>
              <input id="factorOtros" inputMode="decimal" value={f.factorOtros} onChange={(e) => campo("factorOtros", e.target.value)} className={`${claseControl} text-right`} />
              <p className="text-[12.5px] text-gris-500">Se suma a la base del arancel.</p>
            </div>
            <div className="flex flex-col gap-1.5 md:col-span-2 xl:col-span-3">
              <label htmlFor="observaciones" className="text-[13px] font-medium">Observaciones <span className="font-normal text-gris-500">(opcional)</span></label>
              <input id="observaciones" value={f.observaciones} onChange={(e) => campo("observaciones", e.target.value)} maxLength={1000} className={claseControl} />
            </div>
          </MasDatos>
        </div>
      </Tarjeta>

      <Tarjeta recortar={false}>
        <CapturaImportacion buscar={buscarProductosImportacion} lineas={lineas} onCambio={setLineas} cambioUsd={num(f.cambioUsd)} moneda={f.moneda} onEnterVacio={() => enfocar("guardar-importacion")} />
        <TablaImportacion lineas={lineas} filas={liq.filas} moneda={f.moneda} onQuitar={(i) => setLineas((ls) => ls.filter((_, k) => k !== i))} />
      </Tarjeta>

      <Tarjeta className="p-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold">Gastos de la importación (USD)</h3>
          <button id="agregar-gasto" type="button" onClick={agregarGasto} className={clasesBoton("secundario")}><Plus className="size-4" aria-hidden />Agregar gasto</button>
        </div>
        {gastos.length === 0 ? <p className="text-sm text-gris-500">Sin gastos: flete interno, agente aduanal, almacenaje, etc. se reparten entre los productos según su valor CIF.</p> : (
          <div className="flex flex-col gap-3">
            {gastos.map((g, i) => (
              <div key={i} className="grid items-end gap-3 md:grid-cols-[1fr_10rem_16rem_auto]">
                <div className="flex flex-col gap-1.5"><label className="text-[13px] font-medium" htmlFor={`gd${i}`}>Gasto</label><input id={`gd${i}`} onKeyDown={(e) => alEnter(e, () => enfocar(`gm${i}`))} value={g.descripcion} onChange={(e) => cambiarGasto(i, "descripcion", e.target.value)} maxLength={120} className={claseControl} /></div>
                <div className="flex flex-col gap-1.5"><label className="text-[13px] font-medium" htmlFor={`gm${i}`}>Monto USD</label><input id={`gm${i}`} onKeyDown={(e) => alEnter(e, () => enfocar("agregar-gasto"))} inputMode="decimal" value={g.montoUsd} onChange={(e) => cambiarGasto(i, "montoUsd", e.target.value)} className={`${claseControl} text-right`} /></div>
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

      <AccionesDocumento idGuardar="guardar-importacion" texto={id ? "Guardar cambios" : "Crear importación"} pendiente={pendiente} volver={id ? `/importaciones/${id}` : "/importaciones"} huella={JSON.stringify([f, lineas, gastos])} />
    </form>
  );
}
