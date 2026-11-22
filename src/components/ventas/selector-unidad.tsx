"use client";

import { claseControl } from "@/components/ui";
import type { PresentacionVenta } from "@/lib/ventas/presentaciones";

/** Unidad de venta de una línea: la unidad base o una presentación del producto. No se muestra si el producto no tiene presentaciones. */
export function SelectorUnidad({ codigo, presentaciones, valor, onCambio }: { codigo: string; presentaciones?: PresentacionVenta[]; valor?: string; onCambio: (id: string) => void }) {
  if (!presentaciones || presentaciones.length === 0) return null;
  return (
    <select aria-label={`Unidad de venta de ${codigo}`} value={valor ?? ""} onChange={(e) => onCambio(e.target.value)} className={`${claseControl} mt-1 h-8 w-48 pr-8 text-[12.5px]`}>
      <option value="">Unidad</option>
      {presentaciones.map((p) => <option key={p.id} value={p.id}>{p.nombre} (×{p.factor})</option>)}
    </select>
  );
}
