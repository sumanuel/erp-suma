"use client";

import Link from "next/link";
import { SelectorBuscable } from "@/components/selector-buscable";
import { SelectorTercero } from "@/components/selector-tercero";
import { Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Aviso, Tarjeta, clasesBoton, claseControl } from "@/components/ui";
import { registrarFacturaProveedor } from "../../acciones";

const num = (s: string) => {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const r4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;
const fmt = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

type Opc = { valor: string; etiqueta: string };
type Fila = { porcentaje: string; base: string; iva: string };
export type CatalogosFacturaProveedor = {
  proveedores: (Opc & { condicionPagoId: string; diasCredito: number })[];
  ordenes: { valor: string; proveedorId: string; etiqueta: string }[];
  condiciones: (Opc & { dias: number })[];
  transportes: Opc[];
  centros: Opc[];
  cuentas: Opc[];
};

/**
 * Registro del documento de un proveedor por sus montos en USD, con el desglose por alícuota (exento, reducida, general…), las fechas de emisión,
 * recepción y del libro de compras, y la cuenta contable de la base cuando no es mercancía. La orden de compra es opcional y solo sirve de referencia.
 */
export function FormularioFacturaProveedor({ hoy, catalogos }: { hoy: string; catalogos: CatalogosFacturaProveedor }) {
  const [proveedorId, setProveedorId] = useState("");
  const [ordenId, setOrdenId] = useState("");
  const [documento, setDocumento] = useState("");
  const [numeroControl, setNumeroControl] = useState("");
  const [tipoDocumento, setTipoDocumento] = useState("FACTURA");
  const [fecha, setFecha] = useState(hoy);
  const [fechaRecepcion, setFechaRecepcion] = useState("");
  const [fechaLibro, setFechaLibro] = useState("");
  const [diasCredito, setDiasCredito] = useState("0");
  const [condicionPagoId, setCondicionPagoId] = useState("");
  const [transporteId, setTransporteId] = useState("");
  const [centroCostoId, setCentroCostoId] = useState("");
  const [cuentaGastoId, setCuentaGastoId] = useState("");
  const [recibidoPor, setRecibidoPor] = useState("");
  const [planillaImportacion, setPlanillaImportacion] = useState("");
  const [filas, setFilas] = useState<Fila[]>([{ porcentaje: "16", base: "", iva: "0" }]);
  const [observaciones, setObservaciones] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  const base = r4(filas.reduce((s, f) => s + num(f.base), 0));
  const iva = r4(filas.reduce((s, f) => s + num(f.iva), 0));
  const total = r4(base + iva);
  const delProveedor = catalogos.ordenes.filter((o) => o.proveedorId === proveedorId);
  const cambiar = (i: number, campo: keyof Fila, v: string) => setFilas((x) => x.map((f, k) => (k === i ? { ...f, [campo]: v } : f)));

  function elegirProveedor(id: string) {
    setProveedorId(id);
    setOrdenId("");
    const p = catalogos.proveedores.find((x) => x.valor === id);
    if (p) {
      setCondicionPagoId(p.condicionPagoId);
      setDiasCredito(String(p.condicionPagoId ? (catalogos.condiciones.find((c) => c.valor === p.condicionPagoId)?.dias ?? p.diasCredito) : p.diasCredito));
    }
  }

  function guardar() {
    setError(null);
    iniciar(async () => {
      const r = await registrarFacturaProveedor({
        proveedorId, ordenId, documento, tipoDocumento, numeroControl, fecha, fechaRecepcion, fechaLibro, diasCredito: Math.trunc(num(diasCredito)), observaciones, recibidoPor, planillaImportacion,
        condicionPagoId, transporteId, centroCostoId, cuentaGastoId,
        desglose: filas.map((f) => ({ porcentaje: num(f.porcentaje), base: num(f.base), iva: num(f.iva) })).filter((f) => f.base > 0 || f.iva > 0),
      });
      if (r?.error) setError(r.error);
    });
  }
  const campo = "flex flex-col gap-1.5";
  const et = "text-[13px] font-medium";
  const opc = <span className="font-normal text-gris-500"> (opcional)</span>;

  return (
    <form onSubmit={(e) => { e.preventDefault(); guardar(); }} className="flex flex-col gap-6">
      {error ? <Aviso tono="error">{error}</Aviso> : null}
      <Tarjeta className="p-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className={`${campo} xl:col-span-2`}>
            <label htmlFor="proveedorId" className={et}>Proveedor</label>
            <SelectorTercero tipo="proveedor" id="proveedorId" valor={proveedorId} opciones={catalogos.proveedores} requerido placeholder="Buscar proveedor por nombre o RIF…" onCambio={elegirProveedor} />
          </div>
          <div className={`${campo} xl:col-span-2`}>
            <label htmlFor="ordenId" className={et}>Orden de compra{opc}</label>
            <select id="ordenId" value={ordenId} onChange={(e) => setOrdenId(e.target.value)} disabled={!proveedorId} className={`${claseControl} pr-9`}>
              <option value="">Sin orden</option>{delProveedor.map((o) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
            </select>
          </div>
          <div className={campo}><label htmlFor="documento" className={et}>Nº de factura del proveedor</label><input id="documento" value={documento} onChange={(e) => setDocumento(e.target.value)} required maxLength={60} className={claseControl} /></div>
          <div className={campo}><label htmlFor="tipoDocumento" className={et}>Tipo de documento</label><select id="tipoDocumento" value={tipoDocumento} onChange={(e) => setTipoDocumento(e.target.value)} className={`${claseControl} pr-9`}><option value="FACTURA">Factura</option><option value="PAGARE">Pagaré</option><option value="OTRO">Otro documento por pagar</option></select></div>
          <div className={campo}><label htmlFor="numeroControl" className={et}>Nº de control{opc}</label><input id="numeroControl" value={numeroControl} onChange={(e) => setNumeroControl(e.target.value)} maxLength={60} className={claseControl} /></div>
          <div className={campo}><label htmlFor="fecha" className={et}>Fecha de emisión</label><input id="fecha" type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} required className={claseControl} /></div>
          <div className={campo}><label htmlFor="fechaRecepcion" className={et}>Fecha de recepción{opc}</label><input id="fechaRecepcion" type="date" value={fechaRecepcion} min={fecha} max={hoy} onChange={(e) => setFechaRecepcion(e.target.value)} className={claseControl} /></div>
          <div className={campo}>
            <label htmlFor="fechaLibro" className={et}>Fecha del libro de compras{opc}</label>
            <input id="fechaLibro" type="date" value={fechaLibro} min={fecha} onChange={(e) => setFechaLibro(e.target.value)} className={claseControl} />
            <p className="text-[12.5px] text-gris-500">Define el período fiscal; vacío = la de emisión.</p>
          </div>
          <div className={campo}>
            <label htmlFor="condicionPagoId" className={et}>Condición de pago{opc}</label>
            <select id="condicionPagoId" value={condicionPagoId} onChange={(e) => { setCondicionPagoId(e.target.value); const c = catalogos.condiciones.find((x) => x.valor === e.target.value); if (c) setDiasCredito(String(c.dias)); }} className={`${claseControl} pr-9`}>
              <option value="">Sin condición</option>{catalogos.condiciones.map((c) => <option key={c.valor} value={c.valor}>{c.etiqueta}</option>)}
            </select>
          </div>
          <div className={campo}><label htmlFor="diasCredito" className={et}>Días de crédito</label><input id="diasCredito" inputMode="numeric" value={diasCredito} onChange={(e) => setDiasCredito(e.target.value)} className={claseControl} /></div>
          <div className={campo}>
            <label htmlFor="transporteId" className={et}>Transporte{opc}</label>
            <select id="transporteId" value={transporteId} onChange={(e) => setTransporteId(e.target.value)} className={`${claseControl} pr-9`}><option value="">Sin transporte</option>{catalogos.transportes.map((t) => <option key={t.valor} value={t.valor}>{t.etiqueta}</option>)}</select>
          </div>
          <div className={campo}>
            <label htmlFor="centroCostoId" className={et}>Centro de costo{opc}</label>
            <select id="centroCostoId" value={centroCostoId} onChange={(e) => setCentroCostoId(e.target.value)} className={`${claseControl} pr-9`}><option value="">Sin centro de costo</option>{catalogos.centros.map((t) => <option key={t.valor} value={t.valor}>{t.etiqueta}</option>)}</select>
          </div>
          <div className={campo}><label htmlFor="recibidoPor" className={et}>Recibido por{opc}</label><input id="recibidoPor" value={recibidoPor} onChange={(e) => setRecibidoPor(e.target.value)} maxLength={60} className={claseControl} /></div>
          <div className={campo}><label htmlFor="planillaImportacion" className={et}>Planilla de importación{opc}</label><input id="planillaImportacion" value={planillaImportacion} onChange={(e) => setPlanillaImportacion(e.target.value)} maxLength={30} className={claseControl} /></div>
          <div className={`${campo} md:col-span-2`}>
            <label htmlFor="cuentaGastoId" className={et}>Cuenta contable de la base{opc}</label>
            <select id="cuentaGastoId" value={cuentaGastoId} onChange={(e) => setCuentaGastoId(e.target.value)} className={`${claseControl} pr-9`}>
              <option value="">Compras de mercancía (por defecto)</option>{catalogos.cuentas.map((c) => <option key={c.valor} value={c.valor}>{c.etiqueta}</option>)}
            </select>
            <p className="text-[12.5px] text-gris-500">Para servicios o gastos: la base se contabiliza en esta cuenta en vez de en compras.</p>
          </div>
          <div className={`${campo} md:col-span-2`}><label htmlFor="observaciones" className={et}>Observaciones{opc}</label><input id="observaciones" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} maxLength={1000} className={claseControl} /></div>
        </div>
      </Tarjeta>

      <Tarjeta className="p-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold">Desglose por alícuota (USD)</h3>
          <button type="button" onClick={() => setFilas((x) => [...x, { porcentaje: "0", base: "", iva: "0" }])} className={clasesBoton("secundario")}><Plus className="size-4" aria-hidden />Agregar alícuota</button>
        </div>
        <table className="w-full text-left text-[13.5px]">
          <thead><tr className="border-y border-linea text-[12.5px] text-gris-600"><th className="px-3 py-2.5 font-medium">Alícuota %</th><th className="px-3 py-2.5 text-right font-medium">Base imponible</th><th className="px-3 py-2.5 text-right font-medium">IVA</th><th className="px-3 py-2.5" /></tr></thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={i} className="border-b border-linea last:border-0">
                <td className="px-3 py-2"><input aria-label={`Alícuota de la fila ${i + 1}`} inputMode="decimal" value={f.porcentaje} onChange={(e) => cambiar(i, "porcentaje", e.target.value)} className={`${claseControl} w-24`} /></td>
                <td className="px-3 py-2"><input aria-label={`Base de la fila ${i + 1}`} inputMode="decimal" value={f.base} onChange={(e) => cambiar(i, "base", e.target.value)} className={`${claseControl} ml-auto w-36 text-right`} /></td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-2">
                    <button type="button" onClick={() => cambiar(i, "iva", String(Math.round(num(f.base) * num(f.porcentaje)) / 100))} className="text-[12.5px] text-marca-texto hover:underline">Calcular</button>
                    <input aria-label={`IVA de la fila ${i + 1}`} inputMode="decimal" value={f.iva} onChange={(e) => cambiar(i, "iva", e.target.value)} className={`${claseControl} w-32 text-right`} />
                  </div>
                </td>
                <td className="px-3 py-2 text-right">{filas.length > 1 ? <button type="button" aria-label={`Quitar fila ${i + 1}`} onClick={() => setFilas((x) => x.filter((_, k) => k !== i))} className="inline-flex size-9 items-center justify-center rounded-[9px] border border-[#f3c7c2] text-error hover:bg-[#fdf0ef]"><Trash2 className="size-4" aria-hidden /></button> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[12.5px] text-gris-500">Una fila al 0 % es la base exenta o no gravada. Cada alícuota va una sola vez.</p>
        <dl className="ml-auto mt-3 flex w-full max-w-xs flex-col gap-1 text-[13.5px]">
          <div className="flex justify-between"><dt className="text-gris-600">Base</dt><dd className="tabular-nums">{fmt(base)}</dd></div>
          <div className="flex justify-between"><dt className="text-gris-600">IVA</dt><dd className="tabular-nums">{fmt(iva)}</dd></div>
          <div className="flex justify-between border-t border-linea pt-1 text-[15px] font-semibold"><dt>Total USD</dt><dd className="tabular-nums">{fmt(total)}</dd></div>
        </dl>
      </Tarjeta>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pendiente} className={clasesBoton("primario")}>{pendiente ? "Registrando…" : "Registrar factura"}</button>
        <Link href="/cxp/facturas" className="px-2 text-sm text-gris-700 hover:text-tinta">Cancelar</Link>
      </div>
    </form>
  );
}
