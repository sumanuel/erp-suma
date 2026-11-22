"use client";

import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Aviso, Tarjeta, clasesBoton, claseControl } from "@/components/ui";
import { aCentavos } from "@/lib/contabilidad/tipos";
import { registrarAsientoManual } from "../../acciones";

type Linea = { cuentaId: string; descripcion: string; debe: string; haber: string; auxiliarId: string; referencia: string; documento: string };
const vacia = (): Linea => ({ cuentaId: "", descripcion: "", debe: "", haber: "", auxiliarId: "", referencia: "", documento: "" });
const num = (s: string) => {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const fmt = (c: number) => (c / 100).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Asiento manual en bolívares. Muestra en vivo cuánto suma el debe y el haber; el servidor valida igual. */
export function FormularioAsiento({ hoy, cuentas, auxiliares }: { hoy: string; cuentas: { valor: string; etiqueta: string }[]; auxiliares: { valor: string; cuentaId: string; etiqueta: string }[] }) {
  const [apertura, setApertura] = useState(false);
  const [fecha, setFecha] = useState(hoy);
  const [descripcion, setDescripcion] = useState("");
  const [referencia, setReferencia] = useState("");
  const [lineas, setLineas] = useState<Linea[]>([vacia(), vacia()]);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const set = (i: number, campo: keyof Linea, v: string) => setLineas((ls) => ls.map((l, k) => (k === i ? { ...l, [campo]: v, ...(campo === "cuentaId" ? { auxiliarId: "" } : {}) } : l)));
  const debe = lineas.reduce((s, l) => s + (aCentavos(num(l.debe)) ?? 0), 0);
  const haber = lineas.reduce((s, l) => s + (aCentavos(num(l.haber)) ?? 0), 0);
  const cuadra = debe === haber && debe > 0;

  function guardar() {
    setError(null);
    iniciar(async () => {
      const r = await registrarAsientoManual({ fecha, descripcion, referencia, apertura, lineas: lineas.map((l) => ({ cuentaId: l.cuentaId, descripcion: l.descripcion, debe: num(l.debe), haber: num(l.haber), auxiliarId: l.auxiliarId, referencia: l.referencia, documento: l.documento })) });
      if (r?.error) setError(r.error);
    });
  }
  return (
    <form onSubmit={(e) => { e.preventDefault(); guardar(); }} className="flex flex-col gap-6">
      {error ? <Aviso tono="error">{error}</Aviso> : null}
      <Tarjeta className="p-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="fecha" className="text-[13px] font-medium">Fecha</label>
            <input id="fecha" type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} required className={claseControl} />
          </div>
          <div className="flex flex-col gap-1.5 xl:col-span-2">
            <label htmlFor="descripcion" className="text-[13px] font-medium">Descripción</label>
            <input id="descripcion" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} required maxLength={300} className={claseControl} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="referencia" className="text-[13px] font-medium">Referencia</label>
            <input id="referencia" value={referencia} onChange={(e) => setReferencia(e.target.value)} maxLength={60} className={claseControl} />
          </div>
          <label className="flex items-start gap-2.5 pt-1 text-sm md:col-span-2 xl:col-span-4">
            <input type="checkbox" checked={apertura} onChange={(e) => setApertura(e.target.checked)} className="mt-0.5 size-4 accent-marca-fuerte" />
            <span><span className="font-medium">Es el asiento de apertura</span> <span className="text-gris-500">— los saldos iniciales del ejercicio (activo, pasivo y patrimonio); queda marcado como APERTURA en el libro.</span></span>
          </label>
        </div>
      </Tarjeta>
      <Tarjeta>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-linea text-[12.5px] text-gris-600">
                <th className="px-4 py-3 font-medium">Cuenta</th><th className="px-2 py-3 font-medium">Auxiliar</th><th className="px-2 py-3 font-medium">Detalle</th><th className="px-2 py-3 font-medium">Referencia</th><th className="px-2 py-3 font-medium">Documento</th><th className="px-2 py-3 text-right font-medium">Debe Bs.</th><th className="px-2 py-3 text-right font-medium">Haber Bs.</th><th className="px-4 py-3"><span className="sr-only">Quitar</span></th>
              </tr>
            </thead>
            <tbody>
              {lineas.map((l, i) => (
                <tr key={i} className="border-b border-linea last:border-0">
                  <td className="px-4 py-2">
                    <select aria-label={`Cuenta de la línea ${i + 1}`} value={l.cuentaId} onChange={(e) => set(i, "cuentaId", e.target.value)} className={`${claseControl} min-w-64 pr-9`}>
                      <option value="">Elegir…</option>
                      {cuentas.map((c) => <option key={c.valor} value={c.valor}>{c.etiqueta}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <select aria-label={`Auxiliar de la línea ${i + 1}`} value={l.auxiliarId} onChange={(e) => set(i, "auxiliarId", e.target.value)} disabled={!auxiliares.some((a) => a.cuentaId === l.cuentaId)} className={`${claseControl} min-w-40 pr-9`}>
                      <option value="">Sin auxiliar</option>{auxiliares.filter((a) => a.cuentaId === l.cuentaId).map((a) => <option key={a.valor} value={a.valor}>{a.etiqueta}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-2"><input aria-label={`Detalle de la línea ${i + 1}`} value={l.descripcion} onChange={(e) => set(i, "descripcion", e.target.value)} maxLength={200} className={`${claseControl} min-w-40`} /></td>
                  <td className="px-2 py-2"><input aria-label={`Referencia de la línea ${i + 1}`} value={l.referencia} onChange={(e) => set(i, "referencia", e.target.value)} maxLength={60} className={`${claseControl} w-32`} /></td>
                  <td className="px-2 py-2"><input aria-label={`Documento de la línea ${i + 1}`} value={l.documento} onChange={(e) => set(i, "documento", e.target.value)} maxLength={40} className={`${claseControl} w-32`} /></td>
                  <td className="px-2 py-2"><input aria-label={`Debe de la línea ${i + 1}`} inputMode="decimal" value={l.debe} onChange={(e) => set(i, "debe", e.target.value)} className={`${claseControl} w-32 text-right`} /></td>
                  <td className="px-2 py-2"><input aria-label={`Haber de la línea ${i + 1}`} inputMode="decimal" value={l.haber} onChange={(e) => set(i, "haber", e.target.value)} className={`${claseControl} w-32 text-right`} /></td>
                  <td className="px-4 py-2 text-right">
                    <button type="button" disabled={lineas.length <= 2} aria-label={`Quitar línea ${i + 1}`} onClick={() => setLineas((ls) => ls.filter((_, k) => k !== i))} className="inline-flex size-9 items-center justify-center rounded-[9px] border border-[#f3c7c7] text-error hover:bg-error-suave disabled:opacity-40"><Trash2 className="size-4" aria-hidden /></button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-linea font-semibold">
                <td className="px-4 py-3" colSpan={5}>Totales</td>
                <td className="px-2 py-3 text-right tabular-nums">{fmt(debe)}</td>
                <td className="px-2 py-3 text-right tabular-nums">{fmt(haber)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <button type="button" onClick={() => setLineas((ls) => [...ls, vacia()])} className={clasesBoton("secundario")}><Plus className="size-4" aria-hidden />Agregar línea</button>
          <p className={`text-[13.5px] font-medium ${cuadra ? "text-exito" : "text-error"}`}>{cuadra ? "El asiento cuadra" : `Diferencia: ${fmt(Math.abs(debe - haber))}`}</p>
        </div>
      </Tarjeta>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pendiente || !cuadra} className={clasesBoton("primario")}>{pendiente ? "Registrando…" : "Registrar asiento"}</button>
        <Link href="/contabilidad/asientos" className="px-2 text-sm text-gris-700 hover:text-tinta">Cancelar</Link>
      </div>
    </form>
  );
}
