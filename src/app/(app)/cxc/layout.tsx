import type { ReactNode } from "react";
import { Pestanas } from "@/components/pestanas";
import { EncabezadoPagina } from "@/components/ui";
import { requerirPermiso } from "@/lib/dal";

export default async function LayoutCxc({ children }: { children: ReactNode }) {
  await requerirPermiso("cxc", "ver");
  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Cuentas por cobrar" descripcion="Saldos, vencimientos y cobros de clientes." />
      <Pestanas pestanas={[{ href: "/cxc", etiqueta: "Saldos por cliente" }, { href: "/cxc/cobros", etiqueta: "Cobros" }, { href: "/cxc/retenciones", etiqueta: "Retenciones" }]} />
      {children}
    </div>
  );
}
