import type { ReactNode } from "react";
import { Pestanas } from "@/components/pestanas";
import { EncabezadoPagina } from "@/components/ui";
import { requerirPermiso } from "@/lib/dal";

export default async function LayoutFacturacion({ children }: { children: ReactNode }) {
  await requerirPermiso("facturacion", "ver");
  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Facturación" descripcion="Facturas de venta: descuentan inventario y fijan la tasa del día." />
      <Pestanas pestanas={[{ href: "/facturacion", etiqueta: "Facturas" }, { href: "/facturacion/notas", etiqueta: "Notas de crédito y débito" }]} />
      {children}
    </div>
  );
}
