"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Aviso, clasesBoton } from "@/components/ui";
import { anularFacturaVenta } from "../acciones";

/** Anula la factura pidiendo el motivo (queda en la factura y en el kardex). */
export function BotonAnular({ id }: { id: string }) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  function anular() {
    const motivo = prompt("Motivo de la anulación (se devuelve la mercancía al almacén):");
    if (motivo === null) return;
    setError(null);
    iniciar(async () => {
      const e = await anularFacturaVenta(id, motivo);
      if (e) setError(e);
      else router.refresh();
    });
  }
  return (
    <>
      <button type="button" disabled={pendiente} onClick={anular} className={clasesBoton("peligro")}>Anular</button>
      {error ? <div className="basis-full"><Aviso tono="error">{error}</Aviso></div> : null}
    </>
  );
}
