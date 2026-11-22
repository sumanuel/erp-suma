"use client";

import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Aviso, Tarjeta, clasesBoton, claseControl } from "@/components/ui";
import { FORMAS_PAGO } from "@/lib/cxc/estados";
import { registrarReciboCliente } from "../../acciones";

type FacturaAbierta = { id: string; numero: string; vence: string; saldo: number };
type Cuenta = { id: string; moneda: "USD" | "VES"; etiqueta: string };
type Opc = { valor: string; etiqueta: string };
type Pago = { formaPago: string; moneda: "USD" | "VES"; monto: string; cuentaId: string; referencia: string; bancoChequeId: string; numeroCheque: string; fechaCheque: string };

const fmt = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const num = (s: string) => {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const pagoVacio = (): Pago => ({ formaPago: "TRANSFERENCIA", moneda: "USD", monto: "", cuentaId: "", referencia: "", bancoChequeId: "", numeroCheque: "", fechaCheque: "" });

/**
 * Recibo de ingreso: reparte lo que paga el cliente entre sus facturas abiertas, con una o varias formas de pago (cada una con su moneda y cuenta).
 * Lo aplicado se lleva en USD; los pagos deben sumar lo aplicado a la tasa de hoy.
 */
export function FormularioCobro({ clienteId, clienteNombre, facturas, tasa, cuentas, cobradores, cobradorInicial, bancos, hoy }: {
  clienteId: string; clienteNombre: string; facturas: FacturaAbierta[]; tasa: number | null; cuentas: Cuenta[]; cobradores: Opc[]; cobradorInicial: string; bancos: Opc[]; hoy: string;
}) {
  const [montos, setMontos] = useState<Record<string, string>>({});
  const [pagos, setPagos] = useState<Pago[]>([pagoVacio()]);
  const [fecha, setFecha] = useState(hoy);
  const [cobradorId, setCobradorId] = useState(cobradorInicial);
  const [comprobante, setComprobante] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  const total = Math.round(facturas.reduce((s, f) => s + num(montos[f.id] ?? ""), 0) * 10000) / 10000;
  const enBs = tasa ? r2(total * tasa) : null;
  const pagadoUsd = pagos.reduce((s, p) => s + (p.moneda === "USD" ? num(p.monto) : tasa ? num(p.monto) / tasa : 0), 0);
  const difUsd = Math.round((pagadoUsd - total) * 10000) / 10000;
  const cambiar = (i: number, campo: keyof Pago, v: string) => setPagos((x) => x.map((p, k) => (k === i ? { ...p, [campo]: v, ...(campo === "moneda" ? { cuentaId: "" } : {}) } : p)));
  /** Propone en el pago `i` lo que falta por cubrir con los otros pagos. */
  const completar = (i: number) => {
    const otros = pagos.reduce((s, p, k) => (k === i ? s : s + (p.moneda === "USD" ? num(p.monto) : tasa ? num(p.monto) / tasa : 0)), 0);
    const falta = Math.max(0, total - otros);
    cambiar(i, "monto", pagos[i].moneda === "USD" ? String(r2(falta)) : tasa ? String(r2(falta * tasa)) : "");
  };

  function guardar() {
    setError(null);
    iniciar(async () => {
      const r = await registrarReciboCliente({
        clienteId, fecha, cobradorId, numeroComprobante: comprobante, observaciones,
        pagos: pagos.map((p) => ({ ...p, monto: num(p.monto) })),
        aplicaciones: facturas.map((f) => ({ facturaId: f.id, montoUsd: num(montos[f.id] ?? "") })).filter((a) => a.montoUsd > 0),
      });
      if (r?.error) setError(r.error);
    });
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); guardar(); }} className="flex flex-col gap-6">
      {error ? <Aviso tono="error">{error}</Aviso> : null}
      <Tarjeta className="p-6">
        <p className="mb-4 text-sm text-gris-600">Cliente: <span className="font-semibold text-tinta">{clienteNombre}</span></p>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="fecha" className="text-[13px] font-medium">Fecha del recibo</label>
            <input id="fecha" type="date" max={hoy} value={fecha} onChange={(e) => setFecha(e.target.value)} required className={claseControl} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="cobradorId" className="text-[13px] font-medium">Cobrador <span className="font-normal text-gris-500">(opcional)</span></label>
            <select id="cobradorId" value={cobradorId} onChange={(e) => setCobradorId(e.target.value)} className={`${claseControl} pr-9`}>
              <option value="">Sin cobrador</option>{cobradores.map((c) => <option key={c.valor} value={c.valor}>{c.etiqueta}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="comprobante" className="text-[13px] font-medium">N.º de comprobante <span className="font-normal text-gris-500">(opcional)</span></label>
            <input id="comprobante" value={comprobante} onChange={(e) => setComprobante(e.target.value)} maxLength={50} className={claseControl} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="observaciones" className="text-[13px] font-medium">Observaciones <span className="font-normal text-gris-500">(opcional)</span></label>
            <input id="observaciones" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} maxLength={1000} className={claseControl} />
          </div>
        </div>
      </Tarjeta>

      <Tarjeta className="p-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold">Formas de pago</h3>
          <button type="button" onClick={() => setPagos((x) => [...x, pagoVacio()])} className={clasesBoton("secundario")}><Plus className="size-4" aria-hidden />Agregar forma de pago</button>
        </div>
        <div className="flex flex-col gap-4">
          {pagos.map((p, i) => (
            <div key={i} className="rounded-[10px] border border-linea p-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={`forma${i}`} className="text-[13px] font-medium">Forma de pago</label>
                  <select id={`forma${i}`} value={p.formaPago} onChange={(e) => cambiar(i, "formaPago", e.target.value)} className={`${claseControl} pr-9`}>
                    {Object.entries(FORMAS_PAGO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={`moneda${i}`} className="text-[13px] font-medium">Moneda</label>
                  <select id={`moneda${i}`} value={p.moneda} onChange={(e) => cambiar(i, "moneda", e.target.value)} className={`${claseControl} pr-9`}>
                    <option value="USD">Dólares (USD)</option>
                    <option value="VES" disabled={!tasa}>Bolívares (Bs.){tasa ? "" : " — sin tasa cargada"}</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={`monto${i}`} className="text-[13px] font-medium">Monto recibido</label>
                  <div className="flex gap-2">
                    <input id={`monto${i}`} inputMode="decimal" value={p.monto} onChange={(e) => cambiar(i, "monto", e.target.value)} required className={`${claseControl} text-right`} />
                    <button type="button" onClick={() => completar(i)} className="shrink-0 text-[12.5px] text-marca-texto hover:underline">Resto</button>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 xl:col-span-2">
                  <label htmlFor={`cuenta${i}`} className="text-[13px] font-medium">Cuenta donde entra el dinero</label>
                  <select id={`cuenta${i}`} value={p.cuentaId} onChange={(e) => cambiar(i, "cuentaId", e.target.value)} required className={`${claseControl} pr-9`}>
                    <option value="">Elegir…</option>{cuentas.filter((c) => c.moneda === p.moneda).map((c) => <option key={c.id} value={c.id}>{c.etiqueta}</option>)}
                  </select>
                  {cuentas.every((c) => c.moneda !== p.moneda) ? <p className="text-[12.5px] text-error">No hay una cuenta activa en esta moneda: créala en Tesorería.</p> : null}
                </div>
                <div className="flex flex-col gap-1.5 md:col-span-2">
                  <label htmlFor={`ref${i}`} className="text-[13px] font-medium">Referencia (banco, nº de operación)</label>
                  <input id={`ref${i}`} value={p.referencia} onChange={(e) => cambiar(i, "referencia", e.target.value)} maxLength={100} className={claseControl} />
                </div>
                {p.formaPago === "CHEQUE" ? (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor={`bch${i}`} className="text-[13px] font-medium">Banco del cheque</label>
                      <select id={`bch${i}`} value={p.bancoChequeId} onChange={(e) => cambiar(i, "bancoChequeId", e.target.value)} className={`${claseControl} pr-9`}>
                        <option value="">Elegir…</option>{bancos.map((b) => <option key={b.valor} value={b.valor}>{b.etiqueta}</option>)}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor={`nch${i}`} className="text-[13px] font-medium">N.º de cheque</label>
                      <input id={`nch${i}`} value={p.numeroCheque} onChange={(e) => cambiar(i, "numeroCheque", e.target.value)} required maxLength={30} className={claseControl} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor={`fch${i}`} className="text-[13px] font-medium">Fecha del cheque</label>
                      <input id={`fch${i}`} type="date" value={p.fechaCheque} onChange={(e) => cambiar(i, "fechaCheque", e.target.value)} className={claseControl} />
                    </div>
                  </>
                ) : null}
              </div>
              {pagos.length > 1 ? (
                <div className="mt-3 text-right"><button type="button" onClick={() => setPagos((x) => x.filter((_, k) => k !== i))} className="inline-flex items-center gap-1 text-[13px] text-error hover:underline"><Trash2 className="size-4" aria-hidden />Quitar</button></div>
              ) : null}
            </div>
          ))}
        </div>
        <dl className="ml-auto mt-4 flex w-full max-w-sm flex-col gap-1 text-[13.5px]">
          <div className="flex justify-between"><dt className="text-gris-600">Pagado (equivalente USD)</dt><dd className="tabular-nums">{fmt(pagadoUsd)}</dd></div>
          {Math.abs(difUsd) > (tasa ? 0.01 / tasa : 0.005) && total > 0 ? <div className="flex justify-between font-semibold text-error"><dt>{difUsd > 0 ? "Sobra" : "Falta"}</dt><dd className="tabular-nums">{fmt(Math.abs(difUsd))} USD</dd></div> : null}
        </dl>
      </Tarjeta>

      <Tarjeta>
        <h3 className="px-4 pt-4 text-base font-semibold">Aplicar a facturas</h3>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full text-left text-[13.5px]">
            <thead>
              <tr className="border-y border-linea text-[12.5px] text-gris-600">
                <th className="px-4 py-3 font-medium">Factura</th><th className="px-3 py-3 font-medium">Vence</th><th className="px-3 py-3 text-right font-medium">Saldo USD</th><th className="px-4 py-3 text-right font-medium">Aplicar USD</th>
              </tr>
            </thead>
            <tbody>
              {facturas.map((f) => (
                <tr key={f.id} className="border-b border-linea last:border-0">
                  <td className="px-4 py-2 font-semibold">{f.numero}</td>
                  <td className="px-3 py-2">{f.vence.split("-").reverse().join("/")}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(f.saldo)}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-end gap-2">
                      <button type="button" onClick={() => setMontos((m) => ({ ...m, [f.id]: String(f.saldo) }))} className="text-[12.5px] text-marca-texto hover:underline">Saldo</button>
                      <input aria-label={`Aplicar a ${f.numero}`} inputMode="decimal" value={montos[f.id] ?? ""} onChange={(e) => setMontos((m) => ({ ...m, [f.id]: e.target.value }))} className={`${claseControl} w-32 text-right`} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="ml-auto flex w-full max-w-xs flex-col gap-1 p-4 text-[13.5px]">
          <div className="flex justify-between border-t border-linea pt-1 text-[15px] font-semibold"><dt>Total USD</dt><dd className="tabular-nums">{fmt(total)}</dd></div>
          {enBs !== null ? <div className="flex justify-between text-gris-700"><dt>Equivale a (Bs.)</dt><dd className="tabular-nums">{fmt(enBs)}</dd></div> : null}
          {tasa ? <p className="text-[12.5px] text-gris-500">Tasa de hoy: {tasa.toLocaleString("es-VE", { maximumFractionDigits: 8 })}</p> : null}
        </dl>
      </Tarjeta>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pendiente || total <= 0} className={clasesBoton("primario")}>{pendiente ? "Registrando…" : "Registrar recibo"}</button>
        <Link href={`/cxc/cliente/${clienteId}`} className="px-2 text-sm text-gris-700 hover:text-tinta">Cancelar</Link>
      </div>
    </form>
  );
}
