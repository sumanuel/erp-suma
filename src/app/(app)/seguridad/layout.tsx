import type { ReactNode } from "react";
import { EncabezadoPagina } from "@/components/ui";
import { Pestanas } from "@/components/pestanas";
import { requerirPermiso } from "@/lib/dal";

export const metadata = { title: "Usuarios y perfiles" };

export default async function LayoutSeguridad({ children }: { children: ReactNode }) {
  await requerirPermiso("seguridad");
  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Usuarios y perfiles" descripcion="Quién entra al sistema y qué puede hacer en cada módulo." />
      <Pestanas pestanas={[{ href: "/seguridad/usuarios", etiqueta: "Usuarios" }, { href: "/seguridad/perfiles", etiqueta: "Perfiles" }]} />
      {children}
    </div>
  );
}
