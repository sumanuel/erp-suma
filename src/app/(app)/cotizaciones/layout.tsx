import type { ReactNode } from "react";
import { EncabezadoPagina } from "@/components/ui";
import { requerirPermiso } from "@/lib/dal";

export default async function LayoutCotizaciones({ children }: { children: ReactNode }) {
  await requerirPermiso("cotizaciones", "ver");
  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Cotizaciones" descripcion="Ofertas a clientes con vigencia; se convierten en pedido." />
      {children}
    </div>
  );
}
