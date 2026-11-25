"use client";

import { Plus, Trash2, X } from "lucide-react";
import { useState, type KeyboardEvent, type ReactNode } from "react";
import { Tarjeta, clasesBoton, claseControl } from "@/components/ui";
import { BuscadorProducto, alEnter, enfocarBuscador } from "@/components/buscador-producto";
import { calcularLinea, descuentoEfectivo } from "@/lib/pedidos/calculos";
import type { ProductoVenta } from "@/lib/pedidos/servicio";
import { conUnidad, type PresentacionVenta } from "@/lib/ventas/presentaciones";

// Captura de artículos como en el sistema anterior: una fila fija arriba (producto → unidad → descuento → cantidad → precio) que se recorre
// con Enter, y una tabla que no se edita. Para corregir una línea se elimina y se vuelve a capturar.

export type LineaCapturada = {
  productoCodigo: string; descripcion: string; ivaPorcentaje: number; cantidad: string; precioUnitario: string; descuento: string;
  presentacionId?: string; presentaciones?: PresentacionVenta[]; precioUnidad?: number; almacenId?: string; bonificacion?: boolean;
};

const num = (s: string) => {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const usd = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cant = (n: number) => n.toLocaleString("es-VE", { maximumFractionDigits: 4 });
const nombreUnidad = (l: LineaCapturada) => l.presentaciones?.find((p) => p.id === l.presentacionId)?.nombre ?? "Unidad";

/** Suma la línea capturada a la lista. Un producto va en una sola línea: si ya está con la misma unidad y almacén, se suma la cantidad. */
export function agregarLinea<T extends LineaCapturada>(lineas: T[], nueva: T): { lineas: T[]; aviso: string | null } | { error: string } {
  const i = lineas.findIndex((l) => l.productoCodigo === nueva.productoCodigo && !l.bonificacion);
  if (i < 0) return { lineas: [...lineas, nueva], aviso: null };
  const ya = lineas[i];
  if ((ya.presentacionId ?? "") !== (nueva.presentacionId ?? "") || (ya.almacenId ?? "") !== (nueva.almacenId ?? "")) return { error: `${nueva.productoCodigo} ya está con otra unidad o almacén: elimina esa línea para cambiarla.` };
  const total = Math.round((num(ya.cantidad) + num(nueva.cantidad)) * 10000) / 10000;
  return { lineas: lineas.map((l, k) => (k === i ? { ...nueva, cantidad: String(total) } : l)), aviso: `${nueva.productoCodigo} ya estaba: quedó con ${cant(total)} (precio y descuento de esta captura).` };
}

export function CapturaArticulo<T extends LineaCapturada>({ buscar, lineas, onCambio, puedeCambiarPrecio, descuentoGlobal, almacenes, onEnterVacio }: {
  buscar: (texto: string) => Promise<ProductoVenta[]>; lineas: T[]; onCambio: (lineas: T[]) => void; puedeCambiarPrecio: boolean; descuentoGlobal: number;
  /// Si se dan (factura con varios almacenes), la línea puede salir de uno distinto al del documento.
  almacenes?: { valor: string; etiqueta: string }[];
  onEnterVacio?: () => void;
}) {
  const [borrador, setBorrador] = useState<(LineaCapturada & { disponible: number }) | null>(null);
  const [cambiarPrecio, setCambiarPrecio] = useState(false);
  const [mensaje, setMensaje] = useState<{ texto: string; error: boolean } | null>(null);

  const enfocar = (id: string) => requestAnimationFrame(() => {
    const el = document.getElementById(id);
    el?.focus();
    if (el instanceof HTMLInputElement) el.select();
  });

  function elegir(p: ProductoVenta) {
    setMensaje(null);
    setBorrador({
      productoCodigo: p.codigo, descripcion: p.descripcion, ivaPorcentaje: p.ivaPorcentaje, cantidad: "1", presentaciones: p.presentaciones, precioUnidad: p.precioLista,
      precioUnitario: String(p.precioLista), descuento: String(p.descuentoSugerido ?? 0), presentacionId: "", almacenId: "", disponible: p.disponible,
    });
    enfocar(p.presentaciones?.length ? "captura-unidad" : "captura-descuento");
  }
  function limpiar() {
    setBorrador(null);
    setCambiarPrecio(false);
    enfocarBuscador();
  }
  function agregar() {
    if (!borrador) return;
    if (!(num(borrador.cantidad) > 0)) { setMensaje({ texto: "La cantidad debe ser mayor que 0.", error: true }); enfocar("captura-cantidad"); return; }
    if (num(borrador.descuento) < 0 || num(borrador.descuento) > 100) { setMensaje({ texto: "El descuento va de 0 a 100.", error: true }); enfocar("captura-descuento"); return; }
    const { disponible, ...linea } = borrador;
    void disponible;
    const r = agregarLinea(lineas, linea as T);
    if ("error" in r) { setMensaje({ texto: r.error, error: true }); return; }
    onCambio(r.lineas);
    setMensaje(r.aviso ? { texto: r.aviso, error: false } : null);
    limpiar();
  }

  const poner = (campo: keyof LineaCapturada, v: string) => setBorrador((b) => (b ? { ...b, [campo]: v } : b));
  const escape = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); setMensaje(null); limpiar(); } };
  const importe = borrador ? calcularLinea({ cantidad: num(borrador.cantidad), costoUnitario: num(borrador.precioUnitario), descuento: descuentoEfectivo(num(borrador.descuento), descuentoGlobal), ivaPorcentaje: 0 }).neto : 0;
  const campo = (id: string, etiqueta: string, ancho: string, control: ReactNode) => (
    <div className={`flex flex-col gap-1.5 ${ancho}`}><label htmlFor={id} className="text-[13px] font-medium">{etiqueta}</label>{control}</div>
  );

  return (
    <div className="flex flex-col gap-3 border-b border-linea p-4" onKeyDown={escape}>
      <div className="flex flex-wrap items-end gap-3">
        <BuscadorProducto buscar={buscar} onElegir={elegir} onEnterVacio={onEnterVacio} derecha={(p) => `${usd(p.precioLista)} · disp. ${cant(p.disponible)}`} etiqueta="Producto" contenedor="relative w-full sm:w-72" className="w-full" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium">Nombre</p>
          <p aria-live="polite" className="mt-1.5 flex h-10 items-center truncate rounded-[9px] border border-linea bg-neutro-suave/40 px-3 text-[13.5px]">
            {borrador ? <><span className="mr-2 font-semibold">{borrador.productoCodigo}</span><span className="truncate">{borrador.descripcion}</span><span className="ml-auto shrink-0 pl-3 text-gris-500">disp. {cant(borrador.disponible)}</span></> : <span className="text-gris-500">Escribe el código o parte del nombre y pulsa Enter</span>}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        {campo("captura-unidad", "Unidad", "w-40", (
          <select id="captura-unidad" disabled={!borrador} value={borrador?.presentacionId ?? ""} onChange={(e) => setBorrador((b) => (b ? conUnidad(b, e.target.value) : b))} onKeyDown={(e) => alEnter(e, () => enfocar("captura-descuento"))} className={`${claseControl} pr-8`}>
            <option value="">Unidad</option>
            {borrador?.presentaciones?.map((p) => <option key={p.id} value={p.id}>{p.nombre} (×{p.factor})</option>)}
          </select>
        ))}
        {campo("captura-descuento", "Desc. %", "w-24", <input id="captura-descuento" inputMode="decimal" disabled={!borrador} value={borrador?.descuento ?? ""} onChange={(e) => poner("descuento", e.target.value)} onKeyDown={(e) => alEnter(e, () => enfocar("captura-cantidad"))} className={`${claseControl} text-right`} />)}
        {campo("captura-cantidad", "Cantidad", "w-28", <input id="captura-cantidad" inputMode="decimal" disabled={!borrador} value={borrador?.cantidad ?? ""} onChange={(e) => poner("cantidad", e.target.value)} onKeyDown={(e) => alEnter(e, () => (cambiarPrecio ? enfocar("captura-precio") : agregar()))} className={`${claseControl} text-right`} />)}
        {campo("captura-precio", "Precio USD", "w-32", <input id="captura-precio" inputMode="decimal" disabled={!borrador || !cambiarPrecio} value={borrador?.precioUnitario ?? ""} onChange={(e) => poner("precioUnitario", e.target.value)} onKeyDown={(e) => alEnter(e, agregar)} className={`${claseControl} text-right disabled:bg-neutro-suave/40`} />)}
        {almacenes && almacenes.length > 1 ? campo("captura-almacen", "Almacén", "w-44", (
          <select id="captura-almacen" disabled={!borrador} value={borrador?.almacenId ?? ""} onChange={(e) => poner("almacenId", e.target.value)} className={`${claseControl} pr-8`}>
            <option value="">Del documento</option>
            {almacenes.map((a) => <option key={a.valor} value={a.valor}>{a.etiqueta}</option>)}
          </select>
        )) : null}
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Importe</span>
          <span className="flex h-10 min-w-24 items-center justify-end text-[15px] font-semibold tabular-nums">{borrador ? usd(importe) : "—"}</span>
        </div>
        <button type="button" disabled={!borrador} onClick={agregar} className={clasesBoton("secundario")}><Plus className="size-4" aria-hidden />Agregar</button>
        {borrador ? <button type="button" onClick={() => { setMensaje(null); limpiar(); }} className="inline-flex h-10 items-center gap-1 px-2 text-sm text-gris-600 hover:text-tinta"><X className="size-4" aria-hidden />Limpiar</button> : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {puedeCambiarPrecio ? <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={cambiarPrecio} onChange={(e) => { setCambiarPrecio(e.target.checked); if (e.target.checked && borrador) enfocar("captura-precio"); }} className="size-4 accent-marca-fuerte" />Cambiar precio</label> : <span className="text-[12.5px] text-gris-500">El precio sale de la lista del cliente.</span>}
        {mensaje ? <p role="status" className={`text-[13px] ${mensaje.error ? "font-medium text-error" : "text-gris-700"}`}>{mensaje.texto}</p> : <span className="text-[12.5px] text-gris-500">Enter avanza y agrega · Esc limpia</span>}
      </div>
    </div>
  );
}

/** Líneas ya capturadas: no se editan. Se eliminan con el botón o con la tecla Supr sobre la fila. */
export function TablaLineas<T extends LineaCapturada>({ lineas, onQuitar, descuentoGlobal, vacio, almacenes }: {
  lineas: T[]; onQuitar?: (indice: number) => void; descuentoGlobal: number; vacio: string; almacenes?: { valor: string; etiqueta: string }[];
}) {
  const conAlmacen = !!almacenes && lineas.some((l) => l.almacenId);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[13.5px]">
        <thead>
          <tr className="border-b border-linea text-[12.5px] text-gris-600">
            <th className="px-4 py-2.5 font-medium">Código</th><th className="px-2 py-2.5 font-medium">Producto</th><th className="px-2 py-2.5 font-medium">Unidad</th><th className="px-2 py-2.5 text-right font-medium">Cantidad</th>
            <th className="px-2 py-2.5 text-right font-medium">Precio USD</th><th className="px-2 py-2.5 text-right font-medium">Desc. %</th><th className="px-2 py-2.5 text-right font-medium">IVA %</th><th className="px-2 py-2.5 text-right font-medium">Total</th>
            {conAlmacen ? <th className="px-2 py-2.5 font-medium">Almacén</th> : null}
            {onQuitar ? <th className="px-4 py-2.5"><span className="sr-only">Eliminar</span></th> : null}
          </tr>
        </thead>
        <tbody>
          {lineas.length === 0 ? <tr><td colSpan={10} className="px-4 py-10 text-center text-gris-500">{vacio}</td></tr> : lineas.map((l, i) => {
            const total = calcularLinea({ cantidad: num(l.cantidad), costoUnitario: num(l.precioUnitario), descuento: descuentoEfectivo(num(l.descuento), descuentoGlobal), ivaPorcentaje: l.ivaPorcentaje }).total;
            return (
              <tr key={`${l.productoCodigo}-${i}`} tabIndex={onQuitar ? 0 : undefined} onKeyDown={(e) => { if (onQuitar && e.key === "Delete") { e.preventDefault(); onQuitar(i); enfocarBuscador(); } }} className="border-b border-linea last:border-0 focus:bg-hover focus:outline-none">
                <td className="px-4 py-2 font-semibold">{l.productoCodigo}</td>
                <td className="px-2 py-2">{l.descripcion}{l.bonificacion ? <span className="ml-2 rounded-full bg-exito-suave px-2 py-0.5 text-[11.5px] text-exito">Bonificación</span> : null}</td>
                <td className="px-2 py-2">{nombreUnidad(l)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{cant(num(l.cantidad))}</td>
                <td className="px-2 py-2 text-right tabular-nums">{usd(num(l.precioUnitario))}</td>
                <td className="px-2 py-2 text-right tabular-nums">{cant(num(l.descuento))}</td>
                <td className="px-2 py-2 text-right tabular-nums">{l.ivaPorcentaje}</td>
                <td className="px-2 py-2 text-right tabular-nums">{usd(total)}</td>
                {conAlmacen ? <td className="px-2 py-2">{l.almacenId ? almacenes?.find((a) => a.valor === l.almacenId)?.etiqueta : "Del documento"}</td> : null}
                {onQuitar ? <td className="px-4 py-2 text-right"><button type="button" aria-label={`Quitar ${l.productoCodigo}`} onClick={() => { onQuitar(i); enfocarBuscador(); }} className="inline-flex size-8 items-center justify-center rounded-[9px] border border-[#f3c7c7] text-error hover:bg-error-suave"><Trash2 className="size-4" aria-hidden /></button></td> : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Bloque completo de artículos: captura (si se puede) y tabla. */
export function Articulos({ children }: { children: ReactNode }) {
  return <Tarjeta recortar={false}>{children}</Tarjeta>;
}
