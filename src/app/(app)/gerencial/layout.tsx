import type { ReactNode } from "react";
import { EncabezadoPagina } from "@/components/ui";
import { requerirPermiso } from "@/lib/dal";

export default async function LayoutGerencial({ children }: { children: ReactNode }) {
  await requerirPermiso("reportes", "ver");
  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Módulo gerencial" descripcion="Consultas y listados de gestión: artículos, clientes, proveedores, movimientos, ventas y compras." />
      {children}
    </div>
  );
}
