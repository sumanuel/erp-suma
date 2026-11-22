import type { ReactNode } from "react";
import { EncabezadoPagina } from "@/components/ui";
import { requerirPermiso } from "@/lib/dal";

export default async function LayoutImportaciones({ children }: { children: ReactNode }) {
  await requerirPermiso("importaciones", "ver");
  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Importaciones" descripcion="Expedientes de importación: productos con precio FOB, gastos y liquidación del costo que entra al inventario." />
      {children}
    </div>
  );
}
