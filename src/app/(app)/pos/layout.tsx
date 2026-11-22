import type { ReactNode } from "react";
import { Pestanas } from "@/components/pestanas";
import { EncabezadoPagina } from "@/components/ui";
import { requerirPermiso } from "@/lib/dal";

export default async function LayoutPos({ children }: { children: ReactNode }) {
  await requerirPermiso("pos", "ver");
  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Punto de venta" descripcion="Venta de mostrador: factura de contado, cobro en dólares y bolívares, vuelto y cierre de caja." />
      <Pestanas pestanas={[{ href: "/pos", etiqueta: "Venta" }, { href: "/pos/turnos", etiqueta: "Turnos de caja" }]} />
      {children}
    </div>
  );
}
