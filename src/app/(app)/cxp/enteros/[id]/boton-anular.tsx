"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Aviso, clasesBoton } from "@/components/ui";
import { anularEnteroFisco } from "../../acciones";

/** Anula el pago al fisco: las retenciones vuelven a estar por enterar y el dinero regresa a la cuenta. */
export function BotonAnularEntero({ id }: { id: string }) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <>
      <button
        type="button" disabled={pendiente} className={clasesBoton("peligro")}
        onClick={() => { const m = prompt("Motivo de la anulación:"); if (m === null) return; setError(null); iniciar(async () => { const e = await anularEnteroFisco(id, m); if (e) setError(e); else router.refresh(); }); }}
      >
        Anular pago
      </button>
      {error ? <div className="basis-full"><Aviso tono="error">{error}</Aviso></div> : null}
    </>
  );
}
