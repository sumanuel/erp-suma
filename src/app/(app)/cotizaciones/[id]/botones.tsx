"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Aviso, clasesBoton } from "@/components/ui";
import { anularCotizacionVenta, convertirCotizacionEnPedido, emitirCotizacionVenta, rechazarCotizacionVenta } from "../acciones";

/** Acciones de estado de una cotización. Cada una devuelve un mensaje de error o null; convertir redirige al pedido nuevo. */
export function BotonesEstado({ id, puedeEmitir, puedeConvertir, puedeRechazar, puedeAnular }: { id: string; puedeEmitir: boolean; puedeConvertir: boolean; puedeRechazar: boolean; puedeAnular: boolean }) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const correr = (f: () => Promise<string | null | undefined>, confirmacion: string | null) => {
    if (confirmacion && !confirm(confirmacion)) return;
    setError(null);
    iniciar(async () => {
      const e = await f();
      if (e) setError(e);
      else router.refresh();
    });
  };
  return (
    <>
      {puedeEmitir ? <button type="button" disabled={pendiente} onClick={() => correr(() => emitirCotizacionVenta(id), "¿Emitir la cotización? Después ya no se podrá editar y se fijará la tasa del dólar de hoy.")} className={clasesBoton("primario")}>Emitir</button> : null}
      {puedeConvertir ? <button type="button" disabled={pendiente} onClick={() => correr(async () => (await convertirCotizacionEnPedido(id))?.error, "¿Convertir en pedido? Se crea un pedido en borrador con estos precios y la cotización queda aceptada.")} className={clasesBoton("primario")}>Convertir en pedido</button> : null}
      {puedeRechazar ? <button type="button" disabled={pendiente} onClick={() => { const m = prompt("Motivo del rechazo (por qué no aceptó el cliente):"); if (m !== null) correr(() => rechazarCotizacionVenta(id, m), null); }} className={clasesBoton("secundario")}>Marcar rechazada</button> : null}
      {puedeAnular ? <button type="button" disabled={pendiente} onClick={() => correr(() => anularCotizacionVenta(id), "¿Anular la cotización? No se puede deshacer.")} className={clasesBoton("peligro")}>Anular</button> : null}
      {error ? <div className="basis-full"><Aviso tono="error">{error}</Aviso></div> : null}
    </>
  );
}
