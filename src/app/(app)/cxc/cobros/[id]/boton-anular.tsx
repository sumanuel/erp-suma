"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Aviso, clasesBoton } from "@/components/ui";
import { anularCobroCliente } from "../../acciones";

/** Anula el cobro pidiendo el motivo; los saldos de las facturas vuelven a lo que eran. */
export function BotonAnularCobro({ id }: { id: string }) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  function anular() {
    const motivo = prompt("Motivo de la anulación (los saldos de las facturas se restituyen):");
    if (motivo === null) return;
    setError(null);
    iniciar(async () => {
      const e = await anularCobroCliente(id, motivo);
      if (e) setError(e);
      else router.refresh();
    });
  }
  return (
    <>
      <button type="button" disabled={pendiente} onClick={anular} className={clasesBoton("peligro")}>Anular cobro</button>
      {error ? <div className="basis-full"><Aviso tono="error">{error}</Aviso></div> : null}
    </>
  );
}
