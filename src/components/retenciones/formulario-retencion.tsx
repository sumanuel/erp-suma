"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Aviso, Tarjeta, clasesBoton, claseControl } from "@/components/ui";

type Resultado = { error?: string } | undefined | void;
const num = (s: string) => {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const fmt = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

/**
 * Formulario de retención. `sufrida` pide el comprobante del cliente y su fecha; la practicada usa un comprobante que numera el sistema.
 * El IVA se calcula sobre el IVA de la factura; el ISLR sobre la base imponible (o una menor). El servidor recalcula y valida.
 */
export function FormularioRetencion({ sufrida, hoy, factura, pctInicialIva, volver, guardar, tarifas = [] }: {
  sufrida: boolean; hoy: string; pctInicialIva: number; volver: string;
  /// Conceptos de ISLR del catálogo (tarifas): al elegir uno se propone su porcentaje y su descripción como concepto.
  tarifas?: { codigo: number; descripcion: string; porcentaje: number }[];
  factura: { id: string; etiqueta: string; tercero: string; iva: number; subtotal: number; saldo: number };
  guardar: (datos: unknown) => Promise<Resultado>;
}) {
  const [tipo, setTipo] = useState<"IVA" | "ISLR">(factura.iva > 0 ? "IVA" : "ISLR");
  const [pctIva, setPctIva] = useState(String(pctInicialIva || 75));
  const [pctIslr, setPctIslr] = useState("2");
  const [base, setBase] = useState(String(factura.subtotal));
  const [concepto, setConcepto] = useState("");
  const [comprobante, setComprobante] = useState("");
  const [fecha, setFecha] = useState(hoy);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const pct = num(tipo === "IVA" ? pctIva : pctIslr);
  const baseCalc = tipo === "IVA" ? factura.iva : num(base);
  const monto = Math.round(baseCalc * pct * 100) / 10000;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        iniciar(async () => {
          const r = await guardar({ facturaId: factura.id, tipo, porcentaje: pct, base: tipo === "ISLR" ? num(base) : null, concepto, ...(sufrida ? { comprobante, fecha } : {}) });
          if (r?.error) setError(r.error);
        });
      }}
      className="flex flex-col gap-6"
    >
      {error ? <Aviso tono="error">{error}</Aviso> : null}
      <Tarjeta className="p-6">
        <h2 className="text-lg font-semibold">Retención {sufrida ? "sufrida" : "practicada"} sobre {factura.etiqueta}</h2>
        <p className="text-sm text-gris-600">{factura.tercero} · IVA de la factura {fmt(factura.iva)} USD · base {fmt(factura.subtotal)} USD · saldo {fmt(factura.saldo)} USD</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tipo" className="text-[13px] font-medium">Impuesto</label>
            <select id="tipo" value={tipo} onChange={(e) => setTipo(e.target.value as "IVA" | "ISLR")} className={`${claseControl} pr-9`}>
              <option value="IVA" disabled={factura.iva <= 0}>IVA</option><option value="ISLR">ISLR</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="pct" className="text-[13px] font-medium">Porcentaje retenido {tipo === "IVA" ? "(75 o 100 %)" : ""}</label>
            <input id="pct" inputMode="decimal" value={tipo === "IVA" ? pctIva : pctIslr} onChange={(e) => (tipo === "IVA" ? setPctIva(e.target.value) : setPctIslr(e.target.value))} required className={claseControl} />
          </div>
          {tipo === "ISLR" ? (
            <>
              {tarifas.length > 0 ? (
                <div className="flex flex-col gap-1.5 md:col-span-2">
                  <label htmlFor="tarifa" className="text-[13px] font-medium">Concepto de ISLR (catálogo)</label>
                  <select id="tarifa" defaultValue="" onChange={(e) => { const t = tarifas.find((x) => String(x.codigo) === e.target.value); if (t) { setPctIslr(String(t.porcentaje)); setConcepto(`${t.codigo} · ${t.descripcion}`.slice(0, 120)); } }} className={`${claseControl} pr-9`}>
                    <option value="">Elegir para proponer el porcentaje…</option>
                    {tarifas.map((t) => <option key={t.codigo} value={t.codigo}>{t.codigo} · {t.descripcion} ({t.porcentaje} %)</option>)}
                  </select>
                </div>
              ) : null}
              <div className="flex flex-col gap-1.5"><label htmlFor="base" className="text-[13px] font-medium">Base (USD)</label><input id="base" inputMode="decimal" value={base} onChange={(e) => setBase(e.target.value)} required className={claseControl} /></div>
              <div className="flex flex-col gap-1.5"><label htmlFor="concepto" className="text-[13px] font-medium">Concepto</label><input id="concepto" value={concepto} onChange={(e) => setConcepto(e.target.value)} maxLength={120} placeholder="Servicios, honorarios…" className={claseControl} /></div>
            </>
          ) : null}
          {sufrida ? (
            <>
              <div className="flex flex-col gap-1.5"><label htmlFor="comprobante" className="text-[13px] font-medium">Nº del comprobante del cliente</label><input id="comprobante" value={comprobante} onChange={(e) => setComprobante(e.target.value)} required maxLength={40} className={claseControl} /></div>
              <div className="flex flex-col gap-1.5"><label htmlFor="fecha" className="text-[13px] font-medium">Fecha del comprobante</label><input id="fecha" type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} required className={claseControl} /></div>
            </>
          ) : null}
          <div className="flex flex-col justify-end"><p className="text-[13px] text-gris-500">Se retiene</p><p className="text-xl font-semibold tabular-nums">{fmt(monto)} USD</p></div>
        </div>
        <p className="mt-3 text-[12.5px] text-gris-500">
          {sufrida ? "Baja lo que el cliente debe de la factura y queda como crédito a nuestro favor." : "Baja lo que se debe al proveedor de la factura; lo retenido se debe enterar al fisco. El comprobante lo numera el sistema."} Se calcula con la tasa de la factura original.
        </p>
      </Tarjeta>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pendiente || monto <= 0} className={clasesBoton("primario")}>{pendiente ? "Registrando…" : "Registrar retención"}</button>
        <Link href={volver} className="px-2 text-sm text-gris-700 hover:text-tinta">Cancelar</Link>
      </div>
    </form>
  );
}
