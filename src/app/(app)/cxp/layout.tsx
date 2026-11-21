import type { ReactNode } from "react";
import { Pestanas } from "@/components/pestanas";
import { EncabezadoPagina } from "@/components/ui";
import { requerirPermiso } from "@/lib/dal";

export default async function LayoutCxc({ children }: { children: ReactNode }) {
  await requerirPermiso("cxp", "ver");
  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Cuentas por pagar" descripcion="Facturas de proveedores, vencimientos y pagos." />
      <Pestanas pestanas={[{ href: "/cxp", etiqueta: "Saldos por proveedor" }, { href: "/cxp/facturas", etiqueta: "Facturas de proveedores" }, { href: "/cxp/pagos", etiqueta: "Pagos" }]} />
      {children}
    </div>
  );
}
