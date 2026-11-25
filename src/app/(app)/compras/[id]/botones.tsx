"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Aviso, clasesBoton } from "@/components/ui";
import { anularOrdenCompra, emitirOrdenCompra } from "../acciones";

/** Emitir / anular con confirmación. Cada acción devuelve un mensaje de error o null. */
export function BotonesEstado({ id, puedeEmitir, puedeAnular }: { id: string; puedeEmitir: boolean; puedeAnular: boolean }) {
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
      {puedeEmitir ? <button data-guardar="propio" type="button" disabled={pendiente} onClick={() => correr(emitirOrdenCompra, "¿Emitir la orden? Después ya no se podrá editar.")} className={clasesBoton("primario")}>Emitir</button> : null}
      {puedeAnular ? <button type="button" disabled={pendiente} onClick={() => correr(anularOrdenCompra, "¿Anular la orden? No se puede deshacer.")} className={clasesBoton("peligro")}>Anular</button> : null}
      {error ? <div className="basis-full"><Aviso tono="error">{error}</Aviso></div> : null}
    </>
  );
}
