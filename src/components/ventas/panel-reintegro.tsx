"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { ListaRapida, Tecla, useAtajos } from "@/components/atajos";
import { alEnter } from "@/components/buscador-producto";
import { clasesBoton, claseControl } from "@/components/ui";
import type { CuentaCobro } from "@/components/ventas/panel-cobro";
import { FORMAS_PAGO } from "@/lib/cxc/estados";

// Cómo se le devuelve el dinero al cliente en una devolución de algo ya cobrado (original: el panel de pagos de la devolución, que saca el
// dinero de caja). Lo que no se entregue puede quedar como saldo a favor. Los montos en bolívares van a la tasa de la factura. El servidor
// vuelve a validar todo.

export type ReintegroCapturado = { formaPago: string; moneda: "USD" | "VES"; monto: number; cuentaId: string; referencia: string };

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const m = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const simbolo = (x: string) => (x === "VES" ? "Bs." : "USD");
const nombreForma = (f: string) => FORMAS_PAGO[f as keyof typeof FORMAS_PAGO] ?? f;
const MONEDAS: [string, string][] = [["VES", "Bolívares"], ["USD", "Dólares"]];

/** Cuánto falta por entregar (USD y Bs.), con la misma tolerancia de un centavo de dólar que usa el servidor. */
export function resumirReintegro(reintegros: ReintegroCapturado[], porDevolverUsd: number, tasa: number) {
  const entregadoBs = reintegros.reduce((s, r) => s + (r.moneda === "VES" ? r.monto : r.monto * tasa), 0);
  const faltaBs = porDevolverUsd * tasa - entregadoBs;
  const tolerancia = Math.max(0.01, tasa * 0.01) + 1e-6;
  return { entregadoBs: r2(entregadoBs), faltaBs: faltaBs > tolerancia ? r2(faltaBs) : 0, faltaUsd: faltaBs > tolerancia ? r2(faltaBs / tasa) : 0, seExcede: faltaBs < -tolerancia };
}

export function PanelReintegro({ reintegros, onCambio, cuentas, porDevolverUsd, tasa, monedaInicial, saldoAFavor, onSaldoAFavor, admiteSaldoAFavor, onCompleto }: {
  reintegros: ReintegroCapturado[]; onCambio: (r: ReintegroCapturado[]) => void; cuentas: CuentaCobro[]; porDevolverUsd: number; tasa: number;
  /// La moneda en que pagó el cliente.
  monedaInicial: "USD" | "VES";
  saldoAFavor: boolean; onSaldoAFavor: (v: boolean) => void; admiteSaldoAFavor: boolean; onCompleto: () => void;
}) {
  const [forma, setForma] = useState("EFECTIVO");
  const [moneda, setMoneda] = useState<"USD" | "VES">(monedaInicial);
  const [cuentaElegida, setCuenta] = useState("");
  const [referencia, setReferencia] = useState("");
  const [monto, setMonto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lista, setLista] = useState<"forma" | "moneda" | null>(null);

  // El efectivo sale de una caja; lo demás, de un banco (o de la primera cuenta de esa moneda).
  const deLaMoneda = cuentas.filter((c) => c.moneda === moneda);
  const preferidas = deLaMoneda.filter((c) => (forma === "EFECTIVO" ? c.tipo === "CAJA" : c.tipo !== "CAJA"));
  const opciones = preferidas.length ? preferidas : deLaMoneda;
  const cuentaId = opciones.some((c) => c.id === cuentaElegida) ? cuentaElegida : opciones[0]?.id ?? "";
  const r = resumirReintegro(reintegros, porDevolverUsd, tasa);
  const propuesto = r.faltaBs > 0 ? (moneda === "VES" ? r.faltaBs : r.faltaUsd) : 0;
  const texto = monto ?? (propuesto > 0 ? String(propuesto) : "");

  const ir = (id: string) => requestAnimationFrame(() => {
    const el = document.getElementById(id);
    el?.focus();
    if (el instanceof HTMLInputElement) el.select();
  });
  useAtajos({ F7: () => setLista("forma"), F8: () => setLista("moneda") });
  const seguir = (formaElegida: string) => { setLista(null); setError(null); ir(formaElegida === "EFECTIVO" ? "reintegro-monto" : "reintegro-cuenta"); };

  function agregar() {
    const valor = r2(Number(texto.replace(",", ".")));
    if (!(valor > 0)) { setError(r.faltaBs > 0 ? "Escribe el monto que se entrega." : "Ya está completo."); return; }
    if (!cuentaId) { setError(`No hay una cuenta de tesorería en ${simbolo(moneda)}.`); return; }
    const nuevo = { formaPago: forma, moneda, monto: valor, cuentaId, referencia: referencia.trim() };
    const igual = (x: ReintegroCapturado) => x.formaPago === nuevo.formaPago && x.moneda === nuevo.moneda && x.cuentaId === nuevo.cuentaId && x.referencia === nuevo.referencia;
    const previo = reintegros.find(igual);
    const nuevos = previo ? [...reintegros.filter((x) => !igual(x)), { ...nuevo, monto: r2(previo.monto + valor) }] : [...reintegros, nuevo];
    const despues = resumirReintegro(nuevos, porDevolverUsd, tasa);
    if (despues.seExcede) { setError("Es más de lo que hay que devolver."); return; }
    setError(null);
    onCambio(nuevos);
    setMonto(null);
    setReferencia("");
    if (despues.faltaBs === 0) onCompleto();
    else ir("reintegro-forma");
  }

  const campo = "flex flex-col gap-1";
  const etiqueta = "text-[12.5px] font-medium";
  return (
    <div className="flex flex-col gap-3">
      {lista === "forma" ? <ListaRapida titulo="Forma de reintegro" opciones={Object.entries(FORMAS_PAGO)} valor={forma} onElegir={(v) => { setForma(v); seguir(v); }} onCerrar={() => { setLista(null); ir("reintegro-forma"); }} /> : null}
      {lista === "moneda" ? <ListaRapida titulo="Moneda" opciones={MONEDAS} valor={moneda} onElegir={(v) => { setMoneda(v as "USD" | "VES"); setMonto(null); seguir(forma); }} onCerrar={() => { setLista(null); ir("reintegro-moneda"); }} /> : null}
      <div className="grid grid-cols-2 gap-2">
        <div className={campo}><label htmlFor="reintegro-forma" className={`${etiqueta} flex items-center justify-between`}>Forma <Tecla>F7</Tecla></label>
          <select id="reintegro-forma" value={forma} onChange={(e) => setForma(e.target.value)} onKeyDown={(e) => alEnter(e, () => ir("reintegro-moneda"))} className={`${claseControl} pr-8`}>
            {Object.entries(FORMAS_PAGO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className={campo}><label htmlFor="reintegro-moneda" className={`${etiqueta} flex items-center justify-between`}>Moneda <Tecla>F8</Tecla></label>
          <select id="reintegro-moneda" value={moneda} onChange={(e) => { setMoneda(e.target.value as "USD" | "VES"); setMonto(null); }} onKeyDown={(e) => alEnter(e, () => ir(forma === "EFECTIVO" ? "reintegro-monto" : "reintegro-cuenta"))} className={`${claseControl} pr-8`}>
            {MONEDAS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className={`${campo} col-span-2`}><label htmlFor="reintegro-cuenta" className={etiqueta}>{forma === "EFECTIVO" ? "Sale de la caja" : "Sale del banco o cuenta"}</label>
          <select id="reintegro-cuenta" value={cuentaId} onChange={(e) => setCuenta(e.target.value)} onKeyDown={(e) => alEnter(e, () => ir(forma === "EFECTIVO" ? "reintegro-monto" : "reintegro-referencia"))} className={`${claseControl} pr-8`}>
            {opciones.length === 0 ? <option value="">Sin cuentas en {simbolo(moneda)}</option> : opciones.map((c) => <option key={c.id} value={c.id}>{c.etiqueta}</option>)}
          </select>
        </div>
        <div className={campo}><label htmlFor="reintegro-referencia" className={etiqueta}>Nº de referencia</label>
          <input id="reintegro-referencia" value={referencia} onChange={(e) => setReferencia(e.target.value)} maxLength={60} disabled={forma === "EFECTIVO"} onKeyDown={(e) => alEnter(e, () => ir("reintegro-monto"))} className={claseControl} />
        </div>
        <div className={campo}><label htmlFor="reintegro-monto" className={etiqueta}>Monto {simbolo(moneda)}</label>
          <input id="reintegro-monto" inputMode="decimal" value={texto} onChange={(e) => setMonto(e.target.value)} onKeyDown={(e) => alEnter(e, agregar)} className={`${claseControl} text-right`} />
        </div>
      </div>
      <button type="button" onClick={agregar} className={`${clasesBoton("secundario")} justify-center`}><Plus className="size-4" aria-hidden />Agregar reintegro</button>
      {error || r.seExcede ? <p role="alert" className="text-[13px] font-medium text-error">{error ?? "Los reintegros superan lo que hay que devolver: quita uno."}</p> : null}
      {reintegros.length > 0 ? (
        <ul className="flex flex-col divide-y divide-linea rounded-[10px] border border-linea" aria-label="Reintegros agregados">
          {reintegros.map((x, i) => (
            <li key={i} className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-[13px]">
              <span className="min-w-0 truncate">{nombreForma(x.formaPago)}{x.referencia ? ` · ${x.referencia}` : ""}</span>
              <span className="flex shrink-0 items-center gap-2 tabular-nums">{m(x.monto)} {simbolo(x.moneda)}
                <button type="button" aria-label={`Eliminar reintegro ${i + 1}`} onClick={() => { onCambio(reintegros.filter((_y, k) => k !== i)); setMonto(null); setError(null); }} className="text-error hover:opacity-70"><Trash2 className="size-4" aria-hidden /></button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <dl className="flex flex-col gap-1 text-[13.5px]">
        <div className="flex justify-between"><dt className="text-gris-600">Entregado Bs.</dt><dd className="tabular-nums">{m(r.entregadoBs)}</dd></div>
        <div className="flex justify-between font-semibold"><dt>{saldoAFavor ? "Queda a favor" : "Falta"} USD</dt><dd className={`tabular-nums ${r.faltaUsd > 0 && !saldoAFavor ? "text-error" : "text-exito"}`}>{m(r.faltaUsd)}</dd></div>
        {r.faltaBs > 0 && !saldoAFavor ? <div className="flex justify-between text-gris-600"><dt>Falta Bs.</dt><dd className="tabular-nums">{m(r.faltaBs)}</dd></div> : null}
      </dl>
      {admiteSaldoAFavor ? (
        <label className="flex items-start gap-2 text-[13px]"><input id="saldo-a-favor" type="checkbox" checked={saldoAFavor} onChange={(e) => onSaldoAFavor(e.target.checked)} className="mt-0.5 size-4 accent-marca-fuerte" />Dejar lo que no se entregue como saldo a favor del cliente (se aplica a otra factura)</label>
      ) : <p className="text-[12.5px] text-gris-500">A «Consumidor final» no se le puede dejar saldo a favor: entrega el dinero completo.</p>}
    </div>
  );
}
