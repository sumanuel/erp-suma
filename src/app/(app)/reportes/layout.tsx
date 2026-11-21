import type { ReactNode } from "react";
import { EncabezadoPagina } from "@/components/ui";
import { requerirPermiso } from "@/lib/dal";

export default async function LayoutReportes({ children }: { children: ReactNode }) {
  await requerirPermiso("reportes", "ver");
  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Reportes" descripcion="Reportes gerenciales y contables para ver, imprimir o exportar a Excel." />
      {children}
    </div>
  );
}
