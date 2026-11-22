"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Aviso, clasesBoton, claseControl } from "@/components/ui";
import { asignarBultosPedido } from "../acciones";

type Linea = { id: string; producto: string; cantidad: number; bulto: number | null };

/** Lista de empaque: a qué bulto va cada línea del pedido. */
export function Empaque({ pedidoId, lineas, puedeEditar }: { pedidoId: string; lineas: Linea[]; puedeEditar: boolean }) {
  const [valores, setValores] = useState<Record<string, string>>(Object.fromEntries(lineas.map((l) => [l.id, l.bulto ? String(l.bulto) : ""])));
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();
  const guardar = () => {
    setError(null);
    iniciar(async () => {
      const e = await asignarBultosPedido(pedidoId, lineas.map((l) => ({ lineaId: l.id, bulto: valores[l.id] ? Number(valores[l.id]) : null })));
      if (e) setError(e);
      else router.refresh();
    });
  };
  const porBulto = new Map<number, Linea[]>();
  for (const l of lineas) {
    const b = Number(valores[l.id]);
    if (Number.isInteger(b) && b > 0) porBulto.set(b, [...(porBulto.get(b) ?? []), l]);
  }
  return (
    <div className="flex flex-col gap-4 p-4">
      {error ? <Aviso tono="error">{error}</Aviso> : null}
      <table className="w-full max-w-2xl text-left text-[13.5px]">
        <thead><tr className="border-y border-linea text-[12.5px] text-gris-600"><th className="py-2 font-medium">Producto</th><th className="py-2 text-right font-medium">Cantidad</th><th className="py-2 text-right font-medium">Bulto N.º</th></tr></thead>
        <tbody>
          {lineas.map((l) => (
            <tr key={l.id} className="border-b border-linea last:border-0">
              <td className="py-2">{l.producto}</td><td className="py-2 text-right tabular-nums">{l.cantidad}</td>
              <td className="py-2 text-right">{puedeEditar ? <input aria-label={`Bulto de ${l.producto}`} inputMode="numeric" value={valores[l.id]} onChange={(e) => setValores((v) => ({ ...v, [l.id]: e.target.value.replace(/\D/g, "").slice(0, 4) }))} className={`${claseControl} w-24 text-right`} /> : l.bulto ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {puedeEditar ? <div><button type="button" disabled={pendiente} onClick={guardar} className={clasesBoton("secundario")}>{pendiente ? "Guardando…" : "Guardar bultos"}</button></div> : null}
      {porBulto.size > 0 ? (
        <div className="text-[13px] text-gris-700">
          {[...porBulto].sort((a, b) => a[0] - b[0]).map(([b, ls]) => <p key={b}><span className="font-semibold">Bulto {b}:</span> {ls.map((l) => `${l.producto} (${l.cantidad})`).join(", ")}</p>)}
        </div>
      ) : null}
    </div>
  );
}
