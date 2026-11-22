"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Aviso, clasesBoton } from "@/components/ui";
import { anularPedidoVenta, confirmarPedidoVenta, decidirPedidoVenta, type ResultadoAccionPedido } from "../acciones";

/** Confirmar / anular con confirmación. Cada acción devuelve un mensaje de error o null. */
export function BotonesEstado({ id, puedeConfirmar, puedeAnular, puedeDecidir }: { id: string; puedeConfirmar: boolean; puedeAnular: boolean; puedeDecidir?: boolean }) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const router = useRouter();
  const correr = (f: (id: string) => Promise<ResultadoAccionPedido>, confirmacion: string) => {
    if (!confirm(confirmacion)) return;
    setError(null);
    iniciar(async () => {
      const r = await f(id);
      if (r.error) setError(r.error);
      else {
        setAviso(r.aviso ?? null);
        router.refresh();
      }
    });
  };
  const decidir = (decision: "APROBADO" | "RECHAZADO") => {
    const motivo = decision === "RECHAZADO" ? (prompt("Motivo del rechazo:") ?? "") : (prompt("Comentario de la aprobación (opcional):") ?? "");
    if (decision === "RECHAZADO" && !motivo.trim()) return;
    setError(null);
    iniciar(async () => {
      const r = await decidirPedidoVenta(id, decision, motivo);
      if (r.error) setError(r.error);
      else router.refresh();
    });
  };
  return (
    <>
      {puedeConfirmar ? <button type="button" disabled={pendiente} onClick={() => correr(confirmarPedidoVenta, "¿Confirmar el pedido? Reservará la mercancía y fijará la tasa del dólar de hoy.")} className={clasesBoton("primario")}>Confirmar</button> : null}
      {puedeAnular ? <button type="button" disabled={pendiente} onClick={() => correr(anularPedidoVenta, "¿Anular el pedido? Se libera la reserva y no se puede deshacer.")} className={clasesBoton("peligro")}>Anular</button> : null}
      {puedeDecidir ? (
        <>
          <button type="button" disabled={pendiente} onClick={() => decidir("APROBADO")} className={clasesBoton("primario")}>Aprobar</button>
          <button type="button" disabled={pendiente} onClick={() => decidir("RECHAZADO")} className={clasesBoton("peligro")}>Rechazar</button>
        </>
      ) : null}
      {aviso ? <div className="basis-full"><Aviso tono="aviso">{aviso}</Aviso></div> : null}
      {error ? <div className="basis-full"><Aviso tono="error">{error}</Aviso></div> : null}
    </>
  );
}
