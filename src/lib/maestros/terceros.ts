import type { CampoForm } from "@/lib/formularios";
import type { Delegado, Fila, Maestro } from "./tipos";

// Clientes y proveedores: dos maestros sobre el mismo motor. Para agregar otro, ver tipos.ts y registro.ts.

const normalizarDocumento = (datos: Fila): Fila => ({
  ...datos,
  documento: typeof datos.documento === "string" ? datos.documento.replace(/[\s.\-]/g, "").toUpperCase() : datos.documento,
});

async function validarTercero(_db: unknown, datos: Fila) {
  const errores: Record<string, string> = {};
  const doc = datos.documento;
  if (typeof doc === "string" && doc.length > 0 && !/^[A-Z0-9]{5,20}$/.test(doc)) errores.documento = "Documento inválido (5 a 20 letras o números).";
  const email = datos.email;
  if (typeof email === "string" && email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errores.email = "Correo inválido.";
  return Object.keys(errores).length ? errores : null;
}

const estado = (v: unknown) => (v === false ? { texto: "Inactivo", tono: "neutro" as const } : { texto: "Activo", tono: "exito" as const });
const filtroEstado = {
  id: "estado",
  etiqueta: "Estado",
  todos: "Activos e inactivos",
  opciones: [
    { valor: "activos", etiqueta: "Solo activos", donde: { activo: true } },
    { valor: "inactivos", etiqueta: "Solo inactivos", donde: { activo: false } },
  ],
};

const camposComunes = (extra: CampoForm[]): CampoForm[] => [
  { nombre: "razonSocial", etiqueta: "Razón social", tipo: "texto", max: 200, requerido: true },
  { nombre: "documento", etiqueta: "RIF / documento", tipo: "texto", max: 25, requerido: true, ayuda: "Los puntos, guiones y espacios se quitan al guardar." },
  { nombre: "nombreComercial", etiqueta: "Nombre comercial (opcional)", tipo: "texto", max: 200 },
  ...extra,
  { nombre: "telefono", etiqueta: "Teléfono (opcional)", tipo: "texto", max: 40 },
  { nombre: "email", etiqueta: "Correo (opcional)", tipo: "texto", max: 200 },
  { nombre: "direccion", etiqueta: "Dirección (opcional)", tipo: "texto", max: 300, ancho: 2 },
  { nombre: "activo", etiqueta: "Activo", tipo: "booleano" },
];

export const clientes: Maestro = {
  id: "clientes",
  modulo: "clientes",
  ruta: "/clientes",
  entidad: "cliente",
  singular: "cliente",
  plural: "clientes",
  genero: "el",
  delegado: (db) => db.cliente as unknown as Delegado,
  clave: { campo: "id", autogenerada: true },
  campos: camposComunes([
    { nombre: "tipo", etiqueta: "Tipo", tipo: "seleccion", requerido: true, opciones: ["Privado", "Público"].map((v) => ({ valor: v, etiqueta: v })) },
    { nombre: "categoria", etiqueta: "Categoría", tipo: "seleccion", opciones: ["Comercial", "Industrial", "Sanitario", "Municipal", "Residencial"].map((v) => ({ valor: v, etiqueta: v })) },
  ]),
  valoresIniciales: { activo: true },
  columnas: [
    { id: "razonSocial", titulo: "Razón social", campo: "razonSocial", fija: true },
    { id: "documento", titulo: "RIF", campo: "documento" },
    { id: "nombreComercial", titulo: "Nombre comercial", campo: "nombreComercial" },
    { id: "tipo", titulo: "Tipo", campo: "tipo" },
    { id: "categoria", titulo: "Categoría", campo: "categoria" },
    { id: "telefono", titulo: "Teléfono", campo: "telefono", oculta: true },
    { id: "email", titulo: "Correo", campo: "email", oculta: true },
    { id: "activo", titulo: "Estado", campo: "activo", etiqueta: estado },
  ],
  busqueda: { texto: "Buscar por razón social, nombre comercial o RIF", campos: ["razonSocial", "nombreComercial", "documento"] },
  filtros: [filtroEstado],
  orden: { columna: "razonSocial", dir: "asc" },
  titulo: (f) => String(f.razonSocial ?? ""),
  descripcion: (f) => `RIF ${f.documento}`,
  preparar: normalizarDocumento,
  validar: validarTercero,
  mensajeDuplicado: "Ya existe un cliente con este documento.",
  mensajeDependientes: "No se puede eliminar: tiene documentos asociados. Márcalo como inactivo en su lugar.",
};

export const proveedores: Maestro = {
  id: "proveedores",
  modulo: "proveedores",
  ruta: "/proveedores",
  entidad: "proveedor",
  singular: "proveedor",
  plural: "proveedores",
  genero: "el",
  delegado: (db) => db.proveedor as unknown as Delegado,
  clave: { campo: "id", autogenerada: true },
  campos: camposComunes([
    { nombre: "contacto", etiqueta: "Persona de contacto (opcional)", tipo: "texto", max: 120 },
    { nombre: "diasCredito", etiqueta: "Días de crédito", tipo: "entero", requerido: true, ayuda: "0 = contado." },
  ]),
  valoresIniciales: { activo: true, diasCredito: "0" },
  columnas: [
    { id: "razonSocial", titulo: "Razón social", campo: "razonSocial", fija: true },
    { id: "documento", titulo: "RIF", campo: "documento" },
    { id: "contacto", titulo: "Contacto", campo: "contacto" },
    { id: "telefono", titulo: "Teléfono", campo: "telefono" },
    { id: "diasCredito", titulo: "Días de crédito", campo: "diasCredito", alinear: "derecha" },
    { id: "email", titulo: "Correo", campo: "email", oculta: true },
    { id: "activo", titulo: "Estado", campo: "activo", etiqueta: estado },
  ],
  busqueda: { texto: "Buscar por razón social, nombre comercial o RIF", campos: ["razonSocial", "nombreComercial", "documento"] },
  filtros: [filtroEstado],
  orden: { columna: "razonSocial", dir: "asc" },
  titulo: (f) => String(f.razonSocial ?? ""),
  descripcion: (f) => `RIF ${f.documento}`,
  preparar: normalizarDocumento,
  validar: async (db, datos) => {
    const errores = (await validarTercero(db, datos)) ?? {};
    const d = datos.diasCredito;
    if (typeof d === "number" && (d < 0 || d > 365)) errores.diasCredito = "Entre 0 y 365 días.";
    return Object.keys(errores).length ? errores : null;
  },
  mensajeDuplicado: "Ya existe un proveedor con este documento.",
  mensajeDependientes: "No se puede eliminar: tiene compras asociadas. Márcalo como inactivo en su lugar.",
};
