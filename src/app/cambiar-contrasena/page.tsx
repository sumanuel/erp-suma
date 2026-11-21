import { PantallaAcceso } from "@/components/pantalla-acceso";
import { requerirSesion } from "@/lib/dal";
import { Formulario } from "./formulario";

export const metadata = { title: "Cambiar contraseña" };

export default async function Pagina() {
  await requerirSesion();
  return (
    <PantallaAcceso>
      <h1 className="mt-8 text-2xl font-semibold tracking-[-0.02em]">Cambiar contraseña</h1>
      <p className="mt-1 text-sm text-gris-500">Mínimo 10 caracteres, con letras y números. Al guardar tendrás que ingresar de nuevo.</p>
      <Formulario />
    </PantallaAcceso>
  );
}
