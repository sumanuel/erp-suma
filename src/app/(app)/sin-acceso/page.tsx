import { EncabezadoPagina, Tarjeta } from "@/components/ui";

export default function SinAcceso() {
  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Sin acceso" />
      <Tarjeta className="px-6 py-12 text-center text-gris-500">Tu perfil no tiene permiso para ver esta pantalla.</Tarjeta>
    </div>
  );
}
