import { mayorNumeroExistente, TIPOS_NUMERADOS, type TipoNumerado } from "@/lib/numeracion";
import type { Delegado, Maestro } from "./tipos";

// Numeración por tipo de documento (original: admtipdoccli / admtipdocpro). Los tipos vienen de fábrica: aquí se ajusta el contador interno,
// la serie fiscal y la numeración fiscal automática de las facturas.

const numero = (prefijo: string, n: number, digitos: number) => `${prefijo}${String(n).padStart(digitos, "0")}`;

export const tiposDocumento: Maestro = {
  id: "tipos-documento", modulo: "tablas", ruta: "/tablas/tipos-documento", entidad: "tipo_documento", singular: "tipo de documento", plural: "tipos de documento", genero: "el",
  delegado: (db) => db.tipoDocumento as unknown as Delegado, clave: { campo: "id", autogenerada: true },
  incluir: { serieFiscal: { select: { serie: true, impresora: true } } },
  sinCrear: true, sinEliminar: true,
  campos: async (db) => {
    const series = await db.serieFiscal.findMany({ where: { activo: true }, orderBy: { serie: "asc" }, select: { id: true, serie: true, impresora: true } });
    return [
      { nombre: "nombre", etiqueta: "Documento", tipo: "texto", max: 100, requerido: true, ancho: 2, seccion: "Numeración interna" },
      { nombre: "ultimoNumero", etiqueta: "Último número usado", tipo: "entero", requerido: true, ayuda: "El próximo documento toma este número + 1. No puede ser menor que el número más alto que ya exista." },
      { nombre: "serieFiscalId", etiqueta: "Serie fiscal", tipo: "seleccion", seccion: "Numeración fiscal (solo facturas)", opciones: series.map((s) => ({ valor: s.id, etiqueta: s.impresora ? `${s.serie} · ${s.impresora}` : s.serie })), ayuda: "Series que se crean en Catálogos › Series fiscales." },
      { nombre: "fiscalAutomatico", etiqueta: "El sistema asigna el número fiscal y el de control al emitir", tipo: "booleano", ayuda: "Si está apagado, los números se registran a mano en cada factura (máquina fiscal o imprenta). Si está encendido, salen de estos contadores, sin saltos." },
      { nombre: "ultimoFiscal", etiqueta: "Último número de factura fiscal", tipo: "entero", requerido: true },
      { nombre: "ultimoControl", etiqueta: "Último número de control", tipo: "entero", requerido: true },
    ];
  },
  columnas: [
    { id: "nombre", titulo: "Documento", campo: "nombre", fija: true },
    { id: "codigo", titulo: "Código", campo: "codigo", oculta: true },
    { id: "ultimoNumero", titulo: "Último número", valor: (f) => { const t = TIPOS_NUMERADOS[f.codigo as TipoNumerado]; return t ? numero(t.prefijo.split("/")[0], Number(f.ultimoNumero), t.digitos) : String(f.ultimoNumero); } },
    { id: "serie", titulo: "Serie fiscal", valor: (f) => (f.serieFiscal as { serie?: string } | null | undefined)?.serie ?? "—" },
    { id: "fiscal", titulo: "Numeración fiscal", valor: (f) => (f.codigo !== "FACTURA" ? "—" : f.fiscalAutomatico ? `Automática (último ${f.ultimoFiscal})` : "Manual") },
  ],
  busqueda: { texto: "Buscar por documento", campos: ["nombre", "codigo"] },
  orden: { columna: "nombre", dir: "asc" },
  titulo: (f) => String(f.nombre ?? ""), descripcion: (f) => `Código ${f.codigo}`,
  validar: async (db, d, _editando, clave) => {
    const errores: Record<string, string> = {};
    const t = clave ? await db.tipoDocumento.findUnique({ where: { id: String(clave) }, select: { codigo: true } }) : null;
    if (!t) return null;
    for (const c of ["ultimoNumero", "ultimoFiscal", "ultimoControl"]) if (typeof d[c] === "number" && (d[c] as number) < 0) errores[c] = "No puede ser negativo.";
    if (typeof d.ultimoNumero === "number" && TIPOS_NUMERADOS[t.codigo as TipoNumerado]?.tablas.length) {
      const mayor = await mayorNumeroExistente(db, t.codigo as TipoNumerado);
      if (d.ultimoNumero < mayor) errores.ultimoNumero = `Ya existe el número ${mayor}: el último usado no puede ser menor.`;
    }
    if (t.codigo !== "FACTURA" && (d.fiscalAutomatico || d.serieFiscalId || Number(d.ultimoFiscal) > 0 || Number(d.ultimoControl) > 0)) {
      errores.fiscalAutomatico = "La numeración fiscal solo aplica a las facturas.";
    }
    return Object.keys(errores).length ? errores : null;
  },
};
