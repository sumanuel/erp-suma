import type { CampoForm } from "@/lib/formularios";
import type { Delegado, Fila, Maestro } from "./tipos";
import { conErrores, etiquetaActivo, filtroActivo } from "./comunes";
import { ubicacion, validarUbicacion } from "./terceros";

// Catálogos que el sistema anterior tenía aparte: sucursales, actividad económica, clasificaciones de clientes y proveedores, divisiones, colores, tallas,
// series fiscales y ubicaciones físicas; y las personas de contacto y sucursales de cada cliente y proveedor.

const clave = { campo: "id", autogenerada: true } as const;
const mayusculas = (d: Fila) => ({ ...d, codigo: typeof d.codigo === "string" ? d.codigo.toUpperCase() : d.codigo });
const rel = (f: Fila, r: string, campo: string) => (f[r] as Record<string, unknown> | null | undefined)?.[campo] as string | undefined;
const opcional = (nombre: string, etiqueta: string, max: number, extra = {}): CampoForm => ({ nombre, etiqueta: `${etiqueta} (opcional)`, tipo: "texto", max, ...extra });
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const errorEmail = (d: Fila) => (typeof d.email === "string" && d.email && !EMAIL.test(d.email) ? { email: "Correo inválido." } : null);

/** Catálogo simple: código, nombre y, si se pide, observaciones. */
function sencillo(id: string, ruta: string, entidad: string, singular: string, plural: string, genero: "el" | "la", delegado: Maestro["delegado"], opciones: { campoNota?: "observaciones" | "comentario"; dependientes?: string } = {}): Maestro {
  const nota = opciones.campoNota;
  return {
    id, modulo: "catalogos", ruta, entidad, singular, plural, genero, delegado, clave,
    campos: [
      { nombre: "codigo", etiqueta: "Código", tipo: "texto", max: 15, requerido: true, soloCrear: true, ayuda: "No se puede cambiar después." },
      { nombre: "nombre", etiqueta: "Nombre", tipo: "texto", max: 100, requerido: true, ancho: 2 },
      ...(nota ? [{ nombre: nota, etiqueta: nota === "comentario" ? "Comentario" : "Observaciones", tipo: "textoLargo" as const, max: 500, ancho: 3 as const }] : []),
      { nombre: "activo", etiqueta: "Activo", tipo: "booleano" },
    ],
    valoresIniciales: { activo: true },
    columnas: [{ id: "nombre", titulo: "Nombre", campo: "nombre", fija: true }, { id: "codigo", titulo: "Código", campo: "codigo" }, { id: "activo", titulo: "Estado", campo: "activo", etiqueta: etiquetaActivo }],
    busqueda: { texto: "Buscar por código o nombre", campos: ["codigo", "nombre"] }, filtros: [filtroActivo],
    orden: { columna: "nombre", dir: "asc" }, titulo: (f) => String(f.nombre ?? ""), descripcion: (f) => `Código ${f.codigo}`,
    preparar: mayusculas, mensajeDuplicado: `Ya existe ${genero === "el" ? "un" : "una"} ${singular} con este código.`,
    mensajeDependientes: opciones.dependientes ?? "No se puede eliminar porque está en uso. Márcalo como inactivo en su lugar.",
  };
}

export const actividadesEconomicas = sencillo("actividades-economicas", "/catalogos/actividades", "actividad_economica", "actividad económica", "actividades económicas", "la", (db) => db.actividadEconomica as unknown as Delegado, { campoNota: "observaciones", dependientes: "No se puede eliminar: hay clientes o proveedores con esta actividad. Márcala como inactiva en su lugar." });
export const clasificacionesCliente = sencillo("clasificaciones-cliente", "/catalogos/clasificacion-clientes", "clasificacion_cliente", "clasificación de clientes", "clasificaciones de clientes", "la", (db) => db.clasificacionCliente as unknown as Delegado, { campoNota: "observaciones", dependientes: "No se puede eliminar: hay clientes con esta clasificación. Márcala como inactiva en su lugar." });
export const clasificacionesProveedor = sencillo("clasificaciones-proveedor", "/catalogos/clasificacion-proveedores", "clasificacion_proveedor", "clasificación de proveedores", "clasificaciones de proveedores", "la", (db) => db.clasificacionProveedor as unknown as Delegado, { campoNota: "observaciones", dependientes: "No se puede eliminar: hay proveedores con esta clasificación. Márcala como inactiva en su lugar." });
export const divisiones = sencillo("divisiones", "/catalogos/divisiones", "division", "división", "divisiones", "la", (db) => db.division as unknown as Delegado, { campoNota: "comentario", dependientes: "No se puede eliminar: hay productos en esta división. Márcala como inactiva en su lugar." });
export const colores = sencillo("colores", "/catalogos/colores", "color", "color", "colores", "el", (db) => db.color as unknown as Delegado);
export const tallas = sencillo("tallas", "/catalogos/tallas", "talla", "talla", "tallas", "la", (db) => db.talla as unknown as Delegado);

export const sucursales: Maestro = {
  id: "sucursales", modulo: "catalogos", ruta: "/catalogos/sucursales", entidad: "sucursal", singular: "sucursal", plural: "sucursales", genero: "la",
  delegado: (db) => db.sucursal as unknown as Delegado, clave,
  campos: async (db) => [
    { nombre: "codigo", etiqueta: "Código", tipo: "texto", max: 15, requerido: true, soloCrear: true, seccion: "Datos de la sucursal", ayuda: "No se puede cambiar después." },
    { nombre: "nombre", etiqueta: "Nombre", tipo: "texto", max: 100, requerido: true, ancho: 2 },
    opcional("rif", "RIF", 25), opcional("email", "Correo", 200), opcional("telefono1", "Teléfono 1", 20), opcional("telefono2", "Teléfono 2", 20), opcional("fax", "Fax", 20),
    { nombre: "fechaInicio", etiqueta: "Fecha de apertura (opcional)", tipo: "fecha" },
    { nombre: "fechaFin", etiqueta: "Fecha de cierre (opcional)", tipo: "fecha" },
    opcional("direccion", "Dirección", 300, { ancho: 3, seccion: "Ubicación" }),
    ...(await ubicacion(db, "Ubicación")),
    { nombre: "activo", etiqueta: "Activa", tipo: "booleano" },
  ],
  valoresIniciales: { activo: true },
  columnas: [
    { id: "nombre", titulo: "Nombre", campo: "nombre", fija: true }, { id: "codigo", titulo: "Código", campo: "codigo" },
    { id: "telefono1", titulo: "Teléfono", campo: "telefono1" }, { id: "direccion", titulo: "Dirección", campo: "direccion", oculta: true },
    { id: "activo", titulo: "Estado", campo: "activo", etiqueta: etiquetaActivo },
  ],
  busqueda: { texto: "Buscar por código o nombre", campos: ["codigo", "nombre"] }, filtros: [filtroActivo],
  orden: { columna: "nombre", dir: "asc" }, titulo: (f) => String(f.nombre ?? ""), descripcion: (f) => `Código ${f.codigo}`,
  preparar: mayusculas,
  validar: async (db, d) => {
    const e: Record<string, string> = { ...(await validarUbicacion(db, d)), ...(errorEmail(d) ?? {}) };
    if (d.fechaInicio && d.fechaFin && String(d.fechaFin) < String(d.fechaInicio)) e.fechaFin = "No puede ser anterior a la apertura.";
    return Object.keys(e).length ? e : null;
  },
  mensajeDuplicado: "Ya existe una sucursal con este código.", mensajeDependientes: "No se puede eliminar: hay almacenes en esta sucursal. Márcala como inactiva en su lugar.",
};

export const seriesFiscales: Maestro = {
  id: "series-fiscales", modulo: "catalogos", ruta: "/catalogos/series-fiscales", entidad: "serie_fiscal", singular: "serie fiscal", plural: "series fiscales", genero: "la",
  delegado: (db) => db.serieFiscal as unknown as Delegado, clave,
  campos: [
    { nombre: "serie", etiqueta: "Serie", tipo: "texto", max: 10, requerido: true, soloCrear: true, ayuda: "No se puede cambiar después." },
    { nombre: "documento", etiqueta: "Documento que imprime", tipo: "seleccion", requerido: true, opciones: [{ valor: "FACTURA", etiqueta: "Factura" }, { valor: "NOTA_CREDITO", etiqueta: "Nota de crédito" }, { valor: "NOTA_DEBITO", etiqueta: "Nota de débito" }] },
    opcional("impresora", "Impresora o máquina fiscal", 60), opcional("serial", "Serial de la máquina", 40), opcional("ip", "Dirección IP", 45), opcional("caja", "Caja", 20),
    { nombre: "puntoActivo", etiqueta: "Punto de venta activo", tipo: "booleano" },
    { nombre: "activo", etiqueta: "Activa", tipo: "booleano" },
  ],
  valoresIniciales: { activo: true, puntoActivo: true, documento: "FACTURA" },
  columnas: [
    { id: "serie", titulo: "Serie", campo: "serie", fija: true }, { id: "documento", titulo: "Documento", campo: "documento" },
    { id: "impresora", titulo: "Impresora", campo: "impresora" }, { id: "serial", titulo: "Serial", campo: "serial", oculta: true }, { id: "caja", titulo: "Caja", campo: "caja", oculta: true },
    { id: "activo", titulo: "Estado", campo: "activo", etiqueta: etiquetaActivo },
  ],
  busqueda: { texto: "Buscar por serie, impresora o serial", campos: ["serie", "impresora", "serial"] }, filtros: [filtroActivo],
  orden: { columna: "serie", dir: "asc" }, titulo: (f) => String(f.serie ?? ""), descripcion: (f) => String(f.documento ?? ""),
  preparar: (d) => ({ ...d, serie: typeof d.serie === "string" ? d.serie.toUpperCase() : d.serie }),
  validar: async (_db, d) => (typeof d.ip === "string" && d.ip && !/^[0-9a-zA-Z.:\-]{3,45}$/.test(d.ip) ? { ip: "Dirección inválida." } : null),
  mensajeDuplicado: "Ya existe una serie fiscal con ese nombre.",
};

export const ubicacionesFisicas: Maestro = {
  id: "ubicaciones-fisicas", modulo: "existencias", ruta: "/existencias/ubicaciones", entidad: "ubicacion_fisica", singular: "ubicación física", plural: "ubicaciones físicas", genero: "la",
  delegado: (db) => db.ubicacionFisica as unknown as Delegado, clave,
  incluir: { almacen: { select: { nombre: true } } },
  campos: async (db) => [
    { nombre: "codigo", etiqueta: "Código", tipo: "texto", max: 20, requerido: true, soloCrear: true, ayuda: "No se puede cambiar después." },
    { nombre: "almacenId", etiqueta: "Almacén", tipo: "seleccion", requerido: true, opciones: (await db.almacen.findMany({ where: { activo: true }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true } })).map((a) => ({ valor: a.id, etiqueta: a.nombre })) },
    opcional("pasillo", "Pasillo", 20), opcional("anaquel", "Anaquel", 20), opcional("nivel", "Nivel", 20), opcional("sector", "Sector", 20),
    { nombre: "comentario", etiqueta: "Comentario (opcional)", tipo: "textoLargo", max: 300, ancho: 3 },
    { nombre: "activo", etiqueta: "Activa", tipo: "booleano" },
  ],
  valoresIniciales: { activo: true },
  columnas: [
    { id: "codigo", titulo: "Código", campo: "codigo", fija: true }, { id: "almacen", titulo: "Almacén", valor: (f) => rel(f, "almacen", "nombre") },
    { id: "pasillo", titulo: "Pasillo", campo: "pasillo" }, { id: "anaquel", titulo: "Anaquel", campo: "anaquel" }, { id: "nivel", titulo: "Nivel", campo: "nivel" }, { id: "sector", titulo: "Sector", campo: "sector", oculta: true },
    { id: "activo", titulo: "Estado", campo: "activo", etiqueta: etiquetaActivo },
  ],
  busqueda: { texto: "Buscar por código, pasillo o anaquel", campos: ["codigo", "pasillo", "anaquel"] }, filtros: [filtroActivo],
  orden: { columna: "codigo", dir: "asc" }, titulo: (f) => String(f.codigo ?? ""), descripcion: (f) => `Almacén ${rel(f, "almacen", "nombre") ?? ""}`,
  preparar: mayusculas, mensajeDuplicado: "Ya existe una ubicación con este código.",
};

// ---------- contactos y sucursales de clientes y proveedores ----------

function contactos(id: string, modulo: "clientes" | "proveedores", ruta: string, delegado: Maestro["delegado"], tercero: "cliente" | "proveedor"): Maestro {
  const fk = tercero === "cliente" ? "clienteId" : "proveedorId";
  return {
    id, modulo, ruta, entidad: `contacto_${tercero}`, singular: "contacto", plural: "contactos", genero: "el", delegado, clave,
    incluir: { [tercero]: { select: { razonSocial: true } } },
    campos: async (db) => {
      const lista = tercero === "cliente"
        ? await db.cliente.findMany({ where: { activo: true }, orderBy: { razonSocial: "asc" }, take: 2000, select: { id: true, razonSocial: true } })
        : await db.proveedor.findMany({ where: { activo: true }, orderBy: { razonSocial: "asc" }, take: 2000, select: { id: true, razonSocial: true } });
      return [
        { nombre: fk, etiqueta: tercero === "cliente" ? "Cliente" : "Proveedor", tipo: "seleccion", requerido: true, soloCrear: true, opciones: lista.map((c) => ({ valor: c.id, etiqueta: c.razonSocial })) },
        { nombre: "nombre", etiqueta: "Nombre de la persona", tipo: "texto", max: 120, requerido: true },
        opcional("cargo", "Cargo", 60), opcional("telefono", "Teléfono", 30), opcional("extension", "Extensión", 10), opcional("celular", "Celular", 30), opcional("email", "Correo", 200),
        { nombre: "observaciones", etiqueta: "Observaciones (opcional)", tipo: "textoLargo", max: 500, ancho: 3 },
        { nombre: "activo", etiqueta: "Activo", tipo: "booleano" },
      ];
    },
    valoresIniciales: { activo: true },
    columnas: [
      { id: "nombre", titulo: "Nombre", campo: "nombre", fija: true }, { id: "tercero", titulo: tercero === "cliente" ? "Cliente" : "Proveedor", valor: (f) => rel(f, tercero, "razonSocial") },
      { id: "cargo", titulo: "Cargo", campo: "cargo" }, { id: "telefono", titulo: "Teléfono", campo: "telefono" }, { id: "celular", titulo: "Celular", campo: "celular", oculta: true },
      { id: "email", titulo: "Correo", campo: "email", oculta: true }, { id: "activo", titulo: "Estado", campo: "activo", etiqueta: etiquetaActivo },
    ],
    busqueda: { texto: "Buscar por nombre, cargo o correo", campos: ["nombre", "cargo", "email"] }, filtros: [filtroActivo],
    orden: { columna: "nombre", dir: "asc" }, titulo: (f) => String(f.nombre ?? ""), descripcion: (f) => String(rel(f, tercero, "razonSocial") ?? ""),
    validar: async (_db, d) => conErrores({ ...(errorEmail(d) ?? {}) }),
  };
}

export const contactosCliente = contactos("contactos-cliente", "clientes", "/clientes/contactos", (db) => db.contactoCliente as unknown as Delegado, "cliente");
export const contactosProveedor = contactos("contactos-proveedor", "proveedores", "/proveedores/contactos", (db) => db.contactoProveedor as unknown as Delegado, "proveedor");

export const sucursalesCliente: Maestro = {
  id: "sucursales-cliente", modulo: "clientes", ruta: "/clientes/sucursales", entidad: "sucursal_cliente", singular: "sucursal de cliente", plural: "sucursales de clientes", genero: "la",
  delegado: (db) => db.sucursalCliente as unknown as Delegado, clave,
  incluir: { cliente: { select: { razonSocial: true } } },
  campos: async (db) => [
    { nombre: "clienteId", etiqueta: "Cliente", tipo: "seleccion", requerido: true, soloCrear: true, seccion: "Datos de la sucursal", opciones: (await db.cliente.findMany({ where: { activo: true }, orderBy: { razonSocial: "asc" }, take: 2000, select: { id: true, razonSocial: true } })).map((c) => ({ valor: c.id, etiqueta: c.razonSocial })) },
    { nombre: "codigo", etiqueta: "Código", tipo: "texto", max: 15, requerido: true, soloCrear: true, ayuda: "Único dentro del cliente. No se puede cambiar después." },
    { nombre: "nombre", etiqueta: "Nombre", tipo: "texto", max: 120, requerido: true },
    opcional("contacto", "Persona de contacto", 100), opcional("cargo", "Cargo", 60), opcional("telefono", "Teléfono", 30), opcional("celular", "Celular", 30), opcional("fax", "Fax", 30), opcional("email", "Correo", 200),
    opcional("direccion", "Dirección", 300, { ancho: 3, seccion: "Ubicación" }),
    ...(await ubicacion(db, "Ubicación")),
    { nombre: "observaciones", etiqueta: "Observaciones (opcional)", tipo: "textoLargo", max: 500, ancho: 3 },
    { nombre: "activo", etiqueta: "Activa", tipo: "booleano" },
  ],
  valoresIniciales: { activo: true },
  columnas: [
    { id: "nombre", titulo: "Nombre", campo: "nombre", fija: true }, { id: "cliente", titulo: "Cliente", valor: (f) => rel(f, "cliente", "razonSocial") }, { id: "codigo", titulo: "Código", campo: "codigo" },
    { id: "telefono", titulo: "Teléfono", campo: "telefono" }, { id: "direccion", titulo: "Dirección", campo: "direccion", oculta: true }, { id: "activo", titulo: "Estado", campo: "activo", etiqueta: etiquetaActivo },
  ],
  busqueda: { texto: "Buscar por código, nombre o dirección", campos: ["codigo", "nombre", "direccion"] }, filtros: [filtroActivo],
  orden: { columna: "nombre", dir: "asc" }, titulo: (f) => String(f.nombre ?? ""), descripcion: (f) => String(rel(f, "cliente", "razonSocial") ?? ""),
  preparar: mayusculas,
  validar: async (db, d) => {
    const e: Record<string, string> = { ...(await validarUbicacion(db, d)), ...(errorEmail(d) ?? {}) };
    return Object.keys(e).length ? e : null;
  },
  mensajeDuplicado: "Este cliente ya tiene una sucursal con ese código.",
};
