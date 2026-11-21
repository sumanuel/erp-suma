import type { ReactNode } from "react";
import { Pestanas } from "@/components/pestanas";
import { EncabezadoPagina } from "@/components/ui";
import { requerirPermiso } from "@/lib/dal";

export default async function LayoutTesoreria({ children }: { children: ReactNode }) {
  await requerirPermiso("tesoreria", "ver");
  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Tesorería y bancos" descripcion="Cajas y cuentas bancarias, sus movimientos y conciliación." />
      <Pestanas pestanas={[{ href: "/tesoreria", etiqueta: "Cuentas" }, { href: "/tesoreria/transferir", etiqueta: "Transferir" }]} />
      {children}
    </div>
  );
}
