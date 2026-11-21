"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Aviso, clasesBoton } from "@/components/ui";
import { anularFacturaProveedor } from "../../acciones";

/** Anula la factura del proveedor pidiendo el motivo. Con pagos vigentes el sistema la rechaza. */
export function BotonAnularFacturaProveedor({ id }: { id: string }) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  function anular() {
    const motivo = prompt("Motivo de la anulación:");
    if (motivo === null) return;
    setError(null);
    iniciar(async () => {
      const e = await anularFacturaProveedor(id, motivo);
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
