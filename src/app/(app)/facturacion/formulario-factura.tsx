"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { useState, useTransition } from "react";
import { Aviso, Tarjeta, clasesBoton, claseControl } from "@/components/ui";
import { CamposBasicos, CamposMas, MasDatos, avanzarDesde, enterEnFormulario, resumenMasDatos, useCondiciones, type CondicionesInicial, type DatosVentaForm } from "@/components/ventas/condiciones-venta";
import { Articulos, CapturaArticulo, TablaLineas, type LineaCapturada } from "@/components/ventas/captura-articulo";
import { PanelCobro, resumirCobro, type CuentaCobro, type PagoCapturado } from "@/components/ventas/panel-cobro";
import { SelectorTercero } from "@/components/selector-tercero";
import { calcularTotales, descuentoEfectivo } from "@/lib/pedidos/calculos";
import { buscarProductosFactura, emitirFacturaVenta } from "./acciones";
import { formatoCantidad, formatoUsd } from "./formato";

export type LineaForm = LineaCapturada;
export type InicialFactura = { clienteId: string; almacenId: string; observaciones: string; diasCredito: string; lineas: LineaForm[]; condiciones?: CondicionesInicial };

const num = (s: string) => {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Factura como en el sistema anterior: datos básicos arriba (lo demás en «Más datos»), captura de artículos con Enter, y a la derecha los
 * totales y el cobro. De contado se cobra antes de confirmar. Con `pedido`, el cliente y las líneas vienen del pedido y no se editan.
 * El servidor recalcula todo.
 */
export function FormularioFactura({ pedido, inicial, clientes, almacenes, ventas, puedeAprobar, puedeCambiarPrecio, puedeCobrar, cuentas, tasa, fecha }: {
  pedido: { id: string; etiqueta: string } | null; inicial: InicialFactura; clientes: { valor: string; etiqueta: string }[]; almacenes: { valor: string; etiqueta: string }[]; ventas: DatosVentaForm;
  puedeAprobar: boolean; puedeCambiarPrecio: boolean; puedeCobrar: boolean; cuentas: CuentaCobro[]; tasa: number | null; fecha: string;
}) {
  const [clienteId, setClienteId] = useState(inicial.clienteId);
  const cond = useCondiciones(inicial.condiciones, ventas, inicial.clienteId);
  const [almacenId, setAlmacenId] = useState(inicial.almacenId);
  const [observaciones, setObservaciones] = useState(inicial.observaciones);
  const [diasCredito, setDiasCredito] = useState(inicial.diasCredito);
  const [lineas, setLineas] = useState<LineaForm[]>(inicial.lineas);
  const [aprobar, setAprobar] = useState(false);
  const [motivoAprobacion, setMotivoAprobacion] = useState("");
  const [masAbierto, setMasAbierto] = useState(false);
  const [pagos, setPagos] = useState<PagoCapturado[]>([]);
  const [monedaVuelto, setMonedaVuelto] = useState<"" | "USD" | "VES">("");
  const [cajaVueltoId, setCajaVueltoId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const fijo = pedido !== null;
  const global = fijo ? 0 : cond.global;

  const entrada = lineas.map((l) => ({ cantidad: num(l.cantidad), costoUnitario: num(l.precioUnitario), descuento: fijo ? num(l.descuento) : descuentoEfectivo(num(l.descuento), global), ivaPorcentaje: l.ivaPorcentaje }));
  const totales = calcularTotales(entrada);
  const bruto = entrada.reduce((s, l) => s + l.cantidad * l.costoUnitario, 0);
  const descuentos = Math.max(0, bruto - totales.subtotal);
  const unidades = lineas.reduce((s, l) => s + num(l.cantidad), 0);
  const totalBs = tasa ? Math.round(totales.total * tasa * 100) / 100 : null;

  const contado = Math.trunc(num(diasCredito)) === 0;
  const cobra = contado && puedeCobrar && !!tasa;
  const cobro = cobra ? resumirCobro(pagos, totales.total, totalBs ?? 0, tasa) : null;

  const irACobrar = () => requestAnimationFrame(() => document.getElementById(cobra && !cobro?.cubierto ? "cobro-forma" : "confirmar-factura")?.focus());
  const irAConfirmar = () => requestAnimationFrame(() => document.getElementById("confirmar-factura")?.focus());

  function emitir() {
    setError(null);
    if (!clienteId) { setError("Elige el cliente."); document.getElementById("clienteId")?.focus(); return; }
    if (lineas.length === 0) { setError("Agrega al menos un producto."); document.getElementById("buscar-producto")?.focus(); return; }
    if (cobra && !cobro?.cubierto) { setError("La factura es de contado: registra el cobro completo antes de confirmar (o indica los días de plazo)."); document.getElementById("cobro-forma")?.focus(); return; }
    if (!confirm(cobra ? "¿Confirmar la factura y su cobro? Descuenta el inventario y no se puede editar (solo anular)." : "¿Emitir la factura? Descuenta el inventario y no se puede editar (solo anular).")) return;
    const aprobacion = puedeAprobar && aprobar ? { motivo: motivoAprobacion } : null;
    const pago = cobra ? { pagos, monedaVuelto: monedaVuelto || undefined, cajaVueltoId: cajaVueltoId || null } : null;
    iniciar(async () => {
      const r = await emitirFacturaVenta(
        pedido?.id ?? null,
        fijo
          ? { almacenId, observaciones, diasCredito: Math.trunc(num(diasCredito)), aprobacion, cobro: pago }
          : { clienteId, almacenId, observaciones, diasCredito: Math.trunc(num(diasCredito)), aprobacion, cobro: pago, encabezado: cond.encabezado(), lineas: lineas.map((l) => ({ productoCodigo: l.productoCodigo, presentacionId: l.presentacionId || null, cantidad: num(l.cantidad), precioUnitario: num(l.precioUnitario), descuento: num(l.descuento), almacenId: l.almacenId || null })) },
      );
      if (r?.error) {
        setError(r.error);
        // Si lo frena el crédito y puede aprobarlo, se le muestra dónde.
        if (puedeAprobar && /cr[eé]dito|moros|vencid|l[ií]mite/i.test(r.error)) setMasAbierto(true);
      }
    });
  }

  const resumen = resumenMasDatos(cond, [...(observaciones.trim() ? ["observaciones"] : []), ...(aprobar ? ["aprobación gerencial"] : [])]);
  const celda = "flex flex-col gap-1.5";
  const etiqueta = "text-[13px] font-medium";
  const total = (t: string, v: string, fuerte = false) => <div className={`flex justify-between ${fuerte ? "border-t border-linea pt-2 text-[19px] font-semibold" : ""}`}><dt className={fuerte ? "" : "text-gris-600"}>{t}</dt><dd className="tabular-nums">{v}</dd></div>;
  const plazo = (
    <div className={celda}>
      <label htmlFor="diasCredito" className={etiqueta}>Plazo (días)</label>
      <input id="diasCredito" inputMode="numeric" value={diasCredito} onChange={(e) => setDiasCredito(e.target.value)} className={claseControl} />
    </div>
  );

  return (
    <form onSubmit={(e) => e.preventDefault()} onKeyDown={enterEnFormulario} className="flex flex-col gap-4">
      {error ? <Aviso tono="error">{error}</Aviso> : null}
      {fijo ? <Aviso tono="marca">Facturando el pedido {pedido.etiqueta}: se usan sus líneas y precios.</Aviso> : null}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <Tarjeta className="flex flex-col gap-4 p-4" recortar={false}>
            <div className="grid gap-x-4 gap-y-3 md:grid-cols-2 xl:grid-cols-4">
              <div className={`${celda} xl:col-span-2`}>
                <label htmlFor="clienteId" className={etiqueta}>Cliente</label>
                <SelectorTercero tipo="cliente" id="clienteId" valor={clienteId} opciones={clientes} requerido deshabilitado={fijo} placeholder="Cédula, RIF o nombre…" onCambio={(v) => { setClienteId(v); setDiasCredito(String(cond.elegirCliente(v))); }} onElegido={() => avanzarDesde("clienteId")} />
              </div>
              {fijo ? plazo : <CamposBasicos cond={cond} datos={ventas} onCondicion={(dias) => setDiasCredito(String(dias))} plazo={plazo} />}
              <div className={celda}>
                <label htmlFor="almacenId" className={etiqueta}>Almacén de salida</label>
                <select id="almacenId" value={almacenId} onChange={(e) => setAlmacenId(e.target.value)} required className={`${claseControl} pr-9`}>
                  <option value="">Elegir…</option>
                  {almacenes.map((a) => <option key={a.valor} value={a.valor}>{a.etiqueta}</option>)}
                </select>
              </div>
              <div className={celda}>
                <span className={etiqueta}>Fecha</span>
                <p className="flex h-10 items-center rounded-[9px] border border-linea bg-neutro-suave/40 px-3 text-sm">{fecha}</p>
              </div>
            </div>
            <MasDatos abierto={masAbierto} onAlternar={() => setMasAbierto((x) => !x)} resumen={fijo ? resumen.filter((x) => x === "observaciones" || x === "aprobación gerencial") : resumen}>
              <div className={`${celda} md:col-span-2 xl:col-span-4`}>
                <label htmlFor="observaciones" className={etiqueta}>Observaciones</label>
                <input id="observaciones" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} maxLength={1000} className={claseControl} />
              </div>
              {fijo ? null : <CamposMas cond={cond} datos={ventas} />}
              {puedeAprobar ? (
                <div className="flex flex-col gap-2 md:col-span-2 xl:col-span-4">
                  <span className={etiqueta}>Aprobación gerencial</span>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={aprobar} onChange={(e) => setAprobar(e.target.checked)} className="size-4 accent-marca-fuerte" /> Aprobar las excepciones de crédito de esta factura (moroso, sin crédito, límite o vencidas)</label>
                  {aprobar ? (
                    <div className="flex max-w-xl flex-col gap-1.5">
                      <label htmlFor="motivoAprobacion" className={etiqueta}>Motivo de la aprobación</label>
                      <input id="motivoAprobacion" value={motivoAprobacion} onChange={(e) => setMotivoAprobacion(e.target.value)} maxLength={300} className={claseControl} />
                      <p className="text-[12.5px] text-gris-500">Queda en la factura y en la auditoría con tu nombre. Un cliente bloqueado no se puede aprobar.</p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </MasDatos>
          </Tarjeta>

          <Articulos>
            {fijo ? null : <CapturaArticulo buscar={(q) => buscarProductosFactura(q, cond.lista)} lineas={lineas} onCambio={setLineas} puedeCambiarPrecio={puedeCambiarPrecio} descuentoGlobal={global} almacenes={almacenes} onEnterVacio={irACobrar} />}
            <TablaLineas lineas={lineas} onQuitar={fijo ? undefined : (i) => setLineas((ls) => ls.filter((_x, k) => k !== i))} descuentoGlobal={global} vacio="Busca y agrega los productos de la factura." almacenes={almacenes} />
          </Articulos>
        </div>

        <div className="flex flex-col gap-4 xl:sticky xl:top-4">
          <Tarjeta className="p-4">
            <dl className="flex flex-col gap-1.5 text-[14px]">
              {total("Sub-total", formatoUsd(bruto))}
              {total("Descuentos", formatoUsd(descuentos))}
              {total("Base", formatoUsd(totales.subtotal))}
              {total("Total de productos", formatoCantidad(unidades))}
              {total("IVA", formatoUsd(totales.iva))}
              {total("Neto USD", formatoUsd(totales.total), true)}
              {totalBs !== null ? <div className="flex justify-between text-[17px] font-semibold text-marca-fuerte"><dt>Neto Bs.</dt><dd className="tabular-nums">{formatoUsd(totalBs)}</dd></div> : <p className="text-[12.5px] text-error">No hay tasa del dólar cargada.</p>}
            </dl>
          </Tarjeta>

          <Tarjeta className="p-4" recortar={false}>
            <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-gris-600">Cobro</h3>
            {cobra ? (
              <PanelCobro pagos={pagos} onCambio={setPagos} cuentas={cuentas} totalUsd={totales.total} totalBs={totalBs ?? 0} tasa={tasa} monedaVuelto={monedaVuelto} onMonedaVuelto={(x) => { setMonedaVuelto(x); setCajaVueltoId(""); }} cajaVueltoId={cajaVueltoId} onCajaVuelto={setCajaVueltoId} onCubierto={irAConfirmar} />
            ) : (
              <p className="text-[13px] text-gris-600">{!contado ? "Venta a crédito: se cobra después en Cuentas por cobrar." : !puedeCobrar ? "No tienes permiso para registrar cobros: la factura queda por cobrar en Cuentas por cobrar." : "Carga la tasa del dólar para poder cobrar."}</p>
            )}
          </Tarjeta>

          <div className="flex items-center gap-3">
            <button id="confirmar-factura" type="button" onClick={emitir} disabled={pendiente} className={`${clasesBoton("primario")} flex-1 justify-center`}><Check className="size-4" aria-hidden />{pendiente ? "Emitiendo…" : cobra ? "Confirmar y cobrar" : "Emitir factura"}</button>
            <Link href={fijo ? `/pedidos/${pedido.id}` : "/facturacion"} className="px-2 text-sm text-gris-700 hover:text-tinta">Cancelar</Link>
          </div>
        </div>
      </div>
    </form>
  );
}
