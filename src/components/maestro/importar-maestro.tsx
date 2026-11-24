import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EncabezadoPagina, Tarjeta, clasesBoton } from "@/components/ui";
import { requerirPermisoAccion } from "@/lib/dal";
import { camposDe } from "@/lib/maestros/nucleo";
import type { Maestro } from "@/lib/maestros/tipos";
import { FormularioImportar } from "./formulario-importar";

/** Pantalla «Importar Excel» de un maestro: instrucciones, columnas y el formulario de carga. */
export async function ImportarMaestro({ maestro: m, titulo }: { maestro: Maestro; titulo: string }) {
  const { db } = await requerirPermisoAccion(m.modulo, "crear");
  const campos = await camposDe(m, db);
  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina titulo={`Importar ${titulo.toLowerCase()} desde Excel`} descripcion={`Carga varios ${m.plural} de una vez. Cada fila pasa por las mismas validaciones que el formulario de alta.`} />
      <div><Link href={m.ruta} className={clasesBoton("secundario")}><ArrowLeft className="size-4" aria-hidden />Volver al listado</Link></div>
      <FormularioImportar id={m.id} ruta={m.ruta} plural={m.plural} />
      <Tarjeta className="p-6">
        <h3 className="mb-3 text-base font-semibold">Columnas del archivo</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13.5px]">
            <thead><tr className="border-b border-linea text-[12.5px] text-gris-600"><th className="py-2 pr-4 font-medium">Columna</th><th className="py-2 pr-4 font-medium">Obligatoria</th><th className="py-2 font-medium">Notas</th></tr></thead>
            <tbody>
              {campos.map((c) => {
                const obligatoria = c.requerido && m.valoresIniciales?.[c.nombre] === undefined;
                return (
                  <tr key={c.nombre} className="border-b border-linea last:border-0 align-top">
                    <td className="py-2 pr-4 font-medium">{c.etiqueta.replace(/ \(opcional\)/, "")}</td>
                    <td className="py-2 pr-4">{obligatoria ? "Sí" : "No"}</td>
                    <td className="py-2 text-gris-600">{c.tipo === "seleccion" ? "Escribe el nombre tal como está en el sistema. " : c.tipo === "booleano" ? "Sí o No. " : c.tipo === "fecha" ? "AAAA-MM-DD. " : ""}{c.ayuda ?? ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Tarjeta>
    </div>
  );
}
