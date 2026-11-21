import type { Maestro, ModuloMaestros } from "./tipos";
import { alicuotas, aranceles, categorias, subcategorias, unidades } from "./catalogos";
import { presentaciones, productos, proveedoresProducto } from "./productos";
import { clientes, proveedores } from "./terceros";
import { almacenes, existencias, movimientos } from "./existencias";
import { monedas, tasas } from "./tasas";

// Módulos cuyas pantallas las arma el motor de maestros. La primera sección de cada módulo es la que se abre en /<módulo>;
// las demás van en /<módulo>/<slug>. Un módulo que no esté aquí muestra la pantalla "en construcción".
export const modulosMaestros: ModuloMaestros[] = [
  { modulo: "clientes", secciones: [{ slug: "", titulo: "Clientes", maestro: clientes }] },
  { modulo: "proveedores", secciones: [{ slug: "", titulo: "Proveedores", maestro: proveedores }] },
  {
    modulo: "productos",
    secciones: [
      { slug: "", titulo: "Productos", maestro: productos },
      { slug: "presentaciones", titulo: "Presentaciones y precios", maestro: presentaciones },
      { slug: "proveedores", titulo: "Proveedores por producto", maestro: proveedoresProducto },
    ],
  },
  {
    modulo: "existencias",
    secciones: [
      { slug: "", titulo: "Existencias", maestro: existencias },
      { slug: "movimientos", titulo: "Movimientos", maestro: movimientos },
      { slug: "almacenes", titulo: "Almacenes", maestro: almacenes },
    ],
  },
  {
    modulo: "tasas",
    secciones: [
      { slug: "", titulo: "Tasas", maestro: tasas },
      { slug: "monedas", titulo: "Monedas", maestro: monedas },
    ],
  },
  {
    modulo: "catalogos",
    secciones: [
      { slug: "", titulo: "Categorías", maestro: categorias },
      { slug: "subcategorias", titulo: "Subcategorías", maestro: subcategorias },
      { slug: "alicuotas", titulo: "Alícuotas de IVA", maestro: alicuotas },
      { slug: "aranceles", titulo: "Aranceles", maestro: aranceles },
      { slug: "unidades", titulo: "Unidades de medida", maestro: unidades },
    ],
  },
];

export function buscarModulo(modulo: string) {
  return modulosMaestros.find((m) => m.modulo === modulo) ?? null;
}

export function buscarMaestro(id: string): Maestro | null {
  for (const mod of modulosMaestros) for (const s of mod.secciones) if (s.maestro.id === id) return s.maestro;
  return null;
}
