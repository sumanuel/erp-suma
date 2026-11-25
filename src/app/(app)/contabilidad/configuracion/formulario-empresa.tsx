"use client";

import { useState, useTransition } from "react";
import { Aviso, Tarjeta, clasesBoton, claseControl } from "@/components/ui";
import { guardarDatosEmpresa } from "../acciones";

export type DatosEmpresaForm = { rif: string; razonSocial: string; nombreComercial: string; direccion: string; telefono: string; email: string; agenteRetencion: boolean };

/** Datos de la empresa para los documentos fiscales (comprobantes de retención, libros). */
export function FormularioEmpresa({ inicial, puedeEditar }: { inicial: DatosEmpresaForm; puedeEditar: boolean }) {
  const [v, setV] = useState(inicial);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const set = <K extends keyof DatosEmpresaForm>(k: K, valor: DatosEmpresaForm[K]) => setV((x) => ({ ...x, [k]: valor }));
  const campo = (k: keyof Omit<DatosEmpresaForm, "agenteRetencion">, etiqueta: string, extra = "") => (
    <div className={`flex flex-col gap-1.5 ${extra}`}>
      <label htmlFor={`emp-${k}`} className="text-[13px] font-medium">{etiqueta}</label>
      <input id={`emp-${k}`} value={v[k]} disabled={!puedeEditar} onChange={(e) => set(k, e.target.value)} className={claseControl} />
    </div>
  );
  return (
    <form onSubmit={(e) => { e.preventDefault(); setError(null); setGuardado(false); iniciar(async () => { const r = await guardarDatosEmpresa(v); if (r.error) setError(r.error); else setGuardado(true); }); }}>
      <Tarjeta className="flex flex-col gap-4 p-6">
        <h3 className="text-base font-semibold">Datos de la empresa</h3>
        <p className="text-[13px] text-gris-500">Salen en el encabezado de los comprobantes de retención y en los documentos fiscales.</p>
        {error ? <Aviso tono="error">{error}</Aviso> : null}
        {guardado ? <Aviso tono="exito">Datos guardados.</Aviso> : null}
        <div className="grid gap-4 md:grid-cols-2">
          {campo("rif", "RIF")}
          {campo("razonSocial", "Razón social")}
          {campo("nombreComercial", "Nombre comercial")}
          {campo("telefono", "Teléfono")}
          {campo("direccion", "Dirección fiscal", "md:col-span-2")}
          {campo("email", "Correo", "md:col-span-2")}
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.agenteRetencion} disabled={!puedeEditar} onChange={(e) => set("agenteRetencion", e.target.checked)} className="size-4 accent-marca-fuerte" /> Somos agente de retención (contribuyente especial)</label>
        {puedeEditar ? <div><button data-guardar type="submit" disabled={pendiente} className={clasesBoton("primario")}>{pendiente ? "Guardando…" : "Guardar datos de la empresa"}</button></div> : null}
      </Tarjeta>
    </form>
  );
}
