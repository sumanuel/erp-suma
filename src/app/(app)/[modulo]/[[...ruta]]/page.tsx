import { notFound } from "next/navigation";
import { FichaMaestro } from "@/components/maestro/ficha-maestro";
import { ImportarMaestro } from "@/components/maestro/importar-maestro";
import { ListadoMaestro } from "@/components/maestro/listado-maestro";
import { EncabezadoPagina, Tarjeta } from "@/components/ui";
import { requerirPermiso } from "@/lib/dal";
import type { Busqueda } from "@/lib/listados";
import { itemsMenu } from "@/lib/menu";
import { buscarModulo } from "@/lib/maestros/registro";
import { PaginaCambioPrecios } from "@/components/productos/pagina-cambio-precios";
import { PaginaEtiquetas } from "@/components/productos/pagina-etiquetas";

// Pantallas propias de un módulo (declaradas en `paginas` del registro).
const paginasPropias: Record<string, () => Promise<React.JSX.Element>> = { "productos/cambio-precios": PaginaCambioPrecios, "productos/etiquetas": PaginaEtiquetas };

// Una sola ruta atiende todos los módulos:
//   /<módulo>                      listado de la primera sección
//   /<módulo>/<sección>            listado de otra sección
//   /<módulo>[/<sección>]/nuevo    alta
//   /<módulo>[/<sección>]/importar carga masiva desde Excel (maestros con `importable`)
//   /<módulo>[/<sección>]/<clave>  ficha
// Los módulos que aún no tienen sus pantallas muestran un marcador.
export default async function PaginaModulo({
  params,
  searchParams,
}: {
  params: Promise<{ modulo: string; ruta?: string[] }>;
  searchParams: Promise<Busqueda>;
}) {
  const { modulo, ruta = [] } = await params;
  const item = itemsMenu.find((i) => i.modulo === modulo);
  if (!item?.modulo) notFound();
  const mod = buscarModulo(modulo);

  if (!mod) {
    await requerirPermiso(item.modulo, "ver");
    return (
      <div className="flex flex-col gap-6">
        <EncabezadoPagina titulo={item.etiqueta} descripcion={item.descripcion} />
        <Tarjeta className="px-6 py-12 text-center text-gris-500">
          Este módulo todavía está en construcción. Se habilita según el plan de migración.
        </Tarjeta>
      </div>
    );
  }

  if (ruta.length === 1 && mod.paginas?.some((p) => p.slug === ruta[0])) {
    await requerirPermiso(mod.modulo, "ver");
    return paginasPropias[`${modulo}/${ruta[0]}`]();
  }

  // La sección es el primer segmento solo si coincide con una sección con nombre; si no, pertenece a la sección principal.
  const nombrada = ruta.length > 0 ? mod.secciones.find((s) => s.slug !== "" && s.slug === ruta[0]) : undefined;
  const seccion = nombrada ?? mod.secciones[0];
  const resto = nombrada ? ruta.slice(1) : ruta;
  if (resto.length > 1) notFound();

  if (resto.length === 0) return <ListadoMaestro maestro={seccion.maestro} busqueda={await searchParams} />;
  if (seccion.maestro.soloConsulta) notFound();
  if (resto[0] === "nuevo" && seccion.maestro.sinCrear) notFound();
  if (resto[0] === "importar" && seccion.maestro.importable) return <ImportarMaestro maestro={seccion.maestro} titulo={seccion.titulo} />;
  if (seccion.maestro.sinEdicion && resto[0] !== "nuevo") notFound();
  if (resto[0] === "nuevo") return <FichaMaestro maestro={seccion.maestro} clave={null} titulo={seccion.titulo} />;
  return <FichaMaestro maestro={seccion.maestro} clave={decodeURIComponent(resto[0])} titulo={seccion.titulo} />;
}
