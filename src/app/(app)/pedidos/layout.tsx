import type { ReactNode } from "react";
import { EncabezadoPagina } from "@/components/ui";
import { requerirPermiso } from "@/lib/dal";

export default async function LayoutPedidos({ children }: { children: ReactNode }) {
  await requerirPermiso("pedidos", "ver");
  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Pedidos" descripcion="Pedidos de venta con reserva de inventario." />
      {children}
    </div>
  );
}
