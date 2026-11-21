"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Aviso, Tarjeta, clasesBoton, claseControl } from "@/components/ui";
import { crearCuentaTesoreria, editarCuentaTesoreria } from "../acciones";

export type InicialCuenta = { cuentaContableId: string; contrapartidaId: string; codigo: string; nombre: string; tipo: string; moneda: string; banco: string; numeroCuenta: string; saldoInicial: string; permiteSobregiro: boolean; activo: boolean };

const num = (s: string) => {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/** Alta (con moneda, tipo y saldo inicial) o edición (solo datos descriptivos: la moneda y el saldo no se editan). */
export function FormularioCuenta({ id, inicial, cuentasContables, automatica }: { id: string | null; inicial: InicialCuenta; cuentasContables: { valor: string; etiqueta: string }[]; automatica: boolean }) {
  const [v, setV] = useState(inicial);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const edicion = id !== null;
  const set = <K extends keyof InicialCuenta>(k: K, valor: InicialCuenta[K]) => setV((x) => ({ ...x, [k]: valor }));

  function guardar() {
    setError(null);
    iniciar(async () => {
      const datos = { ...v, saldoInicial: num(v.saldoInicial) };
      const r = edicion ? await editarCuentaTesoreria(id, datos) : await crearCuentaTesoreria(datos);
      if (r?.error) setError(r.error);
    });
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); guardar(); }} className="flex flex-col gap-6">
      {error ? <Aviso tono="error">{error}</Aviso> : null}
      <Tarjeta className="p-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="codigo" className="text-[13px] font-medium">Código</label>
            <input id="codigo" value={v.codigo} onChange={(e) => set("codigo", e.target.value.toUpperCase())} disabled={edicion} required maxLength={20} className={claseControl} />
          </div>
          <div className="flex flex-col gap-1.5 xl:col-span-2">
            <label htmlFor="nombre" className="text-[13px] font-medium">Nombre</label>
            <input id="nombre" value={v.nombre} onChange={(e) => set("nombre", e.target.value)} required maxLength={100} className={claseControl} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tipo" className="text-[13px] font-medium">Tipo</label>
            <select id="tipo" value={v.tipo} onChange={(e) => set("tipo", e.target.value)} disabled={edicion} className={`${claseControl} pr-9`}>
              <option value="CAJA">Caja</option><option value="BANCO">Banco</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="moneda" className="text-[13px] font-medium">Moneda</label>
            <select id="moneda" value={v.moneda} onChange={(e) => set("moneda", e.target.value)} disabled={edicion} className={`${claseControl} pr-9`}>
              <option value="USD">Dólares (USD)</option><option value="VES">Bolívares (Bs.)</option>
            </select>
          </div>
          {edicion ? null : (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="saldoInicial" className="text-[13px] font-medium">Saldo inicial</label>
              <input id="saldoInicial" inputMode="decimal" value={v.saldoInicial} onChange={(e) => set("saldoInicial", e.target.value)} className={claseControl} />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="banco" className="text-[13px] font-medium">Banco</label>
            <input id="banco" value={v.banco} onChange={(e) => set("banco", e.target.value)} maxLength={80} className={claseControl} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="numeroCuenta" className="text-[13px] font-medium">Número de cuenta</label>
            <input id="numeroCuenta" value={v.numeroCuenta} onChange={(e) => set("numeroCuenta", e.target.value)} maxLength={40} className={claseControl} />
          </div>
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <label htmlFor="cuentaContableId" className="text-[13px] font-medium">Cuenta contable (caja o banco){automatica ? "" : " — opcional"}</label>
            <select id="cuentaContableId" value={v.cuentaContableId} onChange={(e) => set("cuentaContableId", e.target.value)} required={automatica} className={`${claseControl} pr-9`}>
              <option value="">Sin asignar</option>{cuentasContables.map((c) => <option key={c.valor} value={c.valor}>{c.etiqueta}</option>)}
            </select>
          </div>
          {edicion || num(v.saldoInicial) <= 0 ? null : (
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label htmlFor="contrapartidaId" className="text-[13px] font-medium">Contrapartida del saldo inicial (por ejemplo, Capital social){automatica ? "" : " — opcional"}</label>
              <select id="contrapartidaId" value={v.contrapartidaId} onChange={(e) => set("contrapartidaId", e.target.value)} required={automatica} className={`${claseControl} pr-9`}>
                <option value="">Sin asignar</option>{cuentasContables.map((c) => <option key={c.valor} value={c.valor}>{c.etiqueta}</option>)}
              </select>
            </div>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.permiteSobregiro} onChange={(e) => set("permiteSobregiro", e.target.checked)} className="size-4 accent-marca-fuerte" /> Permite sobregiro (saldo negativo)</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.activo} onChange={(e) => set("activo", e.target.checked)} className="size-4 accent-marca-fuerte" /> Cuenta activa</label>
        </div>
        {edicion ? <p className="mt-3 text-[12.5px] text-gris-500">La moneda y el saldo no se editan: el saldo solo cambia con movimientos.</p> : null}
      </Tarjeta>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pendiente} className={clasesBoton("primario")}>{pendiente ? "Guardando…" : edicion ? "Guardar cambios" : "Crear cuenta"}</button>
        <Link href={id ? `/tesoreria/cuentas/${id}` : "/tesoreria"} className="px-2 text-sm text-gris-700 hover:text-tinta">Cancelar</Link>
      </div>
    </form>
  );
}
