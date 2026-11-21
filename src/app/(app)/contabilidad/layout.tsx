import type { ReactNode } from "react";
import { Pestanas } from "@/components/pestanas";
import { EncabezadoPagina } from "@/components/ui";
import { requerirPermiso } from "@/lib/dal";

export default async function LayoutContabilidad({ children }: { children: ReactNode }) {
  await requerirPermiso("contabilidad", "ver");
  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Contabilidad" descripcion="Plan de cuentas, asientos en bolívares, libro mayor y balance de comprobación." />
      <Pestanas
        pestanas={[
          { href: "/contabilidad", etiqueta: "Plan de cuentas" },
          { href: "/contabilidad/asientos", etiqueta: "Asientos" },
          { href: "/contabilidad/mayor", etiqueta: "Libro mayor" },
          { href: "/contabilidad/balance", etiqueta: "Balance de comprobación" },
          { href: "/contabilidad/periodos", etiqueta: "Períodos" },
        ]}
      />
      {children}
    </div>
  );
}
