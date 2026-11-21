"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Aviso, clasesBoton } from "@/components/ui";
import { anularPagoProveedor } from "../../acciones";

/** Anula el pago pidiendo el motivo; los saldos de las facturas vuelven a lo que eran. */
export function BotonAnularPago({ id }: { id: string }) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  function anular() {
    const motivo = prompt("Motivo de la anulación (los saldos de las facturas se restituyen):");
    if (motivo === null) return;
    setError(null);
    iniciar(async () => {
      const e = await anularPagoProveedor(id, motivo);
      if (e) setError(e);
      else router.refresh();
    });
  }
  return (
    <>
      <button type="button" disabled={pendiente} onClick={anular} className={clasesBoton("peligro")}>Anular pago</button>
      {error ? <div className="basis-full"><Aviso tono="error">{error}</Aviso></div> : null}
    </>
  );
}
