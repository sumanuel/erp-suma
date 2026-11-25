"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Aviso, clasesBoton } from "@/components/ui";
import { anularImportacionForm, procesarImportacionForm } from "../acciones";

/** Procesar (la mercancía entra al inventario con el costo liquidado) y anular. */
export function BotonesImportacion({ id, puedeProcesar, puedeAnular, procesada }: { id: string; puedeProcesar: boolean; puedeAnular: boolean; procesada: boolean }) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const correr = (f: () => Promise<string | null>) => {
    setError(null);
    iniciar(async () => {
      const e = await f();
      if (e) setError(e);
      else router.refresh();
    });
  };
  return (
    <>
      {puedeProcesar ? (
        <button data-guardar="propio" type="button" disabled={pendiente} onClick={() => confirm("¿Procesar la importación? La mercancía entra al almacén con el costo liquidado y cambia el costo promedio de los productos.") && correr(() => procesarImportacionForm(id))} className={clasesBoton("primario")}>Procesar</button>
      ) : null}
      {puedeAnular ? (
        <button
          type="button"
          disabled={pendiente}
          onClick={() => {
            const motivo = prompt(procesada ? "Motivo de la anulación (se saca la mercancía del almacén):" : "Motivo de la anulación:");
            if (motivo) correr(() => anularImportacionForm(id, motivo));
          }}
          className={clasesBoton("peligro")}
        >
          Anular
        </button>
      ) : null}
      {error ? <div className="basis-full"><Aviso tono="error">{error}</Aviso></div> : null}
    </>
  );
}
