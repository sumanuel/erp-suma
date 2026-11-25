"use client";

import Link from "next/link";
import { SelectorTercero } from "@/components/selector-tercero";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { Aviso, Tarjeta, clasesBoton, claseControl } from "@/components/ui";
import { calcularLinea, calcularTotales } from "@/lib/pedidos/calculos";
import type { ProductoVenta } from "@/lib/pedidos/servicio";
import { FORMAS_PAGO_POS } from "@/lib/pos/estados";
import { buscarProductosPos, cobrarVentaPos, type RespuestaVenta } from "./acciones";

type Linea = { productoCodigo: string; descripcion: string; ivaPorcentaje: number; cantidad: string; precioUnitario: string; descuento: string };
type Pago = { formaPago: string; moneda: string; recibido: string; cuentaId: string; referencia: string };
type Opc = { valor: string; etiqueta: string };

const num = (s: string) => {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const bs = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

/**
 * Venta de mostrador. El cajero arma el carrito, reparte el pago (efectivo en Bs. o USD, punto, pago móvil, transferencia, Zelle) y cobra:
 * el servidor factura, cobra y calcula el vuelto en una sola transacción. El navegador solo muestra una vista previa.
 */
export function PantallaVenta({ turnoId, tasa, clientes, cuentas }: { turnoId: string; tasa: number; clientes: (Opc & { lista: string })[]; cuentas: (Opc & { moneda: string })[] }) {
  const [clienteId, setClienteId] = useState("");
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [monedaVuelto, setMonedaVuelto] = useState<"" | "USD" | "VES">("");
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Extract<RespuestaVenta, { ok: true }> | null>(null);
  const [pendiente, iniciar] = useTransition();
  const lista = clientes.find((c) => c.valor === clienteId)?.lista ?? "A";

  // Buscador con espera corta; Enter agrega el primer resultado (sirve para el lector de código de barras).
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState<ProductoVenta[]>([]);
  const ultima = useRef(0);
  const entradaBusqueda = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const q = texto.trim();
    if (q.length < 2) return;
    const turno = ++ultima.current;
    const t = setTimeout(async () => {
      const r = await buscarProductosPos(q, lista).catch(() => []);
      if (turno === ultima.current) setResultados(r);
    }, 200);
    return () => clearTimeout(t);
  }, [texto, lista]);
  const visibles = texto.trim().length < 2 ? [] : resultados;

  function agregar(p: ProductoVenta) {
    setTexto("");
    setResultados([]);
    setLineas((ls) => {
      const i = ls.findIndex((l) => l.productoCodigo === p.codigo);
      if (i >= 0) return ls.map((l, k) => (k === i ? { ...l, cantidad: String(num(l.cantidad) + 1) } : l));
      return [...ls, { productoCodigo: p.codigo, descripcion: p.descripcion, ivaPorcentaje: p.ivaPorcentaje, cantidad: "1", precioUnitario: String(p.precioLista), descuento: String(p.descuentoSugerido ?? 0) }];
    });
    entradaBusqueda.current?.focus();
  }
  const cambiar = (i: number, campo: "cantidad" | "precioUnitario" | "descuento", v: string) => setLineas((ls) => ls.map((l, k) => (k === i ? { ...l, [campo]: v } : l)));

  const entrada = lineas.map((l) => ({ cantidad: num(l.cantidad), costoUnitario: num(l.precioUnitario), descuento: num(l.descuento), ivaPorcentaje: l.ivaPorcentaje }));
  const totales = calcularTotales(entrada);
  const totalBs = r2(totales.total * tasa);
  const recibidoBs = r2(pagos.reduce((s, p) => s + (p.moneda === "VES" ? num(p.recibido) : num(p.recibido) * tasa), 0));
  const diferenciaBs = r2(recibidoBs - totalBs);
  const falta = diferenciaBs < 0 ? -diferenciaBs : 0;
  const vueltoBs = diferenciaBs > 0 ? diferenciaBs : 0;

  const agregarPago = (p: Partial<Pago> = {}) => setPagos((x) => [...x, { formaPago: "EFECTIVO", moneda: "VES", recibido: "", cuentaId: "", referencia: "", ...p }]);
  const cambiarPago = (i: number, campo: keyof Pago, v: string) => setPagos((x) => x.map((p, k) => (k === i ? { ...p, [campo]: v, ...(campo === "formaPago" || campo === "moneda" ? { cuentaId: "" } : {}) } : p)));
  const exactoBs = () => setPagos([{ formaPago: "EFECTIVO", moneda: "VES", recibido: totalBs.toFixed(2), cuentaId: "", referencia: "" }]);
  const exactoUsd = () => setPagos([{ formaPago: "EFECTIVO", moneda: "USD", recibido: (Math.ceil((totalBs / tasa) * 100 - 1e-9) / 100).toFixed(2), cuentaId: "", referencia: "" }]);

  function cobrar() {
    setError(null);
    setResultado(null);
    iniciar(async () => {
      const r = await cobrarVentaPos({
        turnoId, clienteId: clienteId || null, ...(monedaVuelto ? { monedaVuelto } : {}),
        lineas: lineas.map((l) => ({ productoCodigo: l.productoCodigo, cantidad: num(l.cantidad), precioUnitario: num(l.precioUnitario), descuento: num(l.descuento) })),
        pagos: pagos.filter((p) => num(p.recibido) > 0).map((p) => ({ formaPago: p.formaPago, moneda: p.moneda, recibido: num(p.recibido), cuentaId: p.cuentaId || null, referencia: p.referencia || null })),
      });
      if ("error" in r) {
        setError(r.error);
        return;
      }
      setResultado(r);
      setLineas([]);
      setPagos([]);
      setMonedaVuelto("");
      setClienteId("");
      entradaBusqueda.current?.focus();
    });
  }

  const cel = "px-2 py-2";
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
      <div className="flex flex-col gap-4">
        {resultado ? (
          <Aviso tono="exito">
            Venta {String(resultado.numero).padStart(6, "0")} registrada · factura FAC-{String(resultado.facturaNumero).padStart(6, "0")} · {usd(resultado.totalUsd)} USD ({bs(resultado.totalBs)} Bs.).
            {resultado.vueltoMonto > 0 ? <> <strong>Entregar vuelto: {resultado.vueltoMoneda === "USD" ? `${usd(resultado.vueltoMonto)} USD` : `${bs(resultado.vueltoMonto)} Bs.`}</strong>.</> : null}{" "}
            <Link href={`/pos/ventas/${resultado.id}`} className="font-medium underline">Ver recibo</Link>
          </Aviso>
        ) : null}
        {error ? <Aviso tono="error">{error}</Aviso> : null}
        <Tarjeta recortar={false}>
          <div className="relative p-4">
            <label htmlFor="buscar-producto" className="mb-1.5 block text-[13px] font-medium">Producto (código, descripción o código de barras)</label>
            <input
              id="buscar-producto" ref={entradaBusqueda} value={texto} onChange={(e) => setTexto(e.target.value)} autoComplete="off" autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (visibles[0]) agregar(visibles[0]); } }}
              placeholder="Escribe o escanea y pulsa Enter" className={`${claseControl} max-w-xl`}
            />
            {visibles.length > 0 ? (
              <ul className="absolute z-10 mt-1 max-h-72 w-full max-w-xl overflow-auto rounded-[10px] border border-borde bg-white py-1 shadow-lg">
                {visibles.map((p) => (
                  <li key={p.codigo}>
                    <button type="button" onClick={() => agregar(p)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[13.5px] hover:bg-hover">
                      <span className="min-w-0 truncate"><span className="font-semibold">{p.codigo}</span> · {p.descripcion}</span>
                      <span className="shrink-0 text-gris-500">{usd(p.precioLista)} USD · disp. {p.disponible.toLocaleString("es-VE", { maximumFractionDigits: 4 })}{p.origenPrecio === "PROMOCION" ? " · promo" : ""}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13.5px]">
              <thead>
                <tr className="border-y border-linea text-[12.5px] text-gris-600">
                  <th className="px-4 py-3 font-medium">Producto</th><th className="px-2 py-3 text-right font-medium">Cantidad</th><th className="px-2 py-3 text-right font-medium">Precio USD</th>
                  <th className="px-2 py-3 text-right font-medium">Desc. %</th><th className="px-2 py-3 text-right font-medium">Total USD</th><th className="px-2 py-3 text-right font-medium">Total Bs.</th><th className="px-4 py-3"><span className="sr-only">Quitar</span></th>
                </tr>
              </thead>
              <tbody>
                {lineas.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-gris-500">Escanea o busca un producto para empezar la venta.</td></tr>
                ) : lineas.map((l, i) => {
                  const c = calcularLinea(entrada[i]);
                  return (
                    <tr key={l.productoCodigo} className="border-b border-linea last:border-0">
                      <td className="px-4 py-2"><span className="font-semibold">{l.productoCodigo}</span> · {l.descripcion}</td>
                      <td className={cel}><input aria-label={`Cantidad de ${l.productoCodigo}`} inputMode="decimal" value={l.cantidad} onChange={(e) => cambiar(i, "cantidad", e.target.value)} className={`${claseControl} w-20 text-right`} /></td>
                      <td className={cel}><input aria-label={`Precio de ${l.productoCodigo}`} inputMode="decimal" value={l.precioUnitario} onChange={(e) => cambiar(i, "precioUnitario", e.target.value)} className={`${claseControl} w-24 text-right`} /></td>
                      <td className={cel}><input aria-label={`Descuento de ${l.productoCodigo}`} inputMode="decimal" value={l.descuento} onChange={(e) => cambiar(i, "descuento", e.target.value)} className={`${claseControl} w-16 text-right`} /></td>
                      <td className={`${cel} text-right tabular-nums`}>{usd(c.total)}</td>
                      <td className={`${cel} text-right tabular-nums`}>{bs(r2(c.total * tasa))}</td>
                      <td className="px-4 py-2 text-right">
                        <button type="button" aria-label={`Quitar ${l.productoCodigo}`} onClick={() => setLineas((ls) => ls.filter((_, k) => k !== i))} className="inline-flex size-9 items-center justify-center rounded-[9px] border border-[#f3c7c2] text-error hover:bg-[#fdf0ef]"><Trash2 className="size-4" aria-hidden /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Tarjeta>
      </div>

      <div className="flex flex-col gap-4">
        <Tarjeta className="flex flex-col gap-3 p-5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="clientePos" className="text-[13px] font-medium">Cliente <span className="font-normal text-gris-500">(opcional)</span></label>
            <SelectorTercero tipo="cliente" id="clientePos" valor={clienteId} opciones={clientes} vacio="Consumidor final" placeholder="Consumidor final — buscar por nombre o cédula/RIF…" onCambio={setClienteId} />
            {lista !== "A" ? <p className="text-[12.5px] text-gris-500">Precios de la lista {lista}.</p> : null}
          </div>
          <dl className="flex flex-col gap-1 text-[13.5px]">
            <div className="flex justify-between"><dt className="text-gris-600">Subtotal</dt><dd className="tabular-nums">{usd(totales.subtotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-gris-600">IVA</dt><dd className="tabular-nums">{usd(totales.iva)}</dd></div>
            <div className="flex justify-between border-t border-linea pt-2 text-[17px] font-semibold"><dt>Total USD</dt><dd className="tabular-nums">{usd(totales.total)}</dd></div>
            <div className="flex justify-between text-[17px] font-semibold text-marca-fuerte"><dt>Total Bs.</dt><dd className="tabular-nums">{bs(totalBs)}</dd></div>
          </dl>
        </Tarjeta>

        <Tarjeta className="flex flex-col gap-3 p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-[13px] font-semibold uppercase tracking-wide text-gris-600">Pago</h3>
            <div className="flex gap-2">
              <button type="button" onClick={exactoBs} disabled={lineas.length === 0} className={clasesBoton("secundario", "!px-2.5 !py-1 text-[12.5px]")}>Bs. exacto</button>
              <button type="button" onClick={exactoUsd} disabled={lineas.length === 0} className={clasesBoton("secundario", "!px-2.5 !py-1 text-[12.5px]")}>USD exacto</button>
            </div>
          </div>
          {pagos.map((p, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-[10px] border border-linea p-3">
              <div className="grid grid-cols-[1fr_88px_1fr_auto] items-end gap-2">
                <select aria-label="Forma de pago" value={p.formaPago} onChange={(e) => cambiarPago(i, "formaPago", e.target.value)} className={`${claseControl} pr-8`}>
                  {Object.entries(FORMAS_PAGO_POS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <select aria-label="Moneda del pago" value={p.moneda} onChange={(e) => cambiarPago(i, "moneda", e.target.value)} className={`${claseControl} pr-8`}>
                  <option value="VES">Bs.</option><option value="USD">USD</option>
                </select>
                <input aria-label="Monto recibido" inputMode="decimal" placeholder="Monto" value={p.recibido} onChange={(e) => cambiarPago(i, "recibido", e.target.value)} className={`${claseControl} text-right`} />
                <button type="button" aria-label="Quitar pago" onClick={() => setPagos((x) => x.filter((_, k) => k !== i))} className="inline-flex size-9 items-center justify-center rounded-[9px] border border-[#f3c7c2] text-error hover:bg-[#fdf0ef]"><Trash2 className="size-4" aria-hidden /></button>
              </div>
              {p.formaPago !== "EFECTIVO" ? (
                <div className="grid grid-cols-2 gap-2">
                  <select aria-label="Cuenta que recibe" value={p.cuentaId} onChange={(e) => cambiarPago(i, "cuentaId", e.target.value)} className={`${claseControl} pr-8`}>
                    <option value="">Cuenta que recibe…</option>
                    {cuentas.filter((c) => c.moneda === p.moneda).map((c) => <option key={c.valor} value={c.valor}>{c.etiqueta}</option>)}
                  </select>
                  <input aria-label="Referencia" placeholder="Referencia" maxLength={60} value={p.referencia} onChange={(e) => cambiarPago(i, "referencia", e.target.value)} className={claseControl} />
                </div>
              ) : null}
            </div>
          ))}
          <button type="button" onClick={() => agregarPago()} className={clasesBoton("secundario", "self-start")}><Plus className="size-4" aria-hidden />Agregar forma de pago</button>

          {pagos.length > 0 ? (
            <div className="flex flex-col gap-1 border-t border-linea pt-3 text-[13.5px]">
              <div className="flex justify-between"><span className="text-gris-600">Recibido</span><span className="tabular-nums">{bs(recibidoBs)} Bs.</span></div>
              {falta > 0 ? <div className="flex justify-between font-semibold text-error"><span>Falta</span><span className="tabular-nums">{bs(falta)} Bs. · {usd(r2(falta / tasa))} USD</span></div> : null}
              {vueltoBs > 0 ? (
                <>
                  <div className="flex justify-between font-semibold text-marca-fuerte"><span>Vuelto</span><span className="tabular-nums">{bs(vueltoBs)} Bs. · {usd(r2(vueltoBs / tasa))} USD</span></div>
                  <div className="flex items-center gap-2 pt-1">
                    <label htmlFor="monedaVuelto" className="text-[12.5px] text-gris-600">Entregar en</label>
                    <select id="monedaVuelto" value={monedaVuelto} onChange={(e) => setMonedaVuelto(e.target.value as "" | "USD" | "VES")} className={`${claseControl} w-44 pr-8`}>
                      <option value="">La moneda del pago</option><option value="VES">Bolívares</option><option value="USD">Dólares</option>
                    </select>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
        </Tarjeta>

        <button data-guardar type="button" onClick={cobrar} disabled={pendiente || lineas.length === 0 || pagos.length === 0 || falta > 0.005} className={clasesBoton("primario", "w-full !py-3 text-[15px]")}>
          {pendiente ? "Cobrando…" : `Cobrar ${bs(totalBs)} Bs.`}
        </button>
      </div>
    </div>
  );
}
