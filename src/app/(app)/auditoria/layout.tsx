import type { ReactNode } from "react";
import { EncabezadoPagina } from "@/components/ui";
import { Pestanas } from "@/components/pestanas";
import { requerirPermiso } from "@/lib/dal";

export const metadata = { title: "Auditoría" };

export default async function LayoutAuditoria({ children }: { children: ReactNode }) {
  await requerirPermiso("auditoria");
  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Auditoría" descripcion="Ingresos al sistema y cambios hechos por los usuarios." />
      <Pestanas pestanas={[{ href: "/auditoria", etiqueta: "Cambios" }, { href: "/auditoria/ingresos", etiqueta: "Ingresos" }]} />
      {children}
    </div>
  );
}
