"use client";

import { useState, useTransition } from "react";
import { conciliarMovimiento } from "../../acciones";

/** Casilla de conciliación de una línea del libro (contra el estado de cuenta del banco). Sin permiso de edición, solo muestra el estado. */
export function CasillaConciliado({ cuentaId, movimientoId, conciliado, puedeEditar }: { cuentaId: string; movimientoId: string; conciliado: boolean; puedeEditar: boolean }) {
  const [valor, setValor] = useState(conciliado);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  return (
    <span className="inline-flex items-center gap-2">
      <input
        type="checkbox" checked={valor} disabled={!puedeEditar || pendiente} aria-label="Conciliado" className="size-4 accent-marca-fuerte"
        onChange={(e) => {
          const nuevo = e.target.checked;
          setError(null);
          iniciar(async () => {
            const r = await conciliarMovimiento(cuentaId, movimientoId, nuevo);
            if (r) setError(r);
            else setValor(nuevo);
          });
        }}
      />
      {error ? <span role="alert" className="text-[12px] text-error">{error}</span> : null}
    </span>
  );
}
