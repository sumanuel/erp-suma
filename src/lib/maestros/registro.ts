import type { Maestro, ModuloMaestros } from "./tipos";
import { alicuotas, aranceles, categorias, marcas, subcategorias, unidades } from "./catalogos";
import { presentaciones, preciosLista, productos, promociones, proveedoresProducto, relacionesProducto } from "./productos";
import { clientes, proveedores } from "./terceros";
import { actividadesEconomicas, clasificacionesCliente, clasificacionesProveedor, colores, contactosCliente, contactosProveedor, divisiones, origenesVenta, reglasAprobacion, seriesFiscales, sucursales, sucursalesCliente, tallas, ubicacionesFisicas } from "./catalogos-extra";
import { almacenes, existencias, movimientos } from "./existencias";
import { monedas, tasas } from "./tasas";
import { auxiliaresContables, bancos, centrosCosto, condicionesPago, estados, municipios, paises, parroquias, tarifasRetencion, tiposNegocio, transportes, vendedores } from "./tablas";

// Módulos cuyas pantallas las arma el motor de maestros. La primera sección de cada módulo es la que se abre en /<módulo>;
// las demás van en /<módulo>/<slug>. Un módulo que no esté aquí muestra la pantalla "en construcción".
export const modulosMaestros: ModuloMaestros[] = [
  {
    modulo: "clientes",
    secciones: [
      { slug: "", titulo: "Clientes", maestro: clientes },
      { slug: "contactos", titulo: "Contactos", maestro: contactosCliente },
      { slug: "sucursales", titulo: "Sucursales", maestro: sucursalesCliente },
    ],
  },
  {
    modulo: "proveedores",
    secciones: [
      { slug: "", titulo: "Proveedores", maestro: proveedores },
      { slug: "contactos", titulo: "Contactos", maestro: contactosProveedor },
    ],
  },
  {
    modulo: "productos",
    secciones: [
      { slug: "", titulo: "Productos", maestro: productos },
      { slug: "presentaciones", titulo: "Presentaciones y precios", maestro: presentaciones },
      { slug: "precios", titulo: "Precios por lista", maestro: preciosLista },
      { slug: "promociones", titulo: "Promociones", maestro: promociones },
      { slug: "proveedores", titulo: "Proveedores por producto", maestro: proveedoresProducto },
      { slug: "relacionados", titulo: "Sustitutos y componentes", maestro: relacionesProducto },
    ],
    paginas: [{ slug: "cambio-precios", titulo: "Cambio de precios" }, { slug: "etiquetas", titulo: "Etiquetas" }],
  },
  {
    modulo: "existencias",
    secciones: [
      { slug: "", titulo: "Existencias", maestro: existencias },
      { slug: "movimientos", titulo: "Movimientos", maestro: movimientos },
      { slug: "almacenes", titulo: "Almacenes", maestro: almacenes },
      { slug: "ubicaciones", titulo: "Ubicaciones físicas", maestro: ubicacionesFisicas },
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
    modulo: "tablas",
    secciones: [
      { slug: "", titulo: "Condiciones de pago", maestro: condicionesPago },
      { slug: "vendedores", titulo: "Vendedores y cobradores", maestro: vendedores },
      { slug: "tipos-negocio", titulo: "Tipos de negocio", maestro: tiposNegocio },
      { slug: "transportes", titulo: "Transportes", maestro: transportes },
      { slug: "bancos", titulo: "Bancos", maestro: bancos },
      { slug: "centros-costo", titulo: "Centros de costo", maestro: centrosCosto },
      { slug: "auxiliares", titulo: "Auxiliares contables", maestro: auxiliaresContables },
      { slug: "tarifas-islr", titulo: "Retenciones de ISLR", maestro: tarifasRetencion },
      { slug: "geografia", titulo: "Países", maestro: paises },
      { slug: "estados", titulo: "Estados", maestro: estados },
      { slug: "municipios", titulo: "Municipios", maestro: municipios },
      { slug: "parroquias", titulo: "Parroquias", maestro: parroquias },
    ],
  },
  {
    modulo: "catalogos",
    secciones: [
      { slug: "", titulo: "Categorías", maestro: categorias },
      { slug: "subcategorias", titulo: "Subcategorías", maestro: subcategorias },
      { slug: "marcas", titulo: "Marcas", maestro: marcas },
      { slug: "alicuotas", titulo: "Alícuotas de IVA", maestro: alicuotas },
      { slug: "aranceles", titulo: "Aranceles", maestro: aranceles },
      { slug: "unidades", titulo: "Unidades de medida", maestro: unidades },
      { slug: "divisiones", titulo: "Divisiones", maestro: divisiones },
      { slug: "colores", titulo: "Colores", maestro: colores },
      { slug: "tallas", titulo: "Tallas", maestro: tallas },
      { slug: "sucursales", titulo: "Sucursales", maestro: sucursales },
      { slug: "actividades", titulo: "Actividades económicas", maestro: actividadesEconomicas },
      { slug: "clasificacion-clientes", titulo: "Clasificación de clientes", maestro: clasificacionesCliente },
      { slug: "clasificacion-proveedores", titulo: "Clasificación de proveedores", maestro: clasificacionesProveedor },
      { slug: "series-fiscales", titulo: "Series fiscales", maestro: seriesFiscales },
      { slug: "origenes-venta", titulo: "Orígenes de venta", maestro: origenesVenta },
      { slug: "reglas-aprobacion", titulo: "Reglas de aprobación", maestro: reglasAprobacion },
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
