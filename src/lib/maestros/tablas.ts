import type { Delegado, Maestro } from "./tipos";
import { conErrores, etiquetaActivo, filtroActivo, noNegativos, rangoPorcentaje } from "./comunes";
import { errorProntoPago } from "@/lib/ventas/condiciones";

// Tablas base comerciales y financieras (condición de pago, vendedores, tipo de negocio, transporte, bancos, tarifas de ISLR y geografía).
// Equivalen a admcondpago, admvendedor, admtiponegocio, admtransporte, admbancos, admtarifasreten y a las tablas geográficas del sistema anterior.

const mayusculas = (d: Record<string, unknown>) => ({ ...d, codigo: typeof d.codigo === "string" ? d.codigo.toUpperCase() : d.codigo });
const dias = (d: Record<string, unknown>, campos: string[]) => {
  const e: Record<string, string> = {};
  for (const c of campos) if (typeof d[c] === "number" && ((d[c] as number) < 0 || (d[c] as number) > 365)) e[c] = "Debe estar entre 0 y 365.";
  return e;
};
const clave = { campo: "id", autogenerada: true } as const;
const textoMax = (nombre: string, etiqueta: string, max: number, extra = {}) => ({ nombre, etiqueta: `${etiqueta} (opcional)`, tipo: "texto" as const, max, ...extra });

export const condicionesPago: Maestro = {
  id: "condiciones-pago", modulo: "tablas", ruta: "/tablas", entidad: "condicion_pago", singular: "condición de pago", plural: "condiciones de pago", genero: "la",
  delegado: (db) => db.condicionPago as unknown as Delegado, clave,
  campos: [
    { nombre: "codigo", etiqueta: "Código", tipo: "texto", max: 10, requerido: true, soloCrear: true, ayuda: "No se puede cambiar después." },
    { nombre: "nombre", etiqueta: "Descripción", tipo: "texto", max: 100, requerido: true, ancho: 2 },
    { nombre: "dias", etiqueta: "Días de plazo", tipo: "entero", requerido: true, ayuda: "0 = contado." },
    { nombre: "diasMora", etiqueta: "Días de gracia antes de la mora", tipo: "entero", requerido: true },
    { nombre: "prontoPagoDias1", etiqueta: "Pronto pago 1: días", tipo: "entero", requerido: true, seccion: "Pronto pago", ayuda: "Si el cliente paga dentro de estos días desde la factura, se le da el porcentaje. 0 = sin pronto pago." },
    { nombre: "prontoPagoPct1", etiqueta: "Pronto pago 1: porcentaje de descuento", tipo: "decimal", requerido: true },
    { nombre: "prontoPagoDias2", etiqueta: "Pronto pago 2: días", tipo: "entero", requerido: true, ayuda: "Debe ser mayor que los días del pronto pago 1." },
    { nombre: "prontoPagoPct2", etiqueta: "Pronto pago 2: porcentaje de descuento", tipo: "decimal", requerido: true },
    { nombre: "observaciones", etiqueta: "Observaciones", tipo: "textoLargo", max: 255, ancho: 3, seccion: "Otros datos" },
    { nombre: "activo", etiqueta: "Activa", tipo: "booleano" },
  ],
  valoresIniciales: { activo: true, dias: "0", diasMora: "0", prontoPagoDias1: "0", prontoPagoPct1: "0", prontoPagoDias2: "0", prontoPagoPct2: "0" },
  columnas: [
    { id: "nombre", titulo: "Descripción", campo: "nombre", fija: true },
    { id: "codigo", titulo: "Código", campo: "codigo" },
    { id: "dias", titulo: "Días de plazo", campo: "dias", alinear: "derecha" },
    { id: "diasMora", titulo: "Días de gracia", campo: "diasMora", alinear: "derecha", oculta: true },
    { id: "activo", titulo: "Estado", campo: "activo", etiqueta: etiquetaActivo },
  ],
  busqueda: { texto: "Buscar por código o descripción", campos: ["codigo", "nombre"] }, filtros: [filtroActivo],
  orden: { columna: "dias", dir: "asc" }, titulo: (f) => String(f.nombre ?? ""), descripcion: (f) => `Código ${f.codigo} · ${f.dias} día(s) de plazo`,
  preparar: mayusculas,
  validar: async (_db, d) => {
    const n = (c: string) => Number(d[c] ?? 0);
    const msg = errorProntoPago([n("prontoPagoDias1"), n("prontoPagoPct1"), n("prontoPagoDias2"), n("prontoPagoPct2")]);
    return conErrores(dias(d, ["dias", "diasMora"]), msg ? { prontoPagoDias1: msg } : {});
  },
  mensajeDuplicado: "Ya existe una condición de pago con este código.",
};

export const vendedores: Maestro = {
  id: "vendedores", modulo: "tablas", ruta: "/tablas/vendedores", entidad: "vendedor", singular: "vendedor o cobrador", plural: "vendedores y cobradores", genero: "el",
  delegado: (db) => db.vendedor as unknown as Delegado, clave,
  campos: [
    { nombre: "codigo", etiqueta: "Código", tipo: "texto", max: 10, requerido: true, soloCrear: true, ayuda: "No se puede cambiar después." },
    { nombre: "nombre", etiqueta: "Nombre", tipo: "texto", max: 100, requerido: true, ancho: 2 },
    textoMax("cedula", "Cédula", 15), textoMax("cargo", "Cargo", 60), textoMax("grupo", "Grupo", 20),
    { nombre: "esVendedor", etiqueta: "Es vendedor", tipo: "booleano" },
    { nombre: "esCobrador", etiqueta: "Es cobrador", tipo: "booleano" },
    { nombre: "activo", etiqueta: "Activo", tipo: "booleano" },
  ],
  valoresIniciales: { activo: true, esVendedor: true, esCobrador: false },
  columnas: [
    { id: "nombre", titulo: "Nombre", campo: "nombre", fija: true },
    { id: "codigo", titulo: "Código", campo: "codigo" },
    { id: "cedula", titulo: "Cédula", campo: "cedula" },
    { id: "cargo", titulo: "Cargo", campo: "cargo", oculta: true },
    { id: "rol", titulo: "Función", valor: (f) => [f.esVendedor ? "Vendedor" : "", f.esCobrador ? "Cobrador" : ""].filter(Boolean).join(" y ") },
    { id: "activo", titulo: "Estado", campo: "activo", etiqueta: etiquetaActivo },
  ],
  busqueda: { texto: "Buscar por código, nombre o cédula", campos: ["codigo", "nombre", "cedula"] },
  filtros: [
    { id: "funcion", etiqueta: "Función", todos: "Vendedores y cobradores", opciones: [{ valor: "vendedores", etiqueta: "Vendedores", donde: { esVendedor: true } }, { valor: "cobradores", etiqueta: "Cobradores", donde: { esCobrador: true } }] },
    filtroActivo,
  ],
  orden: { columna: "nombre", dir: "asc" }, titulo: (f) => String(f.nombre ?? ""), descripcion: (f) => `Código ${f.codigo}`,
  preparar: mayusculas,
  validar: async (_db, d) => (d.esVendedor === false && d.esCobrador === false ? { esVendedor: "Debe ser vendedor, cobrador o ambos." } : null),
  mensajeDuplicado: "Ya existe una persona con este código.",
};

export const tiposNegocio: Maestro = {
  id: "tipos-negocio", modulo: "tablas", ruta: "/tablas/tipos-negocio", entidad: "tipo_negocio", singular: "tipo de negocio", plural: "tipos de negocio", genero: "el",
  delegado: (db) => db.tipoNegocio as unknown as Delegado, clave,
  campos: [
    { nombre: "codigo", etiqueta: "Código", tipo: "texto", max: 10, requerido: true, soloCrear: true, ayuda: "No se puede cambiar después." },
    { nombre: "nombre", etiqueta: "Descripción", tipo: "texto", max: 100, requerido: true, ancho: 2 },
    { nombre: "descuento1", etiqueta: "Tope de descuento 1 (%)", tipo: "decimal", requerido: true },
    { nombre: "descuento2", etiqueta: "Tope de descuento 2 (%)", tipo: "decimal", requerido: true },
    { nombre: "descuento3", etiqueta: "Tope de descuento 3 (%)", tipo: "decimal", requerido: true },
    { nombre: "primeraLeyendaDias", etiqueta: "Primera leyenda: días", tipo: "entero", requerido: true },
    { nombre: "primeraLeyendaPct", etiqueta: "Primera leyenda: porcentaje", tipo: "decimal", requerido: true },
    { nombre: "segundaLeyendaDias", etiqueta: "Segunda leyenda: días", tipo: "entero", requerido: true },
    { nombre: "segundaLeyendaPct", etiqueta: "Segunda leyenda: porcentaje", tipo: "decimal", requerido: true },
    { nombre: "observaciones", etiqueta: "Observaciones", tipo: "textoLargo", max: 1000, ancho: 3 },
    { nombre: "activo", etiqueta: "Activo", tipo: "booleano" },
  ],
  valoresIniciales: { activo: true, descuento1: "0", descuento2: "0", descuento3: "0", primeraLeyendaDias: "0", primeraLeyendaPct: "0", segundaLeyendaDias: "0", segundaLeyendaPct: "0" },
  columnas: [
    { id: "nombre", titulo: "Descripción", campo: "nombre", fija: true },
    { id: "codigo", titulo: "Código", campo: "codigo" },
    { id: "descuento1", titulo: "Desc. 1 %", campo: "descuento1", alinear: "derecha" },
    { id: "descuento2", titulo: "Desc. 2 %", campo: "descuento2", alinear: "derecha", oculta: true },
    { id: "descuento3", titulo: "Desc. 3 %", campo: "descuento3", alinear: "derecha", oculta: true },
    { id: "activo", titulo: "Estado", campo: "activo", etiqueta: etiquetaActivo },
  ],
  busqueda: { texto: "Buscar por código o descripción", campos: ["codigo", "nombre"] }, filtros: [filtroActivo],
  orden: { columna: "nombre", dir: "asc" }, titulo: (f) => String(f.nombre ?? ""), descripcion: (f) => `Código ${f.codigo}`,
  preparar: mayusculas,
  validar: async (_db, d) => conErrores(rangoPorcentaje(d, ["descuento1", "descuento2", "descuento3", "primeraLeyendaPct", "segundaLeyendaPct"]), noNegativos(d, ["primeraLeyendaDias", "segundaLeyendaDias"])),
  mensajeDuplicado: "Ya existe un tipo de negocio con este código.",
  mensajeDependientes: "No se puede eliminar: hay clientes de este tipo. Márcalo como inactivo en su lugar.",
};

export const transportes: Maestro = {
  id: "transportes", modulo: "tablas", ruta: "/tablas/transportes", entidad: "transporte", singular: "transporte", plural: "transportes", genero: "el",
  delegado: (db) => db.transporte as unknown as Delegado, clave,
  incluir: { proveedor: { select: { razonSocial: true } } },
  campos: async (db) => [
    { nombre: "codigo", etiqueta: "Código", tipo: "texto", max: 10, requerido: true, soloCrear: true, ayuda: "No se puede cambiar después." },
    { nombre: "nombre", etiqueta: "Descripción", tipo: "texto", max: 100, requerido: true, ancho: 2 },
    {
      nombre: "proveedorId", etiqueta: "Proveedor (opcional)", tipo: "seleccion", ayuda: "Si la empresa de transporte es un proveedor, para pagarle.",
      opciones: (await db.proveedor.findMany({ where: { activo: true }, orderBy: { razonSocial: "asc" }, select: { id: true, razonSocial: true } })).map((p) => ({ valor: p.id, etiqueta: p.razonSocial })),
    },
    { nombre: "observaciones", etiqueta: "Observaciones", tipo: "textoLargo", max: 1000, ancho: 3 },
    { nombre: "activo", etiqueta: "Activo", tipo: "booleano" },
  ],
  valoresIniciales: { activo: true },
  columnas: [
    { id: "nombre", titulo: "Descripción", campo: "nombre", fija: true },
    { id: "codigo", titulo: "Código", campo: "codigo" },
    { id: "proveedor", titulo: "Proveedor", valor: (f) => (f.proveedor as { razonSocial?: string } | null | undefined)?.razonSocial },
    { id: "activo", titulo: "Estado", campo: "activo", etiqueta: etiquetaActivo },
  ],
  busqueda: { texto: "Buscar por código o descripción", campos: ["codigo", "nombre"] }, filtros: [filtroActivo],
  orden: { columna: "nombre", dir: "asc" }, titulo: (f) => String(f.nombre ?? ""), descripcion: (f) => `Código ${f.codigo}`,
  preparar: mayusculas, mensajeDuplicado: "Ya existe un transporte con este código.",
};

export const bancos: Maestro = {
  id: "bancos", modulo: "tablas", ruta: "/tablas/bancos", entidad: "banco", singular: "banco", plural: "bancos", genero: "el",
  delegado: (db) => db.banco as unknown as Delegado, clave,
  campos: [
    { nombre: "codigo", etiqueta: "Código", tipo: "texto", max: 10, requerido: true, soloCrear: true, ayuda: "Por ejemplo, el código de 4 dígitos de la SUDEBAN." },
    { nombre: "nombre", etiqueta: "Nombre", tipo: "texto", max: 100, requerido: true, ancho: 2 },
    textoMax("direccion", "Dirección", 200, { ancho: 3 }), textoMax("contacto", "Persona de contacto", 100),
    textoMax("telefono1", "Teléfono 1", 20), textoMax("telefono2", "Teléfono 2", 20), textoMax("telefono3", "Teléfono 3", 20),
    textoMax("web", "Página web", 120, { ancho: 2 }), textoMax("casillero", "Casillero postal", 60),
    { nombre: "observaciones", etiqueta: "Observaciones", tipo: "textoLargo", max: 1000, ancho: 3 },
    { nombre: "activo", etiqueta: "Activo", tipo: "booleano" },
  ],
  valoresIniciales: { activo: true },
  columnas: [
    { id: "nombre", titulo: "Nombre", campo: "nombre", fija: true },
    { id: "codigo", titulo: "Código", campo: "codigo" },
    { id: "telefono1", titulo: "Teléfono", campo: "telefono1" },
    { id: "contacto", titulo: "Contacto", campo: "contacto", oculta: true },
    { id: "activo", titulo: "Estado", campo: "activo", etiqueta: etiquetaActivo },
  ],
  busqueda: { texto: "Buscar por código o nombre", campos: ["codigo", "nombre"] }, filtros: [filtroActivo],
  orden: { columna: "nombre", dir: "asc" }, titulo: (f) => String(f.nombre ?? ""), descripcion: (f) => `Código ${f.codigo}`,
  preparar: mayusculas, mensajeDuplicado: "Ya existe un banco con este código.", importable: true,
};

export const tarifasRetencion: Maestro = {
  id: "tarifas-islr", modulo: "tablas", ruta: "/tablas/tarifas-islr", entidad: "tarifa_retencion", singular: "concepto de retención de ISLR", plural: "conceptos de retención de ISLR", genero: "el",
  delegado: (db) => db.tarifaRetencion as unknown as Delegado, clave,
  campos: [
    { nombre: "codigo", etiqueta: "Número de concepto", tipo: "entero", requerido: true, soloCrear: true, ayuda: "No se puede cambiar después." },
    { nombre: "descripcion", etiqueta: "Descripción", tipo: "texto", max: 200, requerido: true, ancho: 2 },
    textoMax("conceptoXml", "Código del concepto en el XML del SENIAT", 10), textoMax("numeral", "Numeral", 10),
    { nombre: "tipoPersona", etiqueta: "Tipo de persona", tipo: "seleccion", requerido: true, opciones: [{ valor: "AMBAS", etiqueta: "Natural y jurídica" }, { valor: "NATURAL", etiqueta: "Solo natural" }, { valor: "JURIDICA", etiqueta: "Solo jurídica" }] },
    { nombre: "residente", etiqueta: "Residencia", tipo: "seleccion", requerido: true, opciones: [{ valor: "AMBOS", etiqueta: "Residentes y no residentes" }, { valor: "SI", etiqueta: "Solo residentes" }, { valor: "NO", etiqueta: "Solo no residentes" }] },
    { nombre: "porcentaje", etiqueta: "Porcentaje de retención", tipo: "decimal", requerido: true },
    { nombre: "acumulable", etiqueta: "Acumula la base en el mes", tipo: "booleano" },
    { nombre: "activo", etiqueta: "Activo", tipo: "booleano" },
  ],
  valoresIniciales: { activo: true, acumulable: false, tipoPersona: "AMBAS", residente: "AMBOS", porcentaje: "0" },
  columnas: [
    { id: "descripcion", titulo: "Descripción", campo: "descripcion", fija: true },
    { id: "codigo", titulo: "Concepto", campo: "codigo", alinear: "derecha" },
    { id: "numeral", titulo: "Numeral", campo: "numeral" },
    { id: "porcentaje", titulo: "Retención %", campo: "porcentaje", alinear: "derecha" },
    { id: "tipoPersona", titulo: "Persona", campo: "tipoPersona", oculta: true },
    { id: "residente", titulo: "Residente", campo: "residente", oculta: true },
    { id: "activo", titulo: "Estado", campo: "activo", etiqueta: etiquetaActivo },
  ],
  busqueda: { texto: "Buscar por descripción o numeral", campos: ["descripcion", "numeral"] }, filtros: [filtroActivo],
  orden: { columna: "codigo", dir: "asc" }, titulo: (f) => String(f.descripcion ?? ""), descripcion: (f) => `Concepto ${f.codigo}`,
  validar: async (_db, d) => conErrores(rangoPorcentaje(d, ["porcentaje"]), typeof d.codigo === "number" && d.codigo <= 0 ? { codigo: "Debe ser mayor que 0." } : {}),
  mensajeDuplicado: "Ya existe un concepto con este número.",
};

export const centrosCosto: Maestro = {
  id: "centros-costo", modulo: "tablas", ruta: "/tablas/centros-costo", entidad: "centro_costo", singular: "centro de costo", plural: "centros de costo", genero: "el",
  delegado: (db) => db.centroCosto as unknown as Delegado, clave,
  campos: [
    { nombre: "codigo", etiqueta: "Código", tipo: "texto", max: 15, requerido: true, soloCrear: true, ayuda: "No se puede cambiar después." },
    { nombre: "nombre", etiqueta: "Nombre", tipo: "texto", max: 100, requerido: true, ancho: 2 },
    { nombre: "activo", etiqueta: "Activo", tipo: "booleano" },
  ],
  valoresIniciales: { activo: true },
  columnas: [{ id: "nombre", titulo: "Nombre", campo: "nombre", fija: true }, { id: "codigo", titulo: "Código", campo: "codigo" }, { id: "activo", titulo: "Estado", campo: "activo", etiqueta: etiquetaActivo }],
  busqueda: { texto: "Buscar por código o nombre", campos: ["codigo", "nombre"] }, filtros: [filtroActivo],
  orden: { columna: "codigo", dir: "asc" }, titulo: (f) => String(f.nombre ?? ""), descripcion: (f) => `Código ${f.codigo}`,
  preparar: mayusculas, mensajeDuplicado: "Ya existe un centro de costo con este código.", mensajeDependientes: "No se puede eliminar: hay órdenes o documentos en este centro de costo. Márcalo como inactivo en su lugar.",
};

export const auxiliaresContables: Maestro = {
  id: "auxiliares-contables", modulo: "tablas", ruta: "/tablas/auxiliares", entidad: "auxiliar_contable", singular: "auxiliar contable", plural: "auxiliares contables", genero: "el",
  delegado: (db) => db.auxiliarContable as unknown as Delegado, clave,
  incluir: { cuenta: { select: { codigo: true, nombre: true } } },
  campos: async (db) => [
    {
      nombre: "cuentaId", etiqueta: "Cuenta contable", tipo: "seleccion", requerido: true, soloCrear: true, ayuda: "Una cuenta de movimiento. No se puede cambiar después.",
      opciones: (await db.cuentaContable.findMany({ where: { posteable: true, activo: true }, orderBy: { codigo: "asc" }, select: { id: true, codigo: true, nombre: true } })).map((c) => ({ valor: c.id, etiqueta: `${c.codigo} ${c.nombre}` })),
    },
    { nombre: "codigo", etiqueta: "Código del auxiliar", tipo: "texto", max: 20, requerido: true, soloCrear: true, ayuda: "No se puede cambiar después." },
    { nombre: "nombre", etiqueta: "Nombre", tipo: "texto", max: 120, requerido: true, ancho: 2 },
    { nombre: "manejaDocumentos", etiqueta: "Maneja documentos (facturas, cheques)", tipo: "booleano" },
    { nombre: "activo", etiqueta: "Activo", tipo: "booleano" },
  ],
  valoresIniciales: { activo: true, manejaDocumentos: false },
  columnas: [
    { id: "nombre", titulo: "Nombre", campo: "nombre", fija: true },
    { id: "codigo", titulo: "Código", campo: "codigo" },
    { id: "cuenta", titulo: "Cuenta", valor: (f) => { const c = f.cuenta as { codigo?: string; nombre?: string } | undefined; return c ? `${c.codigo} ${c.nombre}` : ""; } },
    { id: "manejaDocumentos", titulo: "Documentos", campo: "manejaDocumentos", etiqueta: (v) => (v === true ? { texto: "Sí", tono: "marca" } : { texto: "—", tono: "neutro" }), oculta: true },
    { id: "activo", titulo: "Estado", campo: "activo", etiqueta: etiquetaActivo },
  ],
  busqueda: { texto: "Buscar por código o nombre", campos: ["codigo", "nombre"] }, filtros: [filtroActivo],
  orden: { columna: "nombre", dir: "asc" }, titulo: (f) => String(f.nombre ?? ""), descripcion: (f) => `Código ${f.codigo}`,
  preparar: mayusculas,
  validar: async (db, d, editando) => {
    if (editando || typeof d.cuentaId !== "string") return null;
    const c = await db.cuentaContable.findUnique({ where: { id: d.cuentaId }, select: { posteable: true, activo: true } });
    return !c?.activo || !c.posteable ? { cuentaId: "Solo las cuentas de movimiento activas llevan auxiliares." } : null;
  },
  mensajeDuplicado: "Esa cuenta ya tiene un auxiliar con este código.", mensajeDependientes: "No se puede eliminar: tiene movimientos en asientos. Márcalo como inactivo en su lugar.",
};

// ---------- Geografía ----------

const geo = (id: string, modulo: string, ruta: string, entidad: string, singular: string, plural: string, genero: "el" | "la", delegado: Maestro["delegado"]) => ({ id, modulo, ruta, entidad, singular, plural, genero, delegado, clave });

export const paises: Maestro = {
  ...geo("paises", "tablas", "/tablas/geografia", "pais", "país", "países", "el", (db) => db.pais as unknown as Delegado),
  campos: [
    { nombre: "codigo", etiqueta: "Código", tipo: "texto", max: 10, requerido: true, soloCrear: true, ayuda: "No se puede cambiar después." },
    { nombre: "nombre", etiqueta: "Nombre", tipo: "texto", max: 100, requerido: true, ancho: 2 },
    { nombre: "activo", etiqueta: "Activo", tipo: "booleano" },
  ],
  valoresIniciales: { activo: true },
  columnas: [{ id: "nombre", titulo: "Nombre", campo: "nombre", fija: true }, { id: "codigo", titulo: "Código", campo: "codigo" }, { id: "activo", titulo: "Estado", campo: "activo", etiqueta: etiquetaActivo }],
  busqueda: { texto: "Buscar por código o nombre", campos: ["codigo", "nombre"] }, filtros: [filtroActivo],
  orden: { columna: "nombre", dir: "asc" }, titulo: (f) => String(f.nombre ?? ""), descripcion: (f) => `Código ${f.codigo}`,
  preparar: mayusculas, mensajeDuplicado: "Ya existe un país con este código.", mensajeDependientes: "No se puede eliminar: tiene estados. Márcalo como inactivo en su lugar.",
};

export const estados: Maestro = {
  ...geo("estados", "tablas", "/tablas/estados", "estado", "estado", "estados", "el", (db) => db.estado as unknown as Delegado),
  incluir: { pais: { select: { nombre: true } } },
  campos: async (db) => [
    { nombre: "paisId", etiqueta: "País", tipo: "seleccion", requerido: true, soloCrear: true, opciones: (await db.pais.findMany({ orderBy: { nombre: "asc" }, select: { id: true, nombre: true } })).map((p) => ({ valor: p.id, etiqueta: p.nombre })) },
    { nombre: "codigo", etiqueta: "Código", tipo: "texto", max: 10, requerido: true },
    { nombre: "nombre", etiqueta: "Nombre", tipo: "texto", max: 100, requerido: true },
    { nombre: "activo", etiqueta: "Activo", tipo: "booleano" },
  ],
  valoresIniciales: { activo: true },
  columnas: [
    { id: "nombre", titulo: "Nombre", campo: "nombre", fija: true }, { id: "pais", titulo: "País", valor: (f) => (f.pais as { nombre?: string } | undefined)?.nombre },
    { id: "codigo", titulo: "Código", campo: "codigo" }, { id: "activo", titulo: "Estado", campo: "activo", etiqueta: etiquetaActivo },
  ],
  busqueda: { texto: "Buscar por código o nombre", campos: ["codigo", "nombre"] }, filtros: [filtroActivo],
  orden: { columna: "nombre", dir: "asc" }, titulo: (f) => String(f.nombre ?? ""), descripcion: (f) => `Código ${f.codigo}`,
  preparar: mayusculas, mensajeDuplicado: "Ya existe un estado con este código en ese país.", mensajeDependientes: "No se puede eliminar: tiene municipios. Márcalo como inactivo en su lugar.",
};

export const municipios: Maestro = {
  ...geo("municipios", "tablas", "/tablas/municipios", "municipio", "municipio", "municipios", "el", (db) => db.municipio as unknown as Delegado),
  incluir: { estado: { select: { nombre: true } } },
  campos: async (db) => [
    { nombre: "estadoId", etiqueta: "Estado", tipo: "seleccion", requerido: true, soloCrear: true, opciones: (await db.estado.findMany({ orderBy: { nombre: "asc" }, select: { id: true, nombre: true, pais: { select: { nombre: true } } } })).map((e) => ({ valor: e.id, etiqueta: `${e.nombre} (${e.pais.nombre})` })) },
    { nombre: "codigo", etiqueta: "Código", tipo: "texto", max: 10, requerido: true },
    { nombre: "nombre", etiqueta: "Nombre", tipo: "texto", max: 100, requerido: true },
    { nombre: "activo", etiqueta: "Activo", tipo: "booleano" },
  ],
  valoresIniciales: { activo: true },
  columnas: [
    { id: "nombre", titulo: "Nombre", campo: "nombre", fija: true }, { id: "estado", titulo: "Estado", valor: (f) => (f.estado as { nombre?: string } | undefined)?.nombre },
    { id: "codigo", titulo: "Código", campo: "codigo" }, { id: "activo", titulo: "Situación", campo: "activo", etiqueta: etiquetaActivo },
  ],
  busqueda: { texto: "Buscar por código o nombre", campos: ["codigo", "nombre"] }, filtros: [filtroActivo],
  orden: { columna: "nombre", dir: "asc" }, titulo: (f) => String(f.nombre ?? ""), descripcion: (f) => `Código ${f.codigo}`,
  preparar: mayusculas, mensajeDuplicado: "Ya existe un municipio con este código en ese estado.", mensajeDependientes: "No se puede eliminar: tiene parroquias. Márcalo como inactivo en su lugar.",
};

export const parroquias: Maestro = {
  ...geo("parroquias", "tablas", "/tablas/parroquias", "parroquia", "parroquia", "parroquias", "la", (db) => db.parroquia as unknown as Delegado),
  incluir: { municipio: { select: { nombre: true, estado: { select: { nombre: true } } } } },
  campos: async (db) => [
    { nombre: "municipioId", etiqueta: "Municipio", tipo: "seleccion", requerido: true, soloCrear: true, opciones: (await db.municipio.findMany({ orderBy: { nombre: "asc" }, select: { id: true, nombre: true, estado: { select: { nombre: true } } } })).map((m) => ({ valor: m.id, etiqueta: `${m.nombre} (${m.estado.nombre})` })) },
    { nombre: "codigo", etiqueta: "Código", tipo: "texto", max: 10, requerido: true },
    { nombre: "nombre", etiqueta: "Nombre", tipo: "texto", max: 100, requerido: true },
    { nombre: "activo", etiqueta: "Activa", tipo: "booleano" },
  ],
  valoresIniciales: { activo: true },
  columnas: [
    { id: "nombre", titulo: "Nombre", campo: "nombre", fija: true },
    { id: "municipio", titulo: "Municipio", valor: (f) => (f.municipio as { nombre?: string } | undefined)?.nombre },
    { id: "estado", titulo: "Estado", valor: (f) => (f.municipio as { estado?: { nombre?: string } } | undefined)?.estado?.nombre, oculta: true },
    { id: "codigo", titulo: "Código", campo: "codigo" }, { id: "activo", titulo: "Situación", campo: "activo", etiqueta: etiquetaActivo },
  ],
  busqueda: { texto: "Buscar por código o nombre", campos: ["codigo", "nombre"] }, filtros: [filtroActivo],
  orden: { columna: "nombre", dir: "asc" }, titulo: (f) => String(f.nombre ?? ""), descripcion: (f) => `Código ${f.codigo}`,
  preparar: mayusculas, mensajeDuplicado: "Ya existe una parroquia con este código en ese municipio.",
};
