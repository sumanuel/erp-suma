// Catálogo de módulos y acciones. Un permiso es "<modulo>.<accion>".
export const ACCIONES = ["ver", "crear", "editar", "eliminar", "exportar"] as const;
export type Accion = (typeof ACCIONES)[number];

export const MODULOS = [
  { id: "clientes", nombre: "Clientes" },
  { id: "cotizaciones", nombre: "Cotizaciones" },
  { id: "pedidos", nombre: "Pedidos" },
  { id: "facturacion", nombre: "Facturación" },
  { id: "pos", nombre: "Punto de venta" },
  { id: "proveedores", nombre: "Proveedores" },
  { id: "compras", nombre: "Compras" },
  { id: "importaciones", nombre: "Importaciones" },
  { id: "productos", nombre: "Productos" },
  { id: "catalogos", nombre: "Catálogos de producto" },
  { id: "tablas", nombre: "Tablas base" },
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

/** Permisos especiales que no son de un módulo y una acción: controles puntuales dentro de un proceso. */
export const PERMISOS_ESPECIALES = [
  { id: "ventas.cambiar_precio", nombre: "Cambiar el precio de venta", ayuda: "Escribir en una cotización, pedido, factura o venta del mostrador un precio distinto al de la lista del cliente." },
  { id: "ventas.aprobar", nombre: "Aprobación gerencial de ventas", ayuda: "Aprobar o rechazar los pedidos que quedan por aprobar (reglas de aprobación gerencial) y autorizar excepciones de crédito al emitir una factura, y hacer devoluciones totales." },
] as const;
export type PermisoEspecial = (typeof PERMISOS_ESPECIALES)[number]["id"];
export const esPermisoEspecial = (p: string) => PERMISOS_ESPECIALES.some((x) => x.id === p);

export const todosLosPermisos = () => [...MODULOS.flatMap((m) => ACCIONES.map((a) => permiso(m.id, a))), ...PERMISOS_ESPECIALES.map((p) => p.id as string)];
