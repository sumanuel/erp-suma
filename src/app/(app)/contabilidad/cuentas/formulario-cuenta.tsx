"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Aviso, Tarjeta, clasesBoton, claseControl } from "@/components/ui";
import { TIPOS_CUENTA_CONTABLE } from "@/lib/contabilidad/tipos";
import { crearCuenta, editarCuenta } from "../acciones";

/** Alta (código, padre, tipo) o edición (solo nombre, clase y estado: el código y el padre no cambian). */
export function FormularioCuenta({ id, inicial, padres }: {
  id: string | null; inicial: { codigo: string; nombre: string; padreId: string; tipo: string; posteable: boolean; activo: boolean }; padres: { valor: string; etiqueta: string }[];
}) {
  const [v, setV] = useState(inicial);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const edicion = id !== null;
  function guardar() {
    setError(null);
    iniciar(async () => {
      const r = edicion ? await editarCuenta(id, v) : await crearCuenta(v);
      if (r?.error) setError(r.error);
    });
  }
  return (
    <form onSubmit={(e) => { e.preventDefault(); guardar(); }} className="flex flex-col gap-6">
      {error ? <Aviso tono="error">{error}</Aviso> : null}
      <Tarjeta className="p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="padreId" className="text-[13px] font-medium">Cuenta padre</label>
            <select id="padreId" value={v.padreId} onChange={(e) => setV({ ...v, padreId: e.target.value })} disabled={edicion} className={`${claseControl} pr-9`}>
              <option value="">Sin padre (primer nivel)</option>
              {padres.map((p) => <option key={p.valor} value={p.valor}>{p.etiqueta}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="codigo" className="text-[13px] font-medium">Código</label>
            <input id="codigo" value={v.codigo} onChange={(e) => setV({ ...v, codigo: e.target.value })} disabled={edicion} required maxLength={30} placeholder="1.1.06" className={claseControl} />
            <p className="text-[12.5px] text-gris-500">Empieza con el código del padre y un tramo más.</p>
          </div>
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <label htmlFor="nombre" className="text-[13px] font-medium">Nombre</label>
            <input id="nombre" value={v.nombre} onChange={(e) => setV({ ...v, nombre: e.target.value })} required maxLength={120} className={claseControl} />
          </div>
          {v.padreId === "" && !edicion ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="tipo" className="text-[13px] font-medium">Tipo</label>
              <select id="tipo" value={v.tipo} onChange={(e) => setV({ ...v, tipo: e.target.value })} required className={`${claseControl} pr-9`}>
                <option value="">Elegir…</option>
                {Object.entries(TIPOS_CUENTA_CONTABLE).map(([k, t]) => <option key={k} value={k}>{t.etiqueta}</option>)}
              </select>
            </div>
          ) : null}
        </div>
        <div className="mt-4 flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.posteable} onChange={(e) => setV({ ...v, posteable: e.target.checked })} className="size-4 accent-marca-fuerte" /> Recibe asientos (cuenta de movimiento)</label>
          {edicion ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.activo} onChange={(e) => setV({ ...v, activo: e.target.checked })} className="size-4 accent-marca-fuerte" /> Cuenta activa</label> : null}
        </div>
      </Tarjeta>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pendiente} className={clasesBoton("primario")}>{pendiente ? "Guardando…" : edicion ? "Guardar cambios" : "Crear cuenta"}</button>
        <Link href="/contabilidad" className="px-2 text-sm text-gris-700 hover:text-tinta">Cancelar</Link>
      </div>
    </form>
  );
}
