"use client";

import { useState } from "react";
import { Tarjeta, claseControl } from "@/components/ui";
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

export function CondicionesCompra({ cond, datos }: { cond: CondicionesCompra; datos: DatosCompraForm }) {
  const campo = "flex flex-col gap-1.5";
  const etiqueta = "text-[13px] font-medium";
  const opcional = <span className="font-normal text-gris-500"> (opcional)</span>;
  return (
    <Tarjeta className="p-6">
      <h3 className="mb-4 text-[13px] font-semibold uppercase tracking-wide text-gris-600">Condiciones de la orden</h3>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className={campo}>
          <label htmlFor="condicionPagoId" className={etiqueta}>Condición de pago{opcional}</label>
          <select id="condicionPagoId" value={cond.condicionPagoId} onChange={(e) => cond.setCondicionPagoId(e.target.value)} className={`${claseControl} pr-9`}>
            <option value="">Sin condición</option>{datos.condiciones.map((c) => <option key={c.valor} value={c.valor}>{c.etiqueta}</option>)}
          </select>
        </div>
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
        <div className={campo}>
          <label htmlFor="referencia" className={etiqueta}>Referencia del proveedor{opcional}</label>
          <input id="referencia" value={cond.referencia} onChange={(e) => cond.setReferencia(e.target.value)} maxLength={60} placeholder="Cotización, proforma, pedido…" className={claseControl} />
        </div>
        <div className={campo}>
          <label htmlFor="moneda" className={etiqueta}>Moneda de la orden</label>
          <select id="moneda" value={cond.moneda} onChange={(e) => cond.setMoneda(e.target.value as "USD" | "VES")} className={`${claseControl} pr-9`}>
            <option value="USD">Dólares (USD)</option><option value="VES">Bolívares (Bs.)</option>
          </select>
        </div>
        {cond.moneda === "VES" ? (
          <div className={campo}>
            <label htmlFor="valorCambio" className={etiqueta}>Valor de cambio (Bs. por USD)</label>
            <input id="valorCambio" inputMode="decimal" value={cond.valorCambio} onChange={(e) => cond.setValorCambio(e.target.value)} required className={claseControl} />
            <p className="text-[12.5px] text-gris-500">Los costos se escriben en bolívares y se guardan en USD con este valor.</p>
          </div>
        ) : null}
        {([0, 1, 2] as const).map((i) => (
          <div key={i} className={campo}>
            <label htmlFor={`descuentoDoc${i + 1}`} className={etiqueta}>Descuento del documento {i + 1} (%)</label>
            <input id={`descuentoDoc${i + 1}`} inputMode="decimal" value={cond.descuentos[i]} onChange={(e) => cond.setDescuentos((d) => d.map((x, k) => (k === i ? e.target.value : x)) as [string, string, string])} className={claseControl} />
          </div>
        ))}
        <div className={`${campo} justify-end`}>
          <p className="text-[12.5px] text-gris-500">Descuento combinado del documento: <span className="font-semibold text-tinta">{cond.global.toLocaleString("es-VE", { maximumFractionDigits: 4 })} %</span>. Se suma a los tres de cada línea.</p>
        </div>
      </div>
    </Tarjeta>
  );
}
