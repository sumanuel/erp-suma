"use client";

import { useState, useTransition } from "react";
import { Aviso, Tarjeta, clasesBoton, claseControl } from "@/components/ui";
import { aplicarCambioPrecios, previsualizarCambioPrecios, type VistaPrevia } from "./acciones-precios";

type Opc = { valor: string; etiqueta: string; padre?: string };
const num = (s: string) => {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};
const usd = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

const MODOS = [
  { valor: "PORCENTAJE", etiqueta: "Subir o bajar un porcentaje", ayuda: "Positivo sube, negativo baja. Ejemplo: 10 sube 10 %, -5 baja 5 %." },
  { valor: "MONTO", etiqueta: "Sumar o restar un monto (USD)", ayuda: "Positivo suma, negativo resta." },
  { valor: "MARGEN_COSTO", etiqueta: "Fijar con un margen sobre el costo", ayuda: "Precio = costo × (1 + margen %). Se omiten los productos sin costo." },
];

/** Cambio masivo de precios: filtros → regla → vista previa → aplicar. */
export function CambioPrecios({ categorias, subcategorias, marcas, divisiones, proveedores }: { categorias: Opc[]; subcategorias: Opc[]; marcas: Opc[]; divisiones: Opc[]; proveedores: Opc[] }) {
  const [f, setF] = useState({ categoriaId: "", subcategoriaId: "", marcaId: "", divisionId: "", proveedorId: "", texto: "", incluirInactivos: false });
  const [lista, setLista] = useState("A");
  const [modo, setModo] = useState("PORCENTAJE");
  const [valor, setValor] = useState("");
  const [decimales, setDecimales] = useState("2");
  const [vista, setVista] = useState<VistaPrevia | null>(null);
  const [mensaje, setMensaje] = useState<{ tono: "exito" | "error"; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();

  const datos = () => ({ filtros: f, regla: { lista, modo, valor: num(valor), decimales: Number(decimales) } });
  const cambiar = (campo: keyof typeof f, v: string | boolean) => { setF((x) => ({ ...x, [campo]: v, ...(campo === "categoriaId" ? { subcategoriaId: "" } : {}) })); setVista(null); };
  const sel = (id: keyof typeof f, etiqueta: string, opciones: Opc[]) => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium">{etiqueta}</label>
      <select id={id} value={String(f[id])} onChange={(e) => cambiar(id, e.target.value)} className={`${claseControl} pr-9`}>
        <option value="">Todas</option>
        {opciones.map((o) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
      </select>
    </div>
  );

  function previsualizar() {
    setMensaje(null);
    iniciar(async () => {
      if (!Number.isFinite(num(valor))) { setMensaje({ tono: "error", texto: "Escribe el valor del cambio." }); return; }
      const r = await previsualizarCambioPrecios(datos());
      if ("error" in r) { setVista(null); setMensaje({ tono: "error", texto: r.error }); } else setVista(r);
    });
  }
  function aplicar() {
    if (!vista || "error" in vista) return;
    if (!window.confirm(`Se cambiará el precio de ${vista.cambian} producto(s) en la lista ${lista}. ¿Aplicar?`)) return;
    iniciar(async () => {
      const r = await aplicarCambioPrecios(datos());
      if ("error" in r) setMensaje({ tono: "error", texto: r.error });
      else { setMensaje({ tono: "exito", texto: `Listo: se cambió el precio de ${r.cambiados} producto(s) en la lista ${lista}.` }); setVista(null); }
    });
  }

  const subs = subcategorias.filter((s) => !f.categoriaId || s.padre === f.categoriaId);
  const modoActual = MODOS.find((m) => m.valor === modo)!;
  return (
    <div className="flex flex-col gap-5">
      {mensaje ? <Aviso tono={mensaje.tono}>{mensaje.texto}</Aviso> : null}
      <Tarjeta className="p-6">
        <h2 className="mb-3 text-[15px] font-semibold">1. ¿A qué productos?</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {sel("categoriaId", "Categoría", categorias)}
          {sel("subcategoriaId", "Subcategoría", subs)}
          {sel("marcaId", "Marca", marcas)}
          {sel("divisionId", "División", divisiones)}
          {sel("proveedorId", "Proveedor", proveedores)}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="texto" className="text-[13px] font-medium">Código o descripción contiene</label>
            <input id="texto" value={f.texto} maxLength={60} onChange={(e) => cambiar("texto", e.target.value)} className={claseControl} />
          </div>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={f.incluirInactivos} onChange={(e) => cambiar("incluirInactivos", e.target.checked)} className="size-4 accent-marca-fuerte" /> Incluir productos inactivos</label>
      </Tarjeta>
      <Tarjeta className="p-6">
        <h2 className="mb-3 text-[15px] font-semibold">2. ¿Qué cambio?</h2>
        <div className="grid gap-4 md:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="lista" className="text-[13px] font-medium">Lista de precios</label>
            <select id="lista" value={lista} onChange={(e) => { setLista(e.target.value); setVista(null); }} className={`${claseControl} pr-9`}>
              {["A", "B", "C", "D", "E", "F"].map((l) => <option key={l} value={l}>Lista {l}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <label htmlFor="modo" className="text-[13px] font-medium">Tipo de cambio</label>
            <select id="modo" value={modo} onChange={(e) => { setModo(e.target.value); setVista(null); }} className={`${claseControl} pr-9`}>
              {MODOS.map((m) => <option key={m.valor} value={m.valor}>{m.etiqueta}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="valor" className="text-[13px] font-medium">{modo === "MONTO" ? "Monto (USD)" : modo === "MARGEN_COSTO" ? "Margen (%)" : "Porcentaje (%)"}</label>
            <input id="valor" inputMode="decimal" value={valor} onChange={(e) => { setValor(e.target.value); setVista(null); }} className={claseControl} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="decimales" className="text-[13px] font-medium">Decimales del precio</label>
            <select id="decimales" value={decimales} onChange={(e) => { setDecimales(e.target.value); setVista(null); }} className={`${claseControl} pr-9`}>
              {[0, 1, 2, 3, 4].map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>
        <p className="mt-3 text-[12.5px] text-gris-500">{modoActual.ayuda} Si el producto tiene precio máximo al público, el precio nuevo no lo supera.</p>
        <div className="mt-4"><button type="button" onClick={previsualizar} disabled={pendiente} className={clasesBoton("secundario")}>{pendiente ? "Calculando…" : "Ver vista previa"}</button></div>
      </Tarjeta>
      {vista && "ok" in vista ? (
        <Tarjeta>
          <div className="flex flex-wrap items-center gap-3 p-4">
            <p className="text-sm"><strong>{vista.cambian}</strong> de {vista.total} producto(s) cambian de precio
              {vista.omitidos.sinCambio + vista.omitidos.sinCosto + vista.omitidos.negativos > 0 ? ` · omitidos: ${vista.omitidos.sinCambio} sin cambio, ${vista.omitidos.sinCosto} sin costo, ${vista.omitidos.negativos} con precio negativo` : ""}.</p>
            <button data-guardar="propio" type="button" onClick={aplicar} disabled={pendiente || vista.cambian === 0} className={`${clasesBoton("primario")} ml-auto`}>Aplicar el cambio</button>
          </div>
          {vista.cambian > vista.filas.length ? <p className="px-4 pb-2 text-[12.5px] text-gris-500">Se muestran los primeros {vista.filas.length}; el cambio se aplica a todos.</p> : null}
          <div className="max-h-[28rem] overflow-auto">
            <table className="w-full text-left text-[13.5px]">
              <thead><tr className="sticky top-0 border-y border-linea bg-white text-[12.5px] text-gris-600">
                <th className="px-4 py-2 font-medium">Producto</th><th className="px-3 py-2 text-right font-medium">Costo</th><th className="px-3 py-2 text-right font-medium">Precio actual</th><th className="px-3 py-2 text-right font-medium">Precio nuevo</th><th className="px-3 py-2 text-right font-medium">Diferencia</th>
              </tr></thead>
              <tbody>
                {vista.filas.map((x) => (
                  <tr key={x.codigo} className="border-b border-linea last:border-0">
                    <td className="px-4 py-2"><span className="font-medium">{x.codigo}</span> <span className="text-gris-500">{x.descripcion}</span></td>
                    <td className="px-3 py-2 text-right tabular-nums">{x.costo > 0 ? usd(x.costo) : "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{usd(x.anterior)}</td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">{usd(x.nuevo)}{x.limitado ? <span title="Limitado por el precio máximo al público"> ⚑</span> : null}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gris-600">{x.anterior > 0 ? `${((x.nuevo / x.anterior - 1) * 100).toFixed(2)} %` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tarjeta>
      ) : null}
    </div>
  );
}
