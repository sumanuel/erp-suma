import type { Metadata } from "next";
import { headers } from "next/headers";
import { PantallaAcceso } from "@/components/pantalla-acceso";
import { rutaInternaSegura, slugDeHost } from "@/lib/host";
import { FormularioIngreso } from "./formulario";

export const metadata: Metadata = { title: "Ingresar" };

export default async function PaginaIngreso({ searchParams }: { searchParams: Promise<{ volver?: string; motivo?: string }> }) {
  const { volver, motivo } = await searchParams;
  // Con subdominio (acme.<dominio>) o un cliente por defecto (desarrollo) no se pregunta la empresa.
  const pedirEmpresa = !slugDeHost((await headers()).get("host")) && !process.env.CLIENTE_POR_DEFECTO;
  return (
    <PantallaAcceso pie="¿Olvidaste tu contraseña? Pide al administrador del sistema que la restablezca.">
      <h1 className="mt-8 text-2xl font-semibold tracking-[-0.02em]">Ingresar</h1>
      <p className="mt-1 text-sm text-gris-500">Usa el correo y la contraseña de tu usuario.</p>
      <FormularioIngreso volver={volver ? rutaInternaSegura(volver) : undefined} vencida={motivo === "vencida"} pedirEmpresa={pedirEmpresa} />
    </PantallaAcceso>
  );
}
