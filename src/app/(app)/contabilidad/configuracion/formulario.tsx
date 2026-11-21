"use client";

import { useState, useTransition } from "react";
import { Aviso, Tarjeta, clasesBoton, claseControl } from "@/components/ui";
import { CONCEPTOS, LISTA_CONCEPTOS } from "@/lib/contabilidad/conceptos";
import { guardarConfiguracionContable } from "../acciones";

/** Configuración contable: interruptor de contabilización automática, cuenta por concepto y cuenta contable de cada caja/banco. */
export function FormularioConfiguracion({ puedeEditar, automatica: auto0, conceptos: conceptos0, cuentas, tesoreria }: {
  puedeEditar: boolean; automatica: boolean; conceptos: Record<string, string>; cuentas: { valor: string; etiqueta: string }[];
  tesoreria: { id: string; etiqueta: string; cuentaContableId: string }[];
}) {
  const [automatica, setAutomatica] = useState(auto0);
  const [conceptos, setConceptos] = useState<Record<string, string>>(conceptos0);
  const [tes, setTes] = useState<Record<string, string>>(Object.fromEntries(tesoreria.map((t) => [t.id, t.cuentaContableId])));
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [pendiente, iniciar] = useTransition();

  function guardar() {
    setError(null);
    setGuardado(false);
    iniciar(async () => {
      const r = await guardarConfiguracionContable({ automatica, conceptos, tesoreria: tes });
      if (r.error) setError(r.error);
      else setGuardado(true);
    });
  }
  const selector = (valor: string, onChange: (v: string) => void, etiqueta: string) => (
    <select aria-label={etiqueta} value={valor} disabled={!puedeEditar} onChange={(e) => onChange(e.target.value)} className={`${claseControl} pr-9`}>
      <option value="">Sin asignar</option>
      {cuentas.map((c) => <option key={c.valor} value={c.valor}>{c.etiqueta}</option>)}
    </select>
  );
  return (
    <form onSubmit={(e) => { e.preventDefault(); guardar(); }} className="flex flex-col gap-6">
      {error ? <Aviso tono="error">{error}</Aviso> : null}
      {guardado ? <Aviso tono="exito">Configuración guardada.</Aviso> : null}
      <Tarjeta className="p-6">
        <label className="flex items-start gap-3">
          <input type="checkbox" checked={automatica} disabled={!puedeEditar} onChange={(e) => setAutomatica(e.target.checked)} className="mt-1 size-4 accent-marca-fuerte" />
          <span>
            <span className="block text-[15px] font-semibold">Contabilizar automáticamente</span>
            <span className="block text-[13px] text-gris-600">Cada factura de venta, cobro, factura de proveedor y pago genera su asiento en bolívares, dentro de la misma operación: si el asiento no se puede hacer (cuenta sin asignar, período cerrado, sin tasa), la operación tampoco se hace. Las anulaciones generan el asiento inverso. Solo se contabiliza lo que ocurra desde que lo actives.</span>
          </span>
        </label>
      </Tarjeta>
      <Tarjeta>
        <h3 className="px-4 pt-4 text-base font-semibold">Cuentas por concepto</h3>
        <table className="mt-2 w-full text-left text-[13.5px]">
          <thead><tr className="border-y border-linea text-[12.5px] text-gris-600"><th className="px-4 py-3 font-medium">Concepto</th><th className="px-3 py-3 font-medium">Cuenta contable</th></tr></thead>
          <tbody>
            {LISTA_CONCEPTOS.map((k) => (
              <tr key={k} className="border-b border-linea last:border-0">
                <td className="px-4 py-3"><span className="font-semibold">{CONCEPTOS[k].etiqueta}</span><span className="block text-[12.5px] text-gris-500">{CONCEPTOS[k].uso}</span></td>
                <td className="px-3 py-3">{selector(conceptos[k] ?? "", (v) => setConceptos((c) => ({ ...c, [k]: v })), `Cuenta de ${CONCEPTOS[k].etiqueta}`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Tarjeta>
      <Tarjeta>
        <h3 className="px-4 pt-4 text-base font-semibold">Cajas y bancos de Tesorería</h3>
        <p className="px-4 text-[13px] text-gris-500">Cada caja o banco se contabiliza en una cuenta contable de movimiento (por ejemplo, 1.1.01 Caja y bancos, o una subcuenta por banco).</p>
        <table className="mt-2 w-full text-left text-[13.5px]">
          <thead><tr className="border-y border-linea text-[12.5px] text-gris-600"><th className="px-4 py-3 font-medium">Cuenta de tesorería</th><th className="px-3 py-3 font-medium">Cuenta contable</th></tr></thead>
          <tbody>
            {tesoreria.length === 0 ? <tr><td colSpan={2} className="px-4 py-8 text-center text-gris-500">Todavía no hay cajas ni bancos en Tesorería.</td></tr> : tesoreria.map((t) => (
              <tr key={t.id} className="border-b border-linea last:border-0">
                <td className="px-4 py-3 font-semibold">{t.etiqueta}</td>
                <td className="px-3 py-3">{selector(tes[t.id] ?? "", (v) => setTes((x) => ({ ...x, [t.id]: v })), `Cuenta contable de ${t.etiqueta}`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Tarjeta>
      {puedeEditar ? <div><button type="submit" disabled={pendiente} className={clasesBoton("primario")}>{pendiente ? "Guardando…" : "Guardar configuración"}</button></div> : null}
    </form>
  );
}
