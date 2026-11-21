import type { Metadata } from "next";
import { PantallaAcceso } from "@/components/pantalla-acceso";
import { FormularioPlataforma } from "./formulario";

export const metadata: Metadata = { title: "Plataforma · ingresar" };

export default function PaginaIngresoPlataforma() {
  return (
    <PantallaAcceso subtitulo="Plataforma">
      <h1 className="mt-8 text-2xl font-semibold tracking-[-0.02em]">Panel del proveedor</h1>
      <p className="mt-1 text-sm text-gris-500">Acceso solo para administradores de la plataforma.</p>
      <FormularioPlataforma />
    </PantallaAcceso>
  );
}
