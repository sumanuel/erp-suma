"use client";

import { useState, type KeyboardEvent } from "react";
import { Tecla } from "@/components/atajos";
import { SelectorBuscable } from "@/components/selector-buscable";
import { claseControl } from "@/components/ui";
import { descuentoGlobal } from "@/lib/pedidos/calculos";

// Condiciones de una orden de compra: condición de pago, transporte, centro de costo, referencia del proveedor, moneda con su valor de cambio y tres
// descuentos del documento. Al elegir el proveedor se proponen los suyos (se pueden cambiar).

export type InfoProveedor = { condicionPagoId: string; descuentos: [string, string, string]; divisa: "USD" | "VES" };
export type OpcionCompra = { valor: string; etiqueta: string };
export type DatosCompraForm = { proveedores: Record<string, InfoProveedor>; condiciones: OpcionCompra[]; transportes: OpcionCompra[]; centros: OpcionCompra[]; aranceles: OpcionCompra[]; tasa: number | null };
export type CondicionesCompraInicial = { condicionPagoId: string; transporteId: string; centroCostoId: string; referencia: string; moneda: "USD" | "VES"; valorCambio: string; descuentos: [string, string, string] };
export const CONDICIONES_COMPRA_VACIAS: CondicionesCompraInicial = { condicionPagoId: "", transporteId: "", centroCostoId: "", referencia: "", moneda: "USD", valorCambio: "", descuentos: ["0", "0", "0"] };

const num = (s: string) => {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

export function useCondicionesCompra(inicial: CondicionesCompraInicial | undefined, datos: DatosCompraForm) {
  const ini = inicial ?? CONDICIONES_COMPRA_VACIAS;
  const [condicionPagoId, setCondicionPagoId] = useState(ini.condicionPagoId);
  const [transporteId, setTransporteId] = useState(ini.transporteId);
  const [centroCostoId, setCentroCostoId] = useState(ini.centroCostoId);
  const [referencia, setReferencia] = useState(ini.referencia);
  const [moneda, setMoneda] = useState<"USD" | "VES">(ini.moneda);
  const [valorCambio, setValorCambio] = useState(ini.valorCambio || (datos.tasa ? String(datos.tasa) : ""));
  const [descuentos, setDescuentos] = useState<[string, string, string]>(ini.descuentos);

  /** Al elegir otro proveedor se proponen su condición de pago, sus descuentos y su moneda. */
  function elegirProveedor(id: string) {
    const p = datos.proveedores[id];
    if (!p) return;
    setCondicionPagoId(p.condicionPagoId);
    setDescuentos(p.descuentos);
    setMoneda(p.divisa);
  }
  return {
    condicionPagoId, setCondicionPagoId, transporteId, setTransporteId, centroCostoId, setCentroCostoId, referencia, setReferencia, moneda, setMoneda, valorCambio, setValorCambio, descuentos, setDescuentos,
    /// Descuento combinado del documento (%), para la vista previa.
    global: descuentoGlobal(descuentos.map(num)),
    /// Valor de cambio efectivo (solo si la orden es en bolívares).
    cambio: moneda === "VES" ? num(valorCambio) : 0,
    elegirProveedor,
    encabezado: () => ({
      condicionPagoId: condicionPagoId || null, transporteId: transporteId || null, centroCostoId: centroCostoId || null, referencia: referencia.trim() || null, moneda,
      valorCambio: moneda === "VES" ? num(valorCambio) : null, descuentos: descuentos.map(num) as [number, number, number],
    }),
  };
}
export type CondicionesCompra = ReturnType<typeof useCondicionesCompra>;

/** Orden de los datos de arriba al avanzar con Enter; el último paso es el buscador de productos. */
const ORDEN = ["proveedorId", "condicionPagoId", "moneda", "valorCambio", "descuentoDoc1", "buscar-producto"];

export function avanzarCompra(id: string) {
  requestAnimationFrame(() => {
    for (const siguiente of ORDEN.slice(ORDEN.indexOf(id) + 1)) {
      const el = document.getElementById(siguiente);
      if (el) {
        el.focus();
        if (el instanceof HTMLInputElement) el.select();
        return;
      }
    }
  });
}
/** Para el formulario: Enter nunca guarda la orden desde un campo; en los datos de arriba pasa al siguiente. */
export function enterEnOrden(e: KeyboardEvent<HTMLFormElement>) {
  const t = e.target as HTMLElement;
  if (e.key !== "Enter" || e.defaultPrevented || !(t instanceof HTMLInputElement || t instanceof HTMLSelectElement)) return;
  e.preventDefault();
  if (ORDEN.includes(t.id)) avanzarCompra(t.id);
}

const campo = "flex flex-col gap-1.5";
const etiqueta = "text-[13px] font-medium";
const opcional = <span className="font-normal text-gris-500"> (opcional)</span>;

const descuento = (cond: CondicionesCompra, i: 0 | 1 | 2) => (
  <div key={i} className={campo}>
    <label htmlFor={`descuentoDoc${i + 1}`} className={etiqueta}>Descuento del documento {i + 1} (%)</label>
    <input id={`descuentoDoc${i + 1}`} inputMode="decimal" value={cond.descuentos[i]} onChange={(e) => cond.setDescuentos((d) => d.map((x, k) => (k === i ? e.target.value : x)) as [string, string, string])} className={claseControl} />
  </div>
);

/** Datos básicos de la orden (celdas de la grilla del encabezado): condición de pago, moneda con su cambio y el primer descuento. */
export function CamposBasicosCompra({ cond, datos }: { cond: CondicionesCompra; datos: DatosCompraForm }) {
  return (
    <>
      <div className={campo}>
        <label htmlFor="condicionPagoId" className={etiqueta}>Condición de pago <Tecla>F3</Tecla></label>
        <SelectorBuscable id="condicionPagoId" valor={cond.condicionPagoId} vacio={null} opciones={[{ valor: "", etiqueta: "Sin condición" }, ...datos.condiciones]} placeholder="Buscar condición…" onCambio={cond.setCondicionPagoId} onElegido={() => avanzarCompra("condicionPagoId")} />
      </div>
      <div className={campo}>
        <label htmlFor="moneda" className={etiqueta}>Moneda de la orden <Tecla>F8</Tecla></label>
        <select id="moneda" value={cond.moneda} onChange={(e) => cond.setMoneda(e.target.value as "USD" | "VES")} className={`${claseControl} pr-9`}>
          <option value="USD">Dólares (USD)</option><option value="VES">Bolívares (Bs.)</option>
        </select>
      </div>
      {cond.moneda === "VES" ? (
        <div className={campo}>
          <label htmlFor="valorCambio" className={etiqueta}>Valor de cambio (Bs. por USD)</label>
          <input id="valorCambio" inputMode="decimal" value={cond.valorCambio} onChange={(e) => cond.setValorCambio(e.target.value)} required className={claseControl} />
        </div>
      ) : null}
      {descuento(cond, 0)}
    </>
  );
}

/** Lo lleno dentro de «Más datos», para anunciarlo en el botón. */
export function resumenMasDatosCompra(cond: CondicionesCompra, extra: string[] = []) {
  const r = [...extra];
  const mas = cond.descuentos.slice(1).filter((x) => num(x) !== 0).length;
  if (mas) r.push(`${mas} descuento${mas > 1 ? "s" : ""} adicional${mas > 1 ? "es" : ""}`);
  if (cond.transporteId) r.push("transporte");
  if (cond.centroCostoId) r.push("centro de costo");
  if (cond.referencia.trim()) r.push("referencia");
  return r;
}

export function CamposMasCompra({ cond, datos }: { cond: CondicionesCompra; datos: DatosCompraForm }) {
  return (
    <>
      <div className={campo}>
        <label htmlFor="transporteId" className={etiqueta}>Transporte{opcional}</label>
        <select id="transporteId" value={cond.transporteId} onChange={(e) => cond.setTransporteId(e.target.value)} className={`${claseControl} pr-9`}>
          <option value="">Sin transporte</option>{datos.transportes.map((c) => <option key={c.valor} value={c.valor}>{c.etiqueta}</option>)}
        </select>
      </div>
      <div className={campo}>
        <label htmlFor="centroCostoId" className={etiqueta}>Centro de costo{opcional}</label>
        <select id="centroCostoId" value={cond.centroCostoId} onChange={(e) => cond.setCentroCostoId(e.target.value)} className={`${claseControl} pr-9`}>
          <option value="">Sin centro de costo</option>{datos.centros.map((c) => <option key={c.valor} value={c.valor}>{c.etiqueta}</option>)}
        </select>
      </div>
      <div className={`${campo} xl:col-span-2`}>
        <label htmlFor="referencia" className={etiqueta}>Referencia del proveedor{opcional}</label>
        <input id="referencia" value={cond.referencia} onChange={(e) => cond.setReferencia(e.target.value)} maxLength={60} placeholder="Cotización, proforma, pedido…" className={claseControl} />
      </div>
      {descuento(cond, 1)}
      {descuento(cond, 2)}
    </>
  );
}
