"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Aviso, clasesBoton } from "@/components/ui";
import { anularNotaDeVenta } from "../../acciones";

/** Anula la nota pidiendo el motivo; revierte el saldo de la factura, el inventario (devoluciones) y el asiento. */
export function BotonAnularNota({ id }: { id: string }) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  function anular() {
    const motivo = prompt("Motivo de la anulación:");
    if (motivo === null) return;
    setError(null);
    iniciar(async () => {
      const e = await anularNotaDeVenta(id, motivo);
      if (e) setError(e);
      else router.refresh();
    });
  }
  return (
    <>
      <button type="button" disabled={pendiente} onClick={anular} className={clasesBoton("peligro")}>Anular nota</button>
      {error ? <div className="basis-full"><Aviso tono="error">{error}</Aviso></div> : null}
    </>
  );
}
