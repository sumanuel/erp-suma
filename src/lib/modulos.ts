// Catálogo de módulos y acciones. Un permiso es "<modulo>.<accion>".
export const ACCIONES = ["ver", "crear", "editar", "eliminar", "exportar"] as const;
export type Accion = (typeof ACCIONES)[number];

export const MODULOS = [
  { id: "clientes", nombre: "Clientes" },
  { id: "cotizaciones", nombre: "Cotizaciones" },
  { id: "pedidos", nombre: "Pedidos" },
  { id: "facturacion", nombre: "Facturación" },
  { id: "proveedores", nombre: "Proveedores" },
  { id: "compras", nombre: "Compras" },
  { id: "importaciones", nombre: "Importaciones" },
  { id: "productos", nombre: "Productos" },
  { id: "catalogos", nombre: "Catálogos de producto" },
  { id: "existencias", nombre: "Existencias" },
  { id: "tasas", nombre: "Tasa de cambio" },
  { id: "cxc", nombre: "Cuentas por cobrar" },
  { id: "cxp", nombre: "Cuentas por pagar" },
  { id: "tesoreria", nombre: "Tesorería y bancos" },
  { id: "contabilidad", nombre: "Contabilidad" },
  { id: "reportes", nombre: "Reportes" },
  { id: "seguridad", nombre: "Usuarios y perfiles" },
  { id: "auditoria", nombre: "Auditoría" },
] as const;

export type ModuloId = (typeof MODULOS)[number]["id"];

export const permiso = (modulo: string, accion: Accion) => `${modulo}.${accion}`;
export const todosLosPermisos = () => MODULOS.flatMap((m) => ACCIONES.map((a) => permiso(m.id, a)));
