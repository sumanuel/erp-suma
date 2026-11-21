import type { ReactNode } from "react";
import { EncabezadoPagina } from "@/components/ui";
import { requerirPermiso } from "@/lib/dal";

export default async function LayoutCompras({ children }: { children: ReactNode }) {
  await requerirPermiso("compras", "ver");
  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Compras" descripcion="Órdenes de compra y recepción de mercancía al inventario." />
      {children}
    </div>
  );
}
