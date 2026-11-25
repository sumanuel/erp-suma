import type { ModuloId } from "./modulos";

// Áreas desplegables con sus módulos, y una tarjeta por módulo en el inicio.
export type IconoMenu =
  | "inicio" | "comercial" | "compras" | "inventario" | "finanzas" | "analisis" | "configuracion"
  | "clientes" | "cotizaciones" | "pedidos" | "facturacion" | "pos" | "proveedores" | "ordenes" | "importaciones"
  | "productos" | "catalogos" | "tablas" | "existencias" | "tasas" | "cxc" | "cxp" | "tesoreria" | "contabilidad" | "reportes" | "seguridad" | "auditoria";

export type ItemMenu = {
  href: string;
  etiqueta: string;
  descripcion: string;
  icono: IconoMenu;
  modulo: ModuloId | null; // null: visible para cualquier usuario con sesión
};

export type AreaMenu = { id: string; etiqueta: string; icono: IconoMenu; items: ItemMenu[]; alPie?: boolean };

export const inicio: ItemMenu = { href: "/", etiqueta: "Inicio", descripcion: "Accesos a los módulos de tu perfil.", icono: "inicio", modulo: null };

export const areas: AreaMenu[] = [
  {
    id: "comercial", etiqueta: "Comercial", icono: "comercial",
    items: [
      { href: "/clientes", etiqueta: "Clientes", descripcion: "Clientes, sus contactos, condiciones de pago y documentos.", icono: "clientes", modulo: "clientes" },
      { href: "/cotizaciones", etiqueta: "Cotizaciones", descripcion: "Cotizaciones a clientes y su seguimiento.", icono: "cotizaciones", modulo: "cotizaciones" },
      { href: "/pedidos", etiqueta: "Pedidos", descripcion: "Pedidos, prefacturas y reservas de inventario.", icono: "pedidos", modulo: "pedidos" },
      { href: "/pos", etiqueta: "Punto de venta", descripcion: "Venta de mostrador, cobro en varias monedas, vuelto y cierre de caja.", icono: "pos", modulo: "pos" },
      { href: "/facturacion", etiqueta: "Facturación", descripcion: "Facturas, notas y punto de venta.", icono: "facturacion", modulo: "facturacion" },
    ],
  },
  {
    id: "compras", etiqueta: "Compras", icono: "compras",
    items: [
      { href: "/proveedores", etiqueta: "Proveedores", descripcion: "Proveedores y sus datos de pago.", icono: "proveedores", modulo: "proveedores" },
      { href: "/compras", etiqueta: "Compras", descripcion: "Órdenes de compra y recepción de mercancía.", icono: "ordenes", modulo: "compras" },
      { href: "/importaciones", etiqueta: "Importaciones", descripcion: "Expedientes de importación y su liquidación de costos.", icono: "importaciones", modulo: "importaciones" },
    ],
  },
  {
    id: "inventario", etiqueta: "Inventario", icono: "inventario",
    items: [
      { href: "/productos", etiqueta: "Productos", descripcion: "Fichas de producto, precios, costos y listas.", icono: "productos", modulo: "productos" },
      { href: "/catalogos", etiqueta: "Catálogos", descripcion: "Categorías, subcategorías, alícuotas de IVA, aranceles y unidades de medida.", icono: "catalogos", modulo: "catalogos" },
      { href: "/existencias", etiqueta: "Existencias", descripcion: "Existencias por almacén y sus movimientos.", icono: "existencias", modulo: "existencias" },
    ],
  },
  {
    id: "finanzas", etiqueta: "Finanzas", icono: "finanzas",
    items: [
      { href: "/tasas", etiqueta: "Tasa de cambio", descripcion: "Tasa del dólar y del euro en bolívares, con su historial.", icono: "tasas", modulo: "tasas" },
      { href: "/cxc", etiqueta: "Cuentas por cobrar", descripcion: "Cobros, abonos y estado de cuenta de clientes.", icono: "cxc", modulo: "cxc" },
      { href: "/cxp", etiqueta: "Cuentas por pagar", descripcion: "Pagos a proveedores y retenciones.", icono: "cxp", modulo: "cxp" },
      { href: "/tesoreria", etiqueta: "Tesorería y bancos", descripcion: "Caja, bancos y conciliación.", icono: "tesoreria", modulo: "tesoreria" },
      { href: "/contabilidad", etiqueta: "Contabilidad", descripcion: "Plan de cuentas, asientos, cierres y libros.", icono: "contabilidad", modulo: "contabilidad" },
    ],
  },
  {
    id: "analisis", etiqueta: "Análisis", icono: "analisis",
    items: [
      { href: "/gerencial", etiqueta: "Gerencial", descripcion: "Consultas y listados de gestión: artículos, movimientos, ventas y compras.", icono: "reportes", modulo: "reportes" },
      { href: "/reportes", etiqueta: "Reportes", descripcion: "Reportes gerenciales y fiscales para exportar.", icono: "reportes", modulo: "reportes" },
    ],
  },
  {
    id: "configuracion", etiqueta: "Configuración", icono: "configuracion", alPie: true,
    items: [{ href: "/tablas", etiqueta: "Tablas base", descripcion: "Condiciones de pago, vendedores, bancos, transportes, retenciones de ISLR y geografía.", icono: "tablas", modulo: "tablas" },
      { href: "/seguridad", etiqueta: "Usuarios y perfiles", descripcion: "Quién entra al sistema y qué puede hacer en cada módulo.", icono: "seguridad", modulo: "seguridad" },
      { href: "/auditoria", etiqueta: "Auditoría", descripcion: "Ingresos al sistema y cambios hechos por los usuarios.", icono: "auditoria", modulo: "auditoria" },
    ],
  },
];

export const itemsMenu = [inicio, ...areas.flatMap((a) => a.items)];

export function menuPara(puedeVer: (modulo: string) => boolean): AreaMenu[] {
  return areas
    .map((a) => ({ ...a, items: a.items.filter((i) => i.modulo === null || puedeVer(i.modulo)) }))
    .filter((a) => a.items.length > 0);
}

export function estaActivo(href: string, ruta: string) {
  return href === "/" ? ruta === "/" : ruta === href || ruta.startsWith(`${href}/`);
}
export function areaDe(ruta: string) {
  return areas.find((a) => a.items.some((i) => estaActivo(i.href, ruta))) ?? null;
}
export function ubicacion(ruta: string) {
  if (estaActivo(inicio.href, ruta)) return { area: null, item: inicio };
  const area = areaDe(ruta);
  const item = area?.items.find((i) => estaActivo(i.href, ruta));
  return area && item ? { area: area.etiqueta, item } : null;
}
