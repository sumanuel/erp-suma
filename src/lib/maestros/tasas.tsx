import { ResumenTasas } from "@/components/tasas/resumen-tasas";
import { hoyCaracas } from "@/lib/tasas";
import type { Delegado, Fila, Maestro } from "./tipos";
import { conErrores, etiquetaActivo, filtroActivo } from "./comunes";

const rel = (f: Fila, r: string, campo: string) => (f[r] as Record<string, unknown> | null | undefined)?.[campo];

export const tasas: Maestro = {
  id: "tasas",
  modulo: "tasas",
  ruta: "/tasas",
  entidad: "tasa_cambio",
  singular: "tasa",
  plural: "tasas",
  genero: "la",
  delegado: (db) => db.tasaCambio as unknown as Delegado,
  clave: { campo: "id", autogenerada: true },
  incluir: { moneda: { select: { codigo: true, simbolo: true } } },
  encabezado: async (db) => <ResumenTasas db={db} />,
  campos: async (db) => [
    {
      nombre: "monedaId", etiqueta: "Moneda", tipo: "seleccion", requerido: true, soloCrear: true,
      opciones: (await db.moneda.findMany({ where: { activo: true, esBase: false }, orderBy: { codigo: "asc" } })).map((m) => ({ valor: m.id, etiqueta: `${m.nombre} (${m.codigo})` })),
    },
    { nombre: "fecha", etiqueta: "Rige desde", tipo: "fecha", requerido: true, ayuda: "Si un día no tiene tasa, rige la última anterior." },
    { nombre: "valor", etiqueta: "Bolívares por 1 unidad", tipo: "decimal", requerido: true, ayuda: "Hasta 8 decimales, como la publica el BCV. Use punto o coma." },
    { nombre: "fuente", etiqueta: "Fuente", tipo: "seleccion", requerido: true, opciones: ["Manual", "BCV", "Otra"].map((v) => ({ valor: v, etiqueta: v })) },
    { nombre: "observacion", etiqueta: "Observación (opcional)", tipo: "texto", max: 200, ancho: 2 },
  ],
  // Getter: la fecha de hoy se calcula al abrir el formulario, no al arrancar el servidor.
  get valoresIniciales() {
    return { fecha: hoyCaracas().toISOString().slice(0, 10), fuente: "BCV" };
  },
  columnas: [
    { id: "fecha", titulo: "Rige desde", campo: "fecha", formato: "fecha", fija: true },
    { id: "moneda", titulo: "Moneda", valor: (f) => rel(f, "moneda", "codigo") },
    { id: "valor", titulo: "Bs. por unidad", campo: "valor", alinear: "derecha" },
    { id: "fuente", titulo: "Fuente", campo: "fuente" },
    { id: "observacion", titulo: "Observación", campo: "observacion" },
    { id: "creadoEn", titulo: "Cargada", campo: "creadoEn", formato: "fechaHora", oculta: true },
  ],
  busqueda: { texto: "Buscar por observación o fuente", campos: ["observacion", "fuente"] },
  orden: { columna: "fecha", dir: "desc" },
  titulo: (f) => `Tasa ${f.fecha instanceof Date ? f.fecha.toISOString().slice(0, 10) : f.fecha}`,
  validar: async (_db, d) => {
    const errores: Record<string, string> = {};
    const v = d.valor;
    if (typeof v === "number" && (v <= 0 || v >= 1e9)) errores.valor = "Debe ser mayor que 0.";
    if (typeof v === "number" && !/^\d+(\.\d{1,8})?$/.test(String(v))) errores.valor = "Máximo 8 decimales.";
    const f = d.fecha;
    if (f instanceof Date && f.getTime() > hoyCaracas().getTime() + 24 * 3600 * 1000) errores.fecha = "No puede ser posterior a mañana.";
    return conErrores(errores);
  },
};

export const monedas: Maestro = {
  id: "monedas",
  modulo: "tasas",
  ruta: "/tasas/monedas",
  entidad: "moneda",
  singular: "moneda",
  plural: "monedas",
  genero: "la",
  delegado: (db) => db.moneda as unknown as Delegado,
  clave: { campo: "id", autogenerada: true },
  campos: [
    { nombre: "codigo", etiqueta: "Código ISO", tipo: "texto", max: 3, requerido: true, soloCrear: true, ayuda: "3 letras, por ejemplo USD." },
    { nombre: "nombre", etiqueta: "Nombre", tipo: "texto", max: 60, requerido: true },
    { nombre: "simbolo", etiqueta: "Símbolo", tipo: "texto", max: 5, requerido: true },
    { nombre: "activo", etiqueta: "Activa", tipo: "booleano" },
  ],
  valoresIniciales: { activo: true },
  columnas: [
    { id: "nombre", titulo: "Nombre", campo: "nombre", fija: true },
    { id: "codigo", titulo: "Código", campo: "codigo" },
    { id: "simbolo", titulo: "Símbolo", campo: "simbolo" },
    { id: "base", titulo: "Tipo", campo: "esBase", etiqueta: (v) => (v === true ? { texto: "Moneda base", tono: "marca" } : { texto: "Divisa", tono: "neutro" }) },
    { id: "activo", titulo: "Estado", campo: "activo", etiqueta: etiquetaActivo },
  ],
  busqueda: { texto: "Buscar por código o nombre", campos: ["codigo", "nombre"] },
  filtros: [filtroActivo],
  orden: { columna: "nombre", dir: "asc" },
  titulo: (f) => String(f.nombre ?? ""),
  descripcion: (f) => `Código ${f.codigo}`,
  preparar: (d) => ({ ...d, codigo: typeof d.codigo === "string" ? d.codigo.toUpperCase() : d.codigo }),
  validar: async (_db, d) => (typeof d.codigo === "string" && !/^[A-Z]{3}$/.test(d.codigo) ? { codigo: "Deben ser 3 letras." } : null),
  validarEliminar: async (_db, r) => (r.esBase === true ? "La moneda base no se puede eliminar." : null),
  mensajeDuplicado: "Ya existe una moneda con este código.",
  mensajeDependientes: "No se puede eliminar: tiene tasas cargadas. Márcala como inactiva en su lugar.",
};
