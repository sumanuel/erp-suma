"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Aviso, clasesBoton, claseControl } from "@/components/ui";
import { SelectorBuscable, type OpcionBuscable } from "@/components/selector-buscable";
import { crearPersonalRapido, crearTerceroRapido, type ResultadoTercero } from "@/components/acciones-tercero";

// Selector con alta rápida: si lo escrito no existe, se ofrece crearlo ahí mismo con lo básico, sin salir del documento (así no se pierden
// las líneas ya cargadas). Lo demás de la ficha se completa después en su módulo. Sirve para clientes, proveedores, vendedores y cobradores.

type Comun = {
  id?: string; valor: string; opciones: OpcionBuscable[]; onCambio: (valor: string) => void; onElegido?: () => void;
  requerido?: boolean; deshabilitado?: boolean; placeholder?: string;
  /// Texto de la fila que deja el campo vacío; sin él (null) el campo no se puede vaciar.
  vacio?: string | null;
};
type CampoAlta = { id: string; etiqueta: string; max: number; requerido?: boolean };
type Config = {
  nombre: string; modulo: string; campos: CampoAlta[];
  /// Cuál campo recibe lo que el usuario había escrito en el buscador.
  desdeTexto: (texto: string) => Record<string, string>; foco: (texto: string) => string;
  crear: (v: Record<string, string>) => Promise<ResultadoTercero>;
};

const DOCUMENTO = /^[a-z]?[\d.\-\s]{5,}$/i;

const CLIENTE: Config = {
  nombre: "cliente", modulo: "Clientes",
  campos: [{ id: "documento", etiqueta: "RIF / cédula", max: 25, requerido: true }, { id: "razonSocial", etiqueta: "Razón social", max: 200, requerido: true }, { id: "telefono", etiqueta: "Teléfono (opcional)", max: 40 }, { id: "direccion", etiqueta: "Dirección (opcional)", max: 300 }],
  desdeTexto: (t): Record<string, string> => (DOCUMENTO.test(t.trim()) ? { documento: t.trim() } : { razonSocial: t.trim() }), foco: (t) => (DOCUMENTO.test(t.trim()) ? "razonSocial" : "documento"),
  crear: (v) => crearTerceroRapido("cliente", v),
};
const PROVEEDOR: Config = { ...CLIENTE, nombre: "proveedor", modulo: "Proveedores", crear: (v) => crearTerceroRapido("proveedor", v) };
const personal = (rol: "vendedor" | "cobrador"): Config => ({
  nombre: rol, modulo: "Tablas › Vendedores y cobradores",
  campos: [{ id: "codigo", etiqueta: "Código", max: 10, requerido: true }, { id: "nombre", etiqueta: "Nombre", max: 100, requerido: true }, { id: "cedula", etiqueta: "Cédula (opcional)", max: 15 }],
  desdeTexto: (t): Record<string, string> => (/^\d{1,3}$|^[a-z]{1,3}\d*$/i.test(t.trim()) && t.trim().length <= 10 && !/\s/.test(t.trim()) ? { codigo: t.trim().toUpperCase() } : { nombre: t.trim() }), foco: () => "nombre",
  crear: (v) => crearPersonalRapido(rol, v),
});

function Selector({ config, puedeCrear = true, ...resto }: Comun & { config: Config; puedeCrear?: boolean }) {
  const [extra, setExtra] = useState<OpcionBuscable[]>([]);
  const [alta, setAlta] = useState<string | null>(null);
  const { opciones, onCambio } = resto;
  const todas = [...opciones, ...extra.filter((e) => !opciones.some((o) => o.valor === e.valor))];
  return (
    <>
      <SelectorBuscable {...resto} opciones={todas} onNoEncontrado={puedeCrear ? (t) => setAlta(t) : undefined} nombreNuevo={config.nombre} />
      {alta !== null ? (
        <DialogoAlta
          config={config} textoInicial={alta} onCerrar={() => setAlta(null)}
          onCreado={(o) => { setExtra((x) => [...x, o]); onCambio(o.valor); setAlta(null); resto.onElegido?.(); }}
        />
      ) : null}
    </>
  );
}

/** Cliente o proveedor: no se puede dejar sin elegir. */
export function SelectorTercero({ tipo, vacio = null, ...p }: Comun & { tipo: "cliente" | "proveedor"; puedeCrear?: boolean }) {
  return <Selector config={tipo === "cliente" ? CLIENTE : PROVEEDOR} vacio={vacio} {...p} />;
}
/** Vendedor o cobrador: opcional, con una fila para dejarlo vacío. */
export function SelectorPersonal({ rol, vacio, ...p }: Comun & { rol: "vendedor" | "cobrador"; vacio: string; puedeCrear?: boolean }) {
  return <Selector config={personal(rol)} vacio={vacio} {...p} />;
}

function DialogoAlta({ config, textoInicial, onCerrar, onCreado }: { config: Config; textoInicial: string; onCerrar: () => void; onCreado: (o: OpcionBuscable) => void }) {
  const [valores, setValores] = useState<Record<string, string>>(() => config.desdeTexto(textoInicial));
  const [error, setError] = useState<string | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [pendiente, setPendiente] = useState(false);
  const foco = config.foco(textoInicial);

  async function guardar() {
    setError(null);
    setErrores({});
    setPendiente(true);
    const r = await config.crear(valores).catch(() => ({ error: "No se pudo crear." }) as ResultadoTercero);
    setPendiente(false);
    if (r.creado) return onCreado(r.creado);
    setError(r.error ?? "No se pudo crear.");
    setErrores(r.errores ?? {});
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
      <form
        role="dialog" aria-modal="true" aria-label={`Nuevo ${config.nombre}`} onSubmit={(e) => { e.preventDefault(); void guardar(); }}
        onKeyDown={(e) => { if (e.key === "Escape") onCerrar(); }}
        className="flex w-full max-w-lg flex-col gap-4 rounded-[14px] bg-white p-6 shadow-xl"
      >
        <div>
          <h3 className="text-lg font-semibold">Nuevo {config.nombre}</h3>
          <p className="text-[13px] text-gris-600">Registra lo básico para continuar con el documento. El resto de la ficha se completa luego en {config.modulo}.</p>
        </div>
        {error ? <Aviso tono="error">{error}</Aviso> : null}
        {config.campos.map((c) => (
          <div key={c.id} className="flex flex-col gap-1.5">
            <label htmlFor={`alta-${c.id}`} className="text-[13px] font-medium">{c.etiqueta}</label>
            <input
              id={`alta-${c.id}`} value={valores[c.id] ?? ""} onChange={(e) => setValores((v) => ({ ...v, [c.id]: e.target.value }))} maxLength={c.max} autoFocus={c.id === foco}
              className={claseControl} aria-invalid={errores[c.id] ? true : undefined}
            />
            {errores[c.id] ? <p className="text-[12.5px] text-error">{errores[c.id]}</p> : null}
          </div>
        ))}
        <div className="flex items-center gap-3">
          <button type="submit" disabled={pendiente} className={clasesBoton("primario")}>{pendiente ? "Guardando…" : `Crear ${config.nombre}`}</button>
          <button type="button" onClick={onCerrar} className="px-2 text-sm text-gris-700 hover:text-tinta">Cancelar</button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
