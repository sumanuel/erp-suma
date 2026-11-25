"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Aviso, Tarjeta, clasesBoton, claseControl } from "@/components/ui";
import { calcularLinea } from "@/lib/notas/estados";
import { emitirNotaVenta } from "../../acciones";
import { formatoCantidad, formatoUsd } from "../../formato";

type LineaFactura = { id: string; codigo: string; descripcion: string; vendida: number; devolvible: number; precio: number; descuento: number; iva: number };
const num = (s: string) => {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Nota de crédito (devolución de mercancía o ajuste de monto) o de débito (cargo) sobre una factura. El servidor recalcula y valida todo. */
export function FormularioNotaVenta({ tipo, factura, lineas, almacenes, alicuotas }: {
  tipo: "CREDITO" | "DEBITO"; factura: { id: string; numero: string; cliente: string; saldo: number }; lineas: LineaFactura[]; almacenes: { valor: string; etiqueta: string }[]; alicuotas: number[];
}) {
  const [modo, setModo] = useState<"DEVOLUCION" | "AJUSTE">("DEVOLUCION");
  const [motivo, setMotivo] = useState("");
  const [almacenId, setAlmacenId] = useState(almacenes.length === 1 ? almacenes[0].valor : "");
  const [cant, setCant] = useState<Record<string, string>>({});
  const [base, setBase] = useState("");
  const [iva, setIva] = useState(String(alicuotas.find((a) => a > 0) ?? 0));
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const credito = tipo === "CREDITO";
  const devolucion = credito && modo === "DEVOLUCION";

  let subtotal = 0, ivaMonto = 0;
  if (devolucion) {
    for (const l of lineas) { const c = calcularLinea({ cantidad: num(cant[l.id] ?? ""), costoUnitario: l.precio, descuento: l.descuento, ivaPorcentaje: l.iva }); subtotal += c.neto; ivaMonto += c.iva; }
  } else { subtotal = num(base); ivaMonto = (subtotal * Number(iva)) / 100; }
  const total = Math.round((subtotal + ivaMonto) * 10000) / 10000;

  function emitir() {
    setError(null);
    if (!confirm(`¿Emitir la nota de ${credito ? "crédito" : "débito"} por ${formatoUsd(total)} USD? No se puede editar (solo anular).`)) return;
    iniciar(async () => {
      const comun = { facturaId: factura.id, motivo };
      const r = await emitirNotaVenta(
        devolucion
          ? { ...comun, tipo: "CREDITO", modo: "DEVOLUCION", almacenId, lineas: lineas.map((l) => ({ facturaLineaId: l.id, cantidad: num(cant[l.id] ?? "") })).filter((l) => l.cantidad > 0) }
          : { ...comun, tipo, modo: credito ? "AJUSTE" : "CARGO", base: num(base), ivaPorcentaje: Number(iva) },
      );
      if (r?.error) setError(r.error);
    });
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); emitir(); }} className="flex flex-col gap-6">
      {error ? <Aviso tono="error">{error}</Aviso> : null}
      <Tarjeta className="p-6">
        <h2 className="text-lg font-semibold">{credito ? "Nota de crédito" : "Nota de débito"} sobre {factura.numero}</h2>
        <p className="text-sm text-gris-600">{factura.cliente} · saldo pendiente {formatoUsd(factura.saldo)} USD</p>
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
              <select id="almacenId" value={almacenId} onChange={(e) => setAlmacenId(e.target.value)} required className={`${claseControl} pr-9`}>
                <option value="">Elegir…</option>{almacenes.map((a) => <option key={a.valor} value={a.valor}>{a.etiqueta}</option>)}
              </select>
            </div>
          ) : null}
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <label htmlFor="motivo" className="text-[13px] font-medium">Motivo</label>
            <input id="motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} required maxLength={300} className={claseControl} />
          </div>
        </div>
      </Tarjeta>

      <Tarjeta>
        {devolucion ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13.5px]">
              <thead><tr className="border-b border-linea text-[12.5px] text-gris-600"><th className="px-4 py-3 font-medium">Producto</th><th className="px-3 py-3 text-right font-medium">Vendida</th><th className="px-3 py-3 text-right font-medium">Se puede devolver</th><th className="px-3 py-3 text-right font-medium">Precio USD</th><th className="px-4 py-3 text-right font-medium">Devolver</th></tr></thead>
              <tbody>
                {lineas.map((l) => (
                  <tr key={l.id} className="border-b border-linea last:border-0">
                    <td className="px-4 py-2"><span className="font-semibold">{l.codigo}</span> · {l.descripcion}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatoCantidad(l.vendida)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatoCantidad(l.devolvible)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatoUsd(l.precio)}</td>
                    <td className="px-4 py-2 text-right"><input aria-label={`Devolver de ${l.codigo}`} inputMode="decimal" disabled={l.devolvible <= 0} value={cant[l.id] ?? ""} onChange={(e) => setCant((c) => ({ ...c, [l.id]: e.target.value }))} className={`${claseControl} w-28 text-right`} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid gap-4 p-6 md:grid-cols-2">
            <div className="flex flex-col gap-1.5"><label htmlFor="base" className="text-[13px] font-medium">Monto sin IVA (USD)</label><input id="base" inputMode="decimal" value={base} onChange={(e) => setBase(e.target.value)} required className={claseControl} /></div>
            <div className="flex flex-col gap-1.5"><label htmlFor="iva" className="text-[13px] font-medium">Alícuota de IVA</label>
              <select id="iva" value={iva} onChange={(e) => setIva(e.target.value)} className={`${claseControl} pr-9`}>{alicuotas.map((a) => <option key={a} value={a}>{a === 0 ? "Exento (0 %)" : `${a} %`}</option>)}</select>
            </div>
          </div>
        )}
        <dl className="ml-auto flex w-full max-w-xs flex-col gap-1 p-4 text-[13.5px]">
          <div className="flex justify-between"><dt className="text-gris-600">Subtotal</dt><dd className="tabular-nums">{formatoUsd(subtotal)}</dd></div>
          <div className="flex justify-between"><dt className="text-gris-600">IVA</dt><dd className="tabular-nums">{formatoUsd(ivaMonto)}</dd></div>
          <div className="flex justify-between border-t border-linea pt-1 text-[15px] font-semibold"><dt>Total USD</dt><dd className="tabular-nums">{credito ? "−" : ""}{formatoUsd(total)}</dd></div>
        </dl>
      </Tarjeta>
      <p className="text-[12.5px] text-gris-500">La nota usa la tasa de la factura original. {credito ? "Un crédito no puede superar lo que aún se debe de la factura." : "Un débito aumenta lo que el cliente debe."}</p>
      <div className="flex items-center gap-3">
        <button data-guardar="propio" type="submit" disabled={pendiente || total <= 0} className={clasesBoton("primario")}>{pendiente ? "Emitiendo…" : credito ? "Emitir nota de crédito" : "Emitir nota de débito"}</button>
        <Link data-salir href={`/facturacion/${factura.id}`} className="px-2 text-sm text-gris-700 hover:text-tinta">Cancelar</Link>
      </div>
    </form>
  );
}
