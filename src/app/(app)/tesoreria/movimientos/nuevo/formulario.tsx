"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Aviso, Tarjeta, clasesBoton, claseControl } from "@/components/ui";
import { registrarMovimientoCuenta } from "../../acciones";

const num = (s: string) => {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/** Ingreso o egreso manual (depósito, retiro, gasto bancario…). El concepto es obligatorio: queda en el libro. */
export function FormularioMovimiento({ cuentaId, cuenta, tipoInicial, cuentasContables, automatica }: { cuentaId: string; cuenta: string; tipoInicial: "INGRESO" | "EGRESO"; cuentasContables: { valor: string; etiqueta: string }[]; automatica: boolean }) {
  const [tipo, setTipo] = useState(tipoInicial);
  const [monto, setMonto] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [documento, setDocumento] = useState("");
  const [contrapartidaId, setContrapartidaId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function guardar() {
    setError(null);
    iniciar(async () => {
      const r = await registrarMovimientoCuenta({ cuentaId, tipo, monto: num(monto), descripcion, documento, contrapartidaId });
      if (r?.error) setError(r.error);
    });
  }
  return (
    <form onSubmit={(e) => { e.preventDefault(); guardar(); }} className="flex flex-col gap-6">
      {error ? <Aviso tono="error">{error}</Aviso> : null}
      <Tarjeta className="p-6">
        <p className="mb-4 text-sm text-gris-600">Cuenta: <span className="font-semibold text-tinta">{cuenta}</span></p>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tipo" className="text-[13px] font-medium">Tipo</label>
            <select id="tipo" value={tipo} onChange={(e) => setTipo(e.target.value as "INGRESO" | "EGRESO")} className={`${claseControl} pr-9`}>
              <option value="INGRESO">Ingreso (entra dinero)</option><option value="EGRESO">Egreso (sale dinero)</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="monto" className="text-[13px] font-medium">Monto</label>
            <input id="monto" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} required className={claseControl} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="descripcion" className="text-[13px] font-medium">Concepto</label>
            <input id="descripcion" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} required maxLength={200} className={claseControl} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="documento" className="text-[13px] font-medium">Documento o referencia</label>
            <input id="documento" value={documento} onChange={(e) => setDocumento(e.target.value)} maxLength={60} className={claseControl} />
          </div>
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <label htmlFor="contrapartidaId" className="text-[13px] font-medium">Cuenta contable de contrapartida{automatica ? "" : " — opcional (la contabilización automática está apagada)"}</label>
            <select id="contrapartidaId" value={contrapartidaId} onChange={(e) => setContrapartidaId(e.target.value)} required={automatica} className={`${claseControl} pr-9`}>
              <option value="">Sin asignar</option>{cuentasContables.map((c) => <option key={c.valor} value={c.valor}>{c.etiqueta}</option>)}
            </select>
            <p className="text-[12.5px] text-gris-500">{tipo === "INGRESO" ? "De dónde viene el dinero (ingreso, capital, préstamo…)." : "En qué se gastó (gasto, retiro del dueño, pago de deuda…)."} Se contabiliza en bolívares.</p>
          </div>
        </div>
      </Tarjeta>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pendiente} className={clasesBoton("primario")}>{pendiente ? "Registrando…" : "Registrar movimiento"}</button>
        <Link href={`/tesoreria/cuentas/${cuentaId}`} className="px-2 text-sm text-gris-700 hover:text-tinta">Cancelar</Link>
      </div>
    </form>
  );
}
