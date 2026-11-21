"use client";

import { Printer } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Aviso, clasesBoton } from "@/components/ui";

/** Imprimir el comprobante y anular la retención (pide el motivo). */
export function AccionesRetencion({ id, vigente, puedeAnular, anular }: { id: string; vigente: boolean; puedeAnular: boolean; anular: (id: string, motivo: string) => Promise<string | null> }) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <>
      <button type="button" onClick={() => window.print()} className={clasesBoton("secundario")}><Printer className="size-4" aria-hidden />Imprimir</button>
      {vigente && puedeAnular ? (
        <button
          type="button" disabled={pendiente} className={clasesBoton("peligro")}
          onClick={() => {
            const motivo = prompt("Motivo de la anulación:");
            if (motivo === null) return;
            setError(null);
            iniciar(async () => { const e = await anular(id, motivo); if (e) setError(e); else router.refresh(); });
          }}
        >
          Anular
        </button>
      ) : null}
      {error ? <div className="basis-full"><Aviso tono="error">{error}</Aviso></div> : null}
    </>
  );
}
