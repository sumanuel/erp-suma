"use client";

import { ChevronDown } from "lucide-react";
import { useState, type KeyboardEvent, type ReactNode } from "react";
import { Tecla } from "@/components/atajos";
import { SelectorPersonal } from "@/components/selector-tercero";
import { claseControl } from "@/components/ui";
import { descuentoGlobal } from "@/lib/pedidos/calculos";

// Condiciones comerciales de un pedido, cotización o factura: vendedor, condición de pago, transporte, dirección de entrega y tres descuentos
// globales. Al elegir el cliente se proponen los suyos (se pueden cambiar). Las usan los tres formularios de venta.

export type InfoCliente = {
  lista: string;
  vendedorId: string;
  condicionPagoId: string;
  /// Días de la condición de pago del cliente (para proponer los días de crédito de la factura).
  diasCondicion: number;
  transporteId: string;
  direccionEnvio: string;
  descuentos: [string, string, string];
};
export type OpcionVenta = { valor: string; etiqueta: string };
export type DatosVentaForm = {
  clientes: Record<string, InfoCliente>; vendedores: OpcionVenta[];
  /// Cada condición trae su pronto pago [días 1, % 1, días 2, % 2] para proponerlo en el documento.
  condiciones: (OpcionVenta & { dias: number; prontoPago: [string, string, string, string] })[]; transportes: OpcionVenta[]; origenes: OpcionVenta[];
};
export type CondicionesInicial = {
  vendedorId: string; condicionPagoId: string; transporteId: string; direccionEntrega: string; descuentos: [string, string, string];
  origenVentaId: string; bultos: string; kilos: string; prontoPago: [string, string, string, string];
};

export const CONDICIONES_VACIAS: CondicionesInicial = {
  vendedorId: "", condicionPagoId: "", transporteId: "", direccionEntrega: "", descuentos: ["0", "0", "0"],
  origenVentaId: "", bultos: "", kilos: "", prontoPago: ["0", "0", "0", "0"],
};

const num = (s: string) => {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

export function useCondiciones(inicial: CondicionesInicial | undefined, datos: DatosVentaForm | undefined, clienteInicial: string) {
  const ini = inicial ?? CONDICIONES_VACIAS;
  const [vendedorId, setVendedorId] = useState(ini.vendedorId);
  const [condicionPagoId, setCondicionPagoId] = useState(ini.condicionPagoId);
  const [transporteId, setTransporteId] = useState(ini.transporteId);
  const [direccionEntrega, setDireccionEntrega] = useState(ini.direccionEntrega);
  const [descuentos, setDescuentos] = useState<[string, string, string]>(ini.descuentos);
  const [origenVentaId, setOrigenVentaId] = useState(ini.origenVentaId);
  const [bultos, setBultos] = useState(ini.bultos);
  const [kilos, setKilos] = useState(ini.kilos);
  const [prontoPago, setProntoPago] = useState<[string, string, string, string]>(ini.prontoPago);
  const [clienteId, setClienteId] = useState(clienteInicial);

  const info = datos?.clientes[clienteId];
  const global = descuentoGlobal(descuentos.map(num));

  /** Al elegir otro cliente se proponen sus condiciones; devuelve los días de su condición de pago. */
  function elegirCliente(id: string) {
    setClienteId(id);
    const c = datos?.clientes[id];
    if (!c) return 0;
    setVendedorId(c.vendedorId);
    setCondicionPagoId(c.condicionPagoId);
    setTransporteId(c.transporteId);
    setDireccionEntrega(c.direccionEnvio);
    setDescuentos(c.descuentos);
    setProntoPago(datos?.condiciones.find((x) => x.valor === c.condicionPagoId)?.prontoPago ?? ["0", "0", "0", "0"]);
    return c.diasCondicion;
  }

  return {
    vendedorId, setVendedorId, condicionPagoId, setCondicionPagoId, transporteId, setTransporteId, direccionEntrega, setDireccionEntrega, descuentos, setDescuentos,
    origenVentaId, setOrigenVentaId, bultos, setBultos, kilos, setKilos, prontoPago, setProntoPago,
    /// Lista de precios del cliente elegido.
    lista: info?.lista ?? "A",
    /// Descuento global combinado (%), para la vista previa.
    global,
    elegirCliente,
    /// Lo que se envía al servidor.
    encabezado: () => ({
      vendedorId: vendedorId || null, condicionPagoId: condicionPagoId || null, transporteId: transporteId || null, direccionEntrega: direccionEntrega.trim() || null,
      descuentos: descuentos.map(num) as [number, number, number],
      origenVentaId: origenVentaId || null,
      bultos: bultos.trim() === "" ? null : Math.trunc(num(bultos)),
      kilos: kilos.trim() === "" ? null : num(kilos),
      prontoPago: prontoPago.map(num) as [number, number, number, number],
    }),
  };
}
export type Condiciones = ReturnType<typeof useCondiciones>;

/** Orden de los datos de arriba al avanzar con Enter; el último paso es el buscador de productos. */
const ORDEN = ["clienteId", "vendedorId", "descuentoGlobal1", "diasCredito", "condicionPagoId", "buscar-producto"];

export function avanzarDesde(id: string) {
  requestAnimationFrame(() => {
    for (const siguiente of ORDEN.slice(ORDEN.indexOf(id) + 1)) {
      const el = document.getElementById(siguiente);
      if (el && !(el as HTMLInputElement).disabled) {
        el.focus();
        if (el instanceof HTMLInputElement) el.select();
        return;
      }
    }
  });
}

/** Para el formulario: Enter nunca envía el documento desde un campo; en los datos de arriba pasa al siguiente. */
export function enterEnFormulario(e: KeyboardEvent<HTMLFormElement>) {
  const t = e.target as HTMLElement;
  if (e.key !== "Enter" || e.defaultPrevented || !(t instanceof HTMLInputElement || t instanceof HTMLSelectElement)) return;
  e.preventDefault();
  if (ORDEN.includes(t.id)) avanzarDesde(t.id);
}

const campo = "flex flex-col gap-1.5";
const etiqueta = "text-[13px] font-medium";
const opcional = <span className="font-normal text-gris-500">(opcional)</span>;

/**
 * Los datos básicos del documento, como en el sistema anterior: vendedor, descuento general y condición de pago (más el origen).
 * Son celdas de la grilla del encabezado; `plazo` va entre el descuento y la condición.
 */
export function CamposBasicos({ cond, datos, onCondicion, plazo }: { cond: Condiciones; datos: DatosVentaForm; onCondicion?: (dias: number) => void; plazo?: ReactNode }) {
  return (
    <>
      <div className={`${campo} xl:col-span-2`}>
        <label htmlFor="vendedorId" className={etiqueta}>Vendedor <Tecla>F2</Tecla></label>
        <SelectorPersonal rol="vendedor" id="vendedorId" valor={cond.vendedorId} opciones={datos.vendedores} vacio="Sin vendedor" placeholder="Buscar vendedor por nombre o código…" onCambio={cond.setVendedorId} onElegido={() => avanzarDesde("vendedorId")} />
      </div>
      <div className={campo}>
        <label htmlFor="descuentoGlobal1" className={etiqueta}>Descuento general (%)</label>
        <input id="descuentoGlobal1" inputMode="decimal" value={cond.descuentos[0]} onChange={(e) => cond.setDescuentos((d) => [e.target.value, d[1], d[2]])} className={claseControl} />
      </div>
      {plazo}
      <div className={campo}>
        <label htmlFor="condicionPagoId" className={etiqueta}>Condición de pago <Tecla>F3</Tecla></label>
        <select
          id="condicionPagoId" value={cond.condicionPagoId}
          onChange={(e) => {
            const c = datos.condiciones.find((x) => x.valor === e.target.value);
            cond.setCondicionPagoId(e.target.value); cond.setProntoPago(c?.prontoPago ?? ["0", "0", "0", "0"]); onCondicion?.(c?.dias ?? 0);
          }}
          className={`${claseControl} pr-9`}
        >
          <option value="">Sin condición</option>
          {datos.condiciones.map((c) => <option key={c.valor} value={c.valor}>{c.etiqueta}</option>)}
        </select>
      </div>
      <div className={campo}>
        <label htmlFor="origenVentaId" className={etiqueta}>Origen de la venta <Tecla>F4</Tecla></label>
        <select id="origenVentaId" value={cond.origenVentaId} onChange={(e) => cond.setOrigenVentaId(e.target.value)} className={`${claseControl} pr-9`}>
          <option value="">Sin origen</option>
          {datos.origenes.map((o) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
        </select>
      </div>
    </>
  );
}

/** Lo que está guardado en «Más datos» y no está vacío: se anuncia en el botón para que nada que cambie el documento quede escondido. */
export function resumenMasDatos(cond: Condiciones, extra: string[] = []) {
  const r = [...extra];
  const descuentos = cond.descuentos.slice(1).filter((x) => num(x) !== 0).length;
  if (descuentos) r.push(`${descuentos} descuento${descuentos > 1 ? "s" : ""} adicional${descuentos > 1 ? "es" : ""}`);
  if (cond.transporteId) r.push("transporte");
  if (cond.direccionEntrega.trim()) r.push("dirección de entrega");
  if (cond.bultos.trim() || cond.kilos.trim()) r.push("bultos o kilos");
  if (cond.prontoPago.some((x) => num(x) !== 0)) r.push("pronto pago");
  return r;
}

/** Botón «Más datos» y el panel que abre. Lo que va adentro sigue en el formulario aunque esté cerrado. */
export function MasDatos({ abierto, onAlternar, resumen, children }: { abierto: boolean; onAlternar: () => void; resumen: string[]; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 border-t border-linea pt-3">
      <button type="button" onClick={onAlternar} aria-expanded={abierto} className="flex flex-wrap items-center gap-2 self-start text-sm font-medium text-marca-texto hover:underline">
        <ChevronDown className={`size-4 transition-transform ${abierto ? "rotate-180" : ""}`} aria-hidden />
        Más datos
        {resumen.length ? <span className="rounded-full bg-aviso-suave px-2.5 py-0.5 text-[12px] font-medium text-tinta">Con: {resumen.join(", ")}</span> : null}
      </button>
      {abierto ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{children}</div> : null}
    </div>
  );
}

/** El resto de las condiciones comerciales: van dentro de «Más datos». */
export function CamposMas({ cond, datos }: { cond: Condiciones; datos: DatosVentaForm }) {
  return (
    <>
      <div className={campo}>
        <label htmlFor="transporteId" className={etiqueta}>Transporte {opcional}</label>
        <select id="transporteId" value={cond.transporteId} onChange={(e) => cond.setTransporteId(e.target.value)} className={`${claseControl} pr-9`}>
          <option value="">Sin transporte</option>
          {datos.transportes.map((t) => <option key={t.valor} value={t.valor}>{t.etiqueta}</option>)}
        </select>
      </div>
      <div className={`${campo} xl:col-span-3`}>
        <label htmlFor="direccionEntrega" className={etiqueta}>Dirección de entrega {opcional}</label>
        <input id="direccionEntrega" value={cond.direccionEntrega} onChange={(e) => cond.setDireccionEntrega(e.target.value)} maxLength={300} className={claseControl} />
      </div>
      {([1, 2] as const).map((i) => (
        <div key={i} className={campo}>
          <label htmlFor={`descuentoGlobal${i + 1}`} className={etiqueta}>Descuento global {i + 1} (%)</label>
          <input id={`descuentoGlobal${i + 1}`} inputMode="decimal" value={cond.descuentos[i]} onChange={(e) => cond.setDescuentos((d) => d.map((x, k) => (k === i ? e.target.value : x)) as [string, string, string])} className={claseControl} />
        </div>
      ))}
      <div className={campo}>
        <label htmlFor="bultos" className={etiqueta}>Bultos {opcional}</label>
        <input id="bultos" inputMode="numeric" value={cond.bultos} onChange={(e) => cond.setBultos(e.target.value)} className={claseControl} />
      </div>
      <div className={campo}>
        <label htmlFor="kilos" className={etiqueta}>Kilos {opcional}</label>
        <input id="kilos" inputMode="decimal" value={cond.kilos} onChange={(e) => cond.setKilos(e.target.value)} className={claseControl} />
      </div>
      <div className="flex flex-col gap-1.5 md:col-span-2 xl:col-span-4">
        <span className={etiqueta}>Pronto pago <span className="font-normal text-gris-500">(descuento si el cliente paga dentro de estos días; viene de la condición de pago)</span></span>
        <div className="grid gap-3 md:grid-cols-4">
          {([["Días 1", 0], ["% 1", 1], ["Días 2", 2], ["% 2", 3]] as const).map(([t, i]) => (
            <label key={t} className="flex flex-col gap-1 text-[12.5px] text-gris-600">{t}
              <input aria-label={`Pronto pago ${t}`} inputMode="decimal" value={cond.prontoPago[i]} onChange={(e) => cond.setProntoPago((p) => p.map((x, k) => (k === i ? e.target.value : x)) as [string, string, string, string])} className={claseControl} />
            </label>
          ))}
        </div>
      </div>
    </>
  );
}
