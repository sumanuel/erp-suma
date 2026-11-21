"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Aviso, clasesBoton } from "@/components/ui";
import { anularPedidoVenta, confirmarPedidoVenta } from "../acciones";

/** Confirmar / anular con confirmación. Cada acción devuelve un mensaje de error o null. */
export function BotonesEstado({ id, puedeConfirmar, puedeAnular }: { id: string; puedeConfirmar: boolean; puedeAnular: boolean }) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const correr = (f: (id: string) => Promise<string | null>, confirmacion: string) => {
    if (!confirm(confirmacion)) return;
    setError(null);
    iniciar(async () => {
      const e = await f(id);
      if (e) setError(e);
      else router.refresh();
    });
  };
  return (
    <>
      {puedeConfirmar ? <button type="button" disabled={pendiente} onClick={() => correr(confirmarPedidoVenta, "¿Confirmar el pedido? Reservará la mercancía y fijará la tasa del dólar de hoy.")} className={clasesBoton("primario")}>Confirmar</button> : null}
      {puedeAnular ? <button type="button" disabled={pendiente} onClick={() => correr(anularPedidoVenta, "¿Anular el pedido? Se libera la reserva y no se puede deshacer.")} className={clasesBoton("peligro")}>Anular</button> : null}
      {error ? <div className="basis-full"><Aviso tono="error">{error}</Aviso></div> : null}
    </>
  );
}
