"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { clasesBoton, claseControl } from "@/components/ui";
import { alEnter } from "@/components/buscador-producto";
import { FORMAS_PAGO } from "@/lib/cxc/estados";
import { recibidoEnBs, repartirPagos } from "@/lib/ventas/reparto-pagos";

// Cobro en la misma pantalla de la factura (original: panel «Cancelar factura»): forma de pago, cuenta, número, monto; y los totales
// recibidos, lo que falta y el vuelto. Se recorre con Enter. El servidor vuelve a calcular todo.

export type CuentaCobro = { id: string; etiqueta: string; moneda: string; tipo: string };
export type PagoCapturado = { formaPago: string; moneda: "USD" | "VES"; recibido: number; cuentaId: string; referencia: string };

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const m = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const simbolo = (x: string) => (x === "VES" ? "Bs." : "USD");
const nombreForma = (f: string) => FORMAS_PAGO[f as keyof typeof FORMAS_PAGO] ?? f;

/** Lo que sugiere el efectivo entra a una caja; las demás formas, a un banco (o a la primera cuenta de esa moneda). */
const cuentasPara = (cuentas: CuentaCobro[], forma: string, moneda: string) => {
  const deLaMoneda = cuentas.filter((c) => c.moneda === moneda);
  const preferidas = deLaMoneda.filter((c) => (forma === "EFECTIVO" ? c.tipo === "CAJA" : c.tipo !== "CAJA"));
  return preferidas.length ? preferidas : deLaMoneda;
};

/** Estado del cobro frente al total: lo recibido, lo que falta y el vuelto. */
export function resumirCobro(pagos: PagoCapturado[], totalUsd: number, totalBs: number, tasa: number) {
  const recibidoBs = recibidoEnBs(pagos, tasa);
  const faltaBs = r2(Math.max(0, totalBs - recibidoBs));
  const plan = pagos.length ? repartirPagos(totalUsd, totalBs, tasa, pagos, nombreForma) : null;
  const ultimo = plan && !("error" in plan) ? plan.reparto[plan.reparto.length - 1] : null;
  const cubierto = totalUsd > 0 && !!ultimo;
  const problema = plan && "error" in plan && faltaBs <= 0.005 ? plan.error : null;
  return { recibidoBs, faltaBs, cubierto, problema, exceso: ultimo?.exceso ?? 0, monedaExceso: (ultimo?.p.moneda ?? "VES") as "USD" | "VES" };
}

export function PanelCobro({ pagos, onCambio, cuentas, totalUsd, totalBs, tasa, monedaVuelto, onMonedaVuelto, cajaVueltoId, onCajaVuelto, onCubierto }: {
  pagos: PagoCapturado[]; onCambio: (p: PagoCapturado[]) => void; cuentas: CuentaCobro[]; totalUsd: number; totalBs: number; tasa: number;
  monedaVuelto: "" | "USD" | "VES"; onMonedaVuelto: (x: "" | "USD" | "VES") => void; cajaVueltoId: string; onCajaVuelto: (id: string) => void;
  /// Se llama al agregar el pago que completa el total (para pasar a «Confirmar»).
  onCubierto: () => void;
}) {
  const [forma, setForma] = useState("EFECTIVO");
  const [moneda, setMoneda] = useState<"USD" | "VES">("VES");
  const [cuentaElegida, setCuenta] = useState("");
  const [referencia, setReferencia] = useState("");
  const [monto, setMonto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const opciones = cuentasPara(cuentas, forma, moneda);
  const cuentaId = opciones.some((c) => c.id === cuentaElegida) ? cuentaElegida : opciones[0]?.id ?? "";
  const r = resumirCobro(pagos, totalUsd, totalBs, tasa);
  // El monto propuesto es lo que falta en la moneda elegida: con Enter se acepta; si paga otra cifra, se escribe encima.
  const propuesto = r.faltaBs > 0 ? r2(moneda === "VES" ? r.faltaBs : Math.ceil((r.faltaBs / tasa) * 100 - 1e-6) / 100) : 0;
  const texto = monto ?? (propuesto > 0 ? String(propuesto) : "");
  const vueltoEn = monedaVuelto || r.monedaExceso;
  const vuelto = r.exceso > 0 ? r2(vueltoEn === r.monedaExceso ? r.exceso : r.monedaExceso === "USD" ? r.exceso * tasa : r.exceso / tasa) : 0;
  const cajasVuelto = cuentas.filter((c) => c.tipo === "CAJA" && c.moneda === vueltoEn);

  const ir = (id: string) => requestAnimationFrame(() => {
    const el = document.getElementById(id);
    el?.focus();
    if (el instanceof HTMLInputElement) el.select();
  });

  function agregar() {
    const valor = Number(texto.replace(",", "."));
    if (!(valor > 0)) { setError(r.faltaBs > 0 ? "Escribe el monto recibido." : "La factura ya está cubierta."); return; }
    if (!cuentaId) { setError(`No hay una cuenta de tesorería en ${simbolo(moneda)}.`); return; }
    if (forma === "CHEQUE" && !referencia.trim()) { setError("Escribe el número del cheque."); ir("cobro-referencia"); return; }
    const nuevos = [...pagos, { formaPago: forma, moneda, recibido: r2(valor), cuentaId, referencia: referencia.trim() }];
    const despues = resumirCobro(nuevos, totalUsd, totalBs, tasa);
    if (despues.problema) { setError(despues.problema); return; }
    setError(null);
    onCambio(nuevos);
    setMonto(null);
    setReferencia("");
    if (despues.cubierto) onCubierto();
    else ir("cobro-forma");
  }

  const campo = "flex flex-col gap-1";
  const etiqueta = "text-[12.5px] font-medium";
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <div className={campo}><label htmlFor="cobro-forma" className={etiqueta}>Modo de pago</label>
          <select id="cobro-forma" value={forma} onChange={(e) => setForma(e.target.value)} onKeyDown={(e) => alEnter(e, () => ir("cobro-moneda"))} className={`${claseControl} pr-8`}>
            {Object.entries(FORMAS_PAGO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className={campo}><label htmlFor="cobro-moneda" className={etiqueta}>Moneda</label>
          <select id="cobro-moneda" value={moneda} onChange={(e) => { setMoneda(e.target.value as "USD" | "VES"); setMonto(null); }} onKeyDown={(e) => alEnter(e, () => ir(forma === "EFECTIVO" ? "cobro-monto" : "cobro-cuenta"))} className={`${claseControl} pr-8`}>
            <option value="VES">Bolívares</option><option value="USD">Dólares</option>
          </select>
        </div>
        <div className={`${campo} col-span-2`}><label htmlFor="cobro-cuenta" className={etiqueta}>{forma === "EFECTIVO" ? "Caja" : "Banco o cuenta"}</label>
          <select id="cobro-cuenta" value={cuentaId} onChange={(e) => setCuenta(e.target.value)} onKeyDown={(e) => alEnter(e, () => ir(forma === "EFECTIVO" ? "cobro-monto" : "cobro-referencia"))} className={`${claseControl} pr-8`}>
            {opciones.length === 0 ? <option value="">Sin cuentas en {simbolo(moneda)}</option> : opciones.map((c) => <option key={c.id} value={c.id}>{c.etiqueta}</option>)}
          </select>
        </div>
        <div className={campo}><label htmlFor="cobro-referencia" className={etiqueta}>Nº {forma === "CHEQUE" ? "de cheque" : "de referencia"}</label>
          <input id="cobro-referencia" value={referencia} onChange={(e) => setReferencia(e.target.value)} maxLength={60} disabled={forma === "EFECTIVO"} onKeyDown={(e) => alEnter(e, () => ir("cobro-monto"))} className={claseControl} />
        </div>
        <div className={campo}><label htmlFor="cobro-monto" className={etiqueta}>Monto {simbolo(moneda)}</label>
          <input id="cobro-monto" inputMode="decimal" value={texto} onChange={(e) => setMonto(e.target.value)} onKeyDown={(e) => alEnter(e, agregar)} className={`${claseControl} text-right`} />
        </div>
      </div>
      <button type="button" onClick={agregar} className={`${clasesBoton("secundario")} justify-center`}><Plus className="size-4" aria-hidden />Agregar pago</button>
      {error || r.problema ? <p role="alert" className="text-[13px] font-medium text-error">{error ?? r.problema}</p> : null}
      {pagos.length > 0 ? (
        <ul className="flex flex-col divide-y divide-linea rounded-[10px] border border-linea" aria-label="Pagos agregados">
          {pagos.map((p, i) => (
            <li key={i} className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-[13px]">
              <span className="min-w-0 truncate">{nombreForma(p.formaPago)}{p.referencia ? ` · ${p.referencia}` : ""}</span>
              <span className="flex shrink-0 items-center gap-2 tabular-nums">{m(p.recibido)} {simbolo(p.moneda)}
                <button type="button" aria-label={`Eliminar pago ${i + 1}`} onClick={() => { onCambio(pagos.filter((_x, k) => k !== i)); setMonto(null); setError(null); }} className="text-error hover:opacity-70"><Trash2 className="size-4" aria-hidden /></button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <dl className="flex flex-col gap-1 text-[13.5px]">
        <div className="flex justify-between"><dt className="text-gris-600">Pagado Bs.</dt><dd className="tabular-nums">{m(r.recibidoBs)}</dd></div>
        <div className="flex justify-between font-semibold"><dt>Falta Bs.</dt><dd className={`tabular-nums ${r.faltaBs > 0.005 ? "text-error" : "text-exito"}`}>{m(r.faltaBs)}</dd></div>
        {r.faltaBs > 0.005 ? <div className="flex justify-between text-gris-600"><dt>Falta USD (aprox.)</dt><dd className="tabular-nums">{m(r.faltaBs / tasa)}</dd></div> : null}
        <div className="flex justify-between text-[16px] font-semibold"><dt>Cambio {simbolo(vueltoEn)}</dt><dd className="tabular-nums">{m(vuelto)}</dd></div>
      </dl>
      {r.exceso > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          <div className={campo}><label htmlFor="cobro-vuelto" className={etiqueta}>Vuelto en</label>
            <select id="cobro-vuelto" value={vueltoEn} onChange={(e) => onMonedaVuelto(e.target.value as "USD" | "VES")} className={`${claseControl} pr-8`}><option value="VES">Bolívares</option><option value="USD">Dólares</option></select>
          </div>
          {vueltoEn !== r.monedaExceso ? (
            <div className={campo}><label htmlFor="cobro-caja-vuelto" className={etiqueta}>De la caja</label>
              <select id="cobro-caja-vuelto" value={cajaVueltoId} onChange={(e) => onCajaVuelto(e.target.value)} className={`${claseControl} pr-8`}>
                <option value="">Elegir…</option>{cajasVuelto.map((c) => <option key={c.id} value={c.id}>{c.etiqueta}</option>)}
              </select>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
