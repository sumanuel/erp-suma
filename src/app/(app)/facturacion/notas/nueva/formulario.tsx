"use client";

import Link from "next/link";
import { useState, useTransition, type KeyboardEvent } from "react";
import { Aviso, Tarjeta, clasesBoton, claseControl } from "@/components/ui";
import type { CuentaCobro } from "@/components/ventas/panel-cobro";
import { PanelReintegro, resumirReintegro, type ReintegroCapturado } from "@/components/ventas/panel-reintegro";
import { calcularLinea } from "@/lib/notas/estados";
import { emitirNotaVenta } from "../../acciones";
import { formatoCantidad, formatoUsd } from "../../formato";

type LineaFactura = { id: string; codigo: string; descripcion: string; vendida: number; devolvible: number; precio: number; descuento: number; iva: number };
export type FacturaDeNota = {
  id: string; numero: string; cliente: string; saldo: number; total: number; tasa: number; almacenId: string; numeroFiscal: string | null; consumidorFinal: boolean;
  /// Lo que el cliente pagó y no se le ha devuelto (USD), y cómo lo pagó.
  pagado: number; pagos: string[]; monedaPago: "USD" | "VES";
};
const num = (s: string) => {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const r4 = (n: number) => Math.round(n * 10000) / 10000;

/**
 * Nota de crédito (devolución de mercancía o ajuste de monto) o de débito (cargo) sobre una factura. En la devolución (original: Devolución
 * Total o Parcial) se indica cuánto vuelve de cada artículo, al precio de la factura; si eso ya estaba cobrado, cómo se le devuelve el
 * dinero. El servidor recalcula y valida todo.
 */
export function FormularioNotaVenta({ tipo, modoInicial, factura, lineas, almacenes, alicuotas, cuentas, puedeTotal, puedeReintegrar }: {
  tipo: "CREDITO" | "DEBITO"; modoInicial: "DEVOLUCION" | "AJUSTE"; factura: FacturaDeNota; lineas: LineaFactura[]; almacenes: { valor: string; etiqueta: string }[]; alicuotas: number[];
  cuentas: CuentaCobro[]; puedeTotal: boolean; puedeReintegrar: boolean;
}) {
  const [modo, setModo] = useState<"DEVOLUCION" | "AJUSTE">(modoInicial);
  const [motivo, setMotivo] = useState("");
  const [almacenId, setAlmacenId] = useState(almacenes.some((a) => a.valor === factura.almacenId) ? factura.almacenId : "");
  const [cant, setCant] = useState<Record<string, string>>({});
  const [base, setBase] = useState("");
  const [iva, setIva] = useState(String(alicuotas.find((a) => a > 0) ?? 0));
  const [reintegros, setReintegros] = useState<ReintegroCapturado[]>([]);
  const [saldoAFavor, setSaldoAFavor] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const credito = tipo === "CREDITO";
  const devolucion = credito && modo === "DEVOLUCION";

  let subtotal = 0, ivaMonto = 0;
  if (devolucion) {
    for (const l of lineas) { const c = calcularLinea({ cantidad: num(cant[l.id] ?? ""), costoUnitario: l.precio, descuento: l.descuento, ivaPorcentaje: l.iva }); subtotal += c.neto; ivaMonto += c.iva; }
  } else { subtotal = num(base); ivaMonto = (subtotal * Number(iva)) / 100; }
  const total = r4(subtotal + ivaMonto);

  const quedaAlgo = lineas.some((l) => l.devolvible > 0);
  const excedidas = devolucion ? lineas.filter((l) => num(cant[l.id] ?? "") > l.devolvible + 1e-9) : [];
  const esTotal = devolucion && quedaAlgo && lineas.every((l) => num(cant[l.id] ?? "") >= l.devolvible - 1e-9);
  const sobra = r4(total - factura.saldo);
  const porDevolver = devolucion && sobra >= 0.005 ? sobra : 0;
  const bajaDeuda = devolucion ? Math.min(total, factura.saldo) : 0;
  const resumen = resumirReintegro(reintegros, porDevolver, factura.tasa);

  const enfocar = (id: string) => requestAnimationFrame(() => {
    const el = document.getElementById(id);
    el?.focus();
    if (el instanceof HTMLInputElement) el.select();
  });
  const idCantidad = (i: number) => `devolver-${i}`;
  /** De una cantidad a la siguiente que admita devolución; después, al reintegro o a emitir. */
  function siguienteCantidad(desde: number) {
    const i = lineas.findIndex((l, k) => k > desde && l.devolvible > 0);
    enfocar(i >= 0 ? idCantidad(i) : porDevolver > 0 && resumen.faltaBs > 0 && puedeReintegrar ? "reintegro-monto" : "emitir-nota");
  }
  // Enter no emite la nota desde un campo.
  const sinEnviar = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key === "Enter" && !e.defaultPrevented && (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement)) e.preventDefault();
  };

  function devolverTodo() {
    setCant(Object.fromEntries(lineas.filter((l) => l.devolvible > 0).map((l) => [l.id, String(l.devolvible)])));
    setReintegros([]);
    enfocar("motivo");
  }

  function emitir() {
    setError(null);
    if (motivo.trim().length < 3) { setError("Escribe el motivo de la nota."); enfocar("motivo"); return; }
    if (devolucion) {
      if (excedidas.length) { setError(`${excedidas[0].codigo}: solo se pueden devolver ${formatoCantidad(excedidas[0].devolvible)}.`); return; }
      if (!almacenId) { setError("Elige el almacén al que regresa la mercancía."); enfocar("almacenId"); return; }
      if (porDevolver > 0 && (resumen.seExcede || (resumen.faltaBs > 0 && !saldoAFavor))) { setError("Indica cómo se le devuelve el dinero al cliente, o deja el resto como saldo a favor."); enfocar("reintegro-monto"); return; }
    }
    const aviso = porDevolver > 0
      ? `\n\nSe devuelven ${formatoUsd(porDevolver)} USD al cliente${reintegros.length ? `: ${reintegros.map((x) => `${formatoUsd(x.monto)} ${x.moneda === "VES" ? "Bs." : "USD"}`).join(" + ")}` : ""}${saldoAFavor && resumen.faltaUsd > 0 ? `${reintegros.length ? " y" : ":"} ${formatoUsd(resumen.faltaUsd)} USD quedan a su favor` : ""}.`.replace(/..$/, ".")
      : "";
    const que = devolucion ? `la devolución ${esTotal ? "TOTAL" : "parcial"} de ${factura.numero}` : `la nota de ${credito ? "crédito" : "débito"}`;
    if (!confirm(`¿Emitir ${que} por ${formatoUsd(total)} USD? No se puede editar (solo anular).${aviso}`)) return;
    iniciar(async () => {
      const comun = { facturaId: factura.id, motivo };
      const r = await emitirNotaVenta(
        devolucion
          ? { ...comun, tipo: "CREDITO", modo: "DEVOLUCION", almacenId, lineas: lineas.map((l) => ({ facturaLineaId: l.id, cantidad: num(cant[l.id] ?? "") })).filter((l) => l.cantidad > 0), reintegros: porDevolver > 0 ? reintegros : [], saldoAFavor: porDevolver > 0 && saldoAFavor }
          : { ...comun, tipo, modo: credito ? "AJUSTE" : "CARGO", base: num(base), ivaPorcentaje: Number(iva) },
      );
      if (r?.error) setError(r.error);
    });
  }

  const bloqueo = !devolucion ? null
    : !quedaAlgo ? "Esta factura ya se devolvió completa."
    : esTotal && !puedeTotal ? "La devolución total necesita aprobación gerencial: pídele a quien la tenga que la haga."
    : porDevolver > 0 && !puedeReintegrar ? "Lo que se devuelve ya estaba cobrado: se necesita permiso de Cuentas por cobrar para entregar el dinero."
    : null;
  const fila = (t: string, v: string, fuerte = false) => <div className={`flex justify-between ${fuerte ? "border-t border-linea pt-1 text-[15px] font-semibold" : ""}`}><dt className={fuerte ? "" : "text-gris-600"}>{t}</dt><dd className="tabular-nums">{v}</dd></div>;

  return (
    <form onSubmit={(e) => { e.preventDefault(); emitir(); }} onKeyDown={sinEnviar} className="flex flex-col gap-4">
      {error ? <Aviso tono="error">{error}</Aviso> : null}
      {bloqueo ? <Aviso tono="aviso">{bloqueo}</Aviso> : null}
      <Tarjeta className="p-5">
        <h2 className="text-lg font-semibold">{devolucion ? "Devolución" : credito ? "Nota de crédito" : "Nota de débito"} sobre {factura.numero}</h2>
        <p className="text-sm text-gris-600">{factura.cliente} · total {formatoUsd(factura.total)} USD · saldo pendiente {formatoUsd(factura.saldo)} USD</p>
        {devolucion ? (
          <p className="mt-1 text-[13px] text-gris-600">{factura.pagos.length ? `Pagó: ${factura.pagos.join(" · ")}.` : "Todavía no se ha cobrado nada de esta factura."}{factura.numeroFiscal ? ` Nº fiscal ${factura.numeroFiscal}.` : " No tiene número fiscal registrado."}</p>
        ) : null}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {credito ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="modo" className="text-[13px] font-medium">Tipo de crédito</label>
              <select id="modo" value={modo} onChange={(e) => setModo(e.target.value as "DEVOLUCION" | "AJUSTE")} className={`${claseControl} pr-9`}>
                <option value="DEVOLUCION">Devolución de mercancía</option><option value="AJUSTE">Ajuste de monto (descuento o corrección)</option>
              </select>
            </div>
          ) : null}
          {devolucion ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="almacenId" className="text-[13px] font-medium">Almacén al que regresa</label>
              <select id="almacenId" value={almacenId} onChange={(e) => setAlmacenId(e.target.value)} className={`${claseControl} pr-9`}>
                <option value="">Elegir…</option>{almacenes.map((a) => <option key={a.valor} value={a.valor}>{a.etiqueta}</option>)}
              </select>
            </div>
          ) : null}
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <label htmlFor="motivo" className="text-[13px] font-medium">Motivo</label>
            <input id="motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (devolucion) { if (total > 0) siguienteCantidad(lineas.length); else siguienteCantidad(-1); } else enfocar("base"); } }} maxLength={300} autoFocus className={claseControl} />
          </div>
        </div>
      </Tarjeta>

      <div className={`grid items-start gap-4 ${porDevolver > 0 && puedeReintegrar ? "xl:grid-cols-[minmax(0,1fr)_22rem]" : ""}`}>
        <Tarjeta>
          {devolucion ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-linea p-3">
                <p className="text-[13px] text-gris-600">Escribe cuánto se devuelve de cada artículo (Enter pasa al siguiente).</p>
                <div className="flex gap-2">
                  <button type="button" onClick={devolverTodo} disabled={!quedaAlgo || !puedeTotal} title={puedeTotal ? undefined : "La devolución total necesita aprobación gerencial"} className={clasesBoton("secundario")}>Devolver todo</button>
                  <button type="button" onClick={() => { setCant({}); setReintegros([]); }} disabled={total === 0} className={clasesBoton("secundario")}>Limpiar</button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[13.5px]">
                  <thead><tr className="border-b border-linea text-[12.5px] text-gris-600"><th className="px-4 py-3 font-medium">Producto</th><th className="px-3 py-3 text-right font-medium">Vendida</th><th className="px-3 py-3 text-right font-medium">Ya devuelta</th><th className="px-3 py-3 text-right font-medium">Queda</th><th className="px-3 py-3 text-right font-medium">Precio USD</th><th className="px-3 py-3 text-right font-medium">Desc. %</th><th className="px-3 py-3 text-right font-medium">Devolver</th><th className="px-4 py-3 text-right font-medium">Total USD</th></tr></thead>
                  <tbody>
                    {lineas.map((l, i) => {
                      const pedida = num(cant[l.id] ?? "");
                      const mal = pedida > l.devolvible + 1e-9;
                      return (
                        <tr key={l.id} className={`border-b border-linea last:border-0 ${l.devolvible <= 0 ? "text-gris-500" : ""}`}>
                          <td className="px-4 py-2"><span className="font-semibold">{l.codigo}</span> · {l.descripcion}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatoCantidad(l.vendida)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatoCantidad(r4(l.vendida - l.devolvible))}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatoCantidad(l.devolvible)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatoUsd(l.precio)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatoCantidad(l.descuento)}</td>
                          <td className="px-3 py-2 text-right"><input id={idCantidad(i)} aria-label={`Devolver de ${l.codigo}`} aria-invalid={mal || undefined} inputMode="decimal" disabled={l.devolvible <= 0} value={cant[l.id] ?? ""} onChange={(e) => { setCant((c) => ({ ...c, [l.id]: e.target.value })); setReintegros([]); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); siguienteCantidad(i); } }} className={`${claseControl} w-24 text-right ${mal ? "!border-error" : ""}`} /></td>
                          <td className="px-4 py-2 text-right tabular-nums">{pedida > 0 ? formatoUsd(calcularLinea({ cantidad: pedida, costoUnitario: l.precio, descuento: l.descuento, ivaPorcentaje: l.iva }).total) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="grid gap-4 p-6 md:grid-cols-2">
              <div className="flex flex-col gap-1.5"><label htmlFor="base" className="text-[13px] font-medium">Monto sin IVA (USD)</label><input id="base" inputMode="decimal" value={base} onChange={(e) => setBase(e.target.value)} className={claseControl} /></div>
              <div className="flex flex-col gap-1.5"><label htmlFor="iva" className="text-[13px] font-medium">Alícuota de IVA</label>
                <select id="iva" value={iva} onChange={(e) => setIva(e.target.value)} className={`${claseControl} pr-9`}>{alicuotas.map((a) => <option key={a} value={a}>{a === 0 ? "Exento (0 %)" : `${a} %`}</option>)}</select>
              </div>
            </div>
          )}
          <dl className="ml-auto flex w-full max-w-xs flex-col gap-1 p-4 text-[13.5px]">
            {fila("Subtotal", formatoUsd(subtotal))}
            {fila("IVA", formatoUsd(ivaMonto))}
            {fila("Total USD", `${credito ? "−" : ""}${formatoUsd(total)}`, true)}
            {devolucion && total > 0 ? (
              <>
                {fila("Total Bs. (tasa de la factura)", formatoUsd(Math.round(total * factura.tasa * 100) / 100))}
                {bajaDeuda > 0 ? fila("Se descuenta de lo que debe", formatoUsd(bajaDeuda)) : null}
                {porDevolver > 0 ? fila("Hay que devolverle USD", formatoUsd(porDevolver), true) : null}
              </>
            ) : null}
          </dl>
        </Tarjeta>

        {porDevolver > 0 && puedeReintegrar ? (
          <Tarjeta className="p-4" recortar={false}>
            <h3 className="mb-1 text-[13px] font-semibold uppercase tracking-wide text-gris-600">Reintegro</h3>
            <p className="mb-3 text-[13px] text-gris-600">{formatoUsd(porDevolver)} USD = {formatoUsd(Math.round(porDevolver * factura.tasa * 100) / 100)} Bs.</p>
            <PanelReintegro reintegros={reintegros} onCambio={setReintegros} cuentas={cuentas} porDevolverUsd={porDevolver} tasa={factura.tasa} monedaInicial={factura.monedaPago} saldoAFavor={saldoAFavor} onSaldoAFavor={setSaldoAFavor} admiteSaldoAFavor={!factura.consumidorFinal} onCompleto={() => enfocar("emitir-nota")} />
          </Tarjeta>
        ) : null}
      </div>

      <p className="text-[12.5px] text-gris-500">La nota usa la tasa de la factura original. {devolucion ? "Primero baja lo que el cliente debe; lo que ya había pagado se le devuelve." : credito ? "Un ajuste de crédito no puede superar lo que aún se debe de la factura." : "Un débito aumenta lo que el cliente debe."}</p>
      <div className="flex items-center gap-3">
        <button id="emitir-nota" data-guardar="propio" type="submit" disabled={pendiente || total <= 0 || !!bloqueo} className={clasesBoton("primario")}>{pendiente ? "Emitiendo…" : devolucion ? "Emitir devolución" : credito ? "Emitir nota de crédito" : "Emitir nota de débito"}</button>
        <Link data-salir href={`/facturacion/${factura.id}`} className="px-2 text-sm text-gris-700 hover:text-tinta">Cancelar</Link>
      </div>
    </form>
  );
}
