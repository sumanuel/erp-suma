import "server-only";
import { readSheet } from "read-excel-file/node";
import writeExcelFile from "write-excel-file/node";
import { registrarCambio } from "@/lib/auditoria";
import { esViolacionDeClave, esViolacionUnica, leerFormulario, type CampoForm } from "@/lib/formularios";
import type { Db } from "@/lib/tenant";
import type { Maestro } from "./tipos";

// Carga masiva desde Excel para los maestros que lo permiten (`importable`): bancos, clientes, proveedores, productos…
// La primera fila del archivo trae los títulos de las columnas (los mismos de la plantilla). Cada fila pasa por las mismas reglas que el
// formulario de alta (campos obligatorios, opciones, validaciones del maestro y duplicados). Todo ocurre en una sola transacción:
// «validar» la revierte siempre y «importar» solo se confirma si todas las filas son válidas.

export const MAX_FILAS_IMPORTACION = 3000;

export type ResultadoImportacion = {
  error?: string;
  /// Filas con datos leídas del archivo.
  total: number;
  /// Filas que se pudieron crear (o que se crearon, si `confirmada`).
  validas: number;
  confirmada: boolean;
  /// Títulos del archivo que no corresponden a ningún campo (se ignoran).
  ignoradas: string[];
  filas: { fila: number; mensajes: string[] }[];
};

const limpiar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\(opcional\)/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const SI = new Set(["si", "s", "1", "true", "x", "yes", "y", "verdadero"]);
const NO = new Set(["no", "n", "0", "false", "falso", ""]);

function textoDeCelda(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (typeof v === "number") return String(v);
  return String(v).trim();
}

/** Pasa lo escrito en la celda al valor que espera el formulario (para las selecciones acepta el texto o el valor; para sí/no, varias formas). */
function valorDeCelda(c: CampoForm, crudo: string): { valor?: string; error?: string } {
  if (c.tipo === "booleano") {
    const k = limpiar(crudo);
    if (SI.has(k)) return { valor: "on" };
    if (NO.has(k)) return { valor: "" };
    return { error: "Escribe Sí o No." };
  }
  if (crudo === "") return { valor: "" };
  if (c.tipo === "seleccion" && c.opciones) {
    const k = limpiar(crudo);
    const o = c.opciones.find((x) => limpiar(x.etiqueta) === k || limpiar(x.valor) === k) ?? c.opciones.find((x) => limpiar(x.etiqueta).startsWith(k) && k.length >= 3);
    if (!o) return { error: `«${crudo}» no es una opción válida.` };
    return { valor: o.valor };
  }
  return { valor: crudo };
}

type Fila = (string | number | boolean | Date | null)[];

class Revertir extends Error {}

export async function importarMaestro(m: Maestro, db: Db, usuario: { id: string; nombre: string }, campos: CampoForm[], archivo: Buffer, confirmar: boolean): Promise<ResultadoImportacion> {
  const vacio = (error: string): ResultadoImportacion => ({ error, total: 0, validas: 0, confirmada: false, ignoradas: [], filas: [] });
  let hoja: Fila[];
  try {
    hoja = (await readSheet(archivo)) as Fila[];
  } catch {
    return vacio("No se pudo leer el archivo. Debe ser un Excel .xlsx (no .xls ni .csv).");
  }
  if (hoja.length < 2) return vacio("El archivo no tiene filas de datos. La primera fila son los títulos y debajo van los registros.");

  // Cada título se busca por la etiqueta o el nombre del campo.
  const porTitulo = new Map<string, CampoForm>();
  for (const c of campos) {
    porTitulo.set(limpiar(c.etiqueta), c);
    porTitulo.set(limpiar(c.nombre), c);
  }
  const columnas: (CampoForm | null)[] = [];
  const ignoradas: string[] = [];
  for (const t of hoja[0]) {
    const titulo = textoDeCelda(t);
    const c = titulo ? porTitulo.get(limpiar(titulo)) : undefined;
    columnas.push(c ?? null);
    if (titulo && !c) ignoradas.push(titulo);
  }
  const presentes = new Set(columnas.filter((c): c is CampoForm => !!c).map((c) => c.nombre));
  const faltan = campos.filter((c) => c.requerido && !presentes.has(c.nombre) && m.valoresIniciales?.[c.nombre] === undefined);
  if (faltan.length > 0) return { ...vacio(`Faltan columnas obligatorias: ${faltan.map((c) => c.etiqueta).join(", ")}. Descarga la plantilla para ver las columnas.`), ignoradas };

  const datosFilas = hoja.slice(1).map((f, i) => ({ n: i + 2, celdas: f })).filter((x) => x.celdas.some((v) => textoDeCelda(v) !== ""));
  if (datosFilas.length === 0) return { ...vacio("El archivo no tiene filas de datos."), ignoradas };
  if (datosFilas.length > MAX_FILAS_IMPORTACION) return { ...vacio(`El archivo tiene ${datosFilas.length} filas; el máximo por carga es ${MAX_FILAS_IMPORTACION}. Divídelo en partes.`), ignoradas };

  const resultado: ResultadoImportacion = { total: datosFilas.length, validas: 0, confirmada: false, ignoradas, filas: [] };

  try {
    await db.$transaction(async (tx) => {
      const t = tx as unknown as Db;
      for (const { n, celdas } of datosFilas) {
        const mensajes: string[] = [];
        const form = new FormData();
        const dadas = new Set<string>();
        columnas.forEach((c, i) => {
          if (!c) return;
          const r = valorDeCelda(c, textoDeCelda(celdas[i]));
          if (r.error) mensajes.push(`${c.etiqueta.replace(/ \(opcional\)/, "")}: ${r.error}`);
          else if (r.valor !== undefined && r.valor !== "") {
            form.set(c.nombre, r.valor);
            dadas.add(c.nombre);
          }
        });
        // Lo que la fila no trae toma el valor inicial del formulario de alta.
        for (const c of campos) {
          if (dadas.has(c.nombre)) continue;
          const v = m.valoresIniciales?.[c.nombre];
          if (c.tipo === "booleano") {
            // Un sí/no que sí vino en el archivo (aunque sea «No») no se pisa con el valor inicial.
            const col = columnas.findIndex((x) => x?.nombre === c.nombre);
            const quiso = col >= 0 && textoDeCelda(celdas[col]) !== "";
            if (!quiso && (v === true || v === "on")) form.set(c.nombre, "on");
          } else if (v !== undefined && v !== "") form.set(c.nombre, String(v));
        }
        if (mensajes.length === 0) {
          const f = leerFormulario(campos, form, false);
          if (m.preparar) f.datos = m.preparar(f.datos) as typeof f.datos;
          const etiquetaDe = (campo: string) => (campos.find((c) => c.nombre === campo)?.etiqueta ?? campo).replace(/ \(opcional\)/, "");
          for (const [campo, msg] of Object.entries({ ...f.errores, ...((await m.validar?.(t, f.datos, false)) ?? {}) })) mensajes.push(`${etiquetaDe(campo)}: ${msg}`);
          if (mensajes.length === 0) {
            await tx.$executeRawUnsafe("SAVEPOINT fila_importada");
            try {
              let datos = f.datos as Record<string, unknown>;
              if (m.completar) datos = await m.completar(t, datos);
              if (m.crear) {
                const r = await m.crear(t, usuario, datos);
                if (r?.errores && Object.keys(r.errores).length > 0) {
                  for (const [campo, msg] of Object.entries(r.errores)) mensajes.push(`${etiquetaDe(campo)}: ${msg}`);
                }
              } else {
                const creado = await m.delegado(t).create({ data: datos });
                await registrarCambio(t, usuario, { modulo: m.modulo, entidad: m.entidad, entidadId: String(creado[m.clave.campo] ?? ""), descripcion: m.titulo(creado), accion: "crear", despues: datos });
              }
              await tx.$executeRawUnsafe("RELEASE SAVEPOINT fila_importada");
            } catch (e) {
              await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT fila_importada");
              if (esViolacionUnica(e)) mensajes.push(m.mensajeDuplicado ?? "Ya existe un registro con esos datos (o está repetido en el archivo).");
              else if (esViolacionDeClave(e)) mensajes.push("Un dato apunta a un registro que no existe.");
              else throw e;
            }
          }
        }
        if (mensajes.length > 0) resultado.filas.push({ fila: n, mensajes });
        else resultado.validas++;
      }
      // «Validar» nunca guarda; «Importar» guarda solo si todas las filas son buenas.
      if (!confirmar || resultado.filas.length > 0) throw new Revertir();
      resultado.confirmada = true;
    }, { timeout: 300_000, maxWait: 10_000 });
  } catch (e) {
    if (!(e instanceof Revertir)) throw e;
  }
  if (resultado.filas.length > 200) resultado.filas = resultado.filas.slice(0, 200);
  return resultado;
}

/** Plantilla .xlsx: hoja «Datos» con los títulos y hoja «Instrucciones» con lo que lleva cada columna. */
export async function plantillaMaestro(m: Maestro, campos: CampoForm[]): Promise<Buffer> {
  const negrita = { fontWeight: "bold" as const };
  const titulos = campos.map((c) => ({ value: c.etiqueta.replace(/ \(opcional\)/, "") + (c.requerido && m.valoresIniciales?.[c.nombre] === undefined ? " *" : ""), ...negrita }));
  const tipoDe = (c: CampoForm) => ({ texto: "Texto", textoLargo: "Texto", entero: "Número entero", decimal: "Número (usa punto o coma para decimales)", booleano: "Sí o No", seleccion: "Elegir de la lista", fecha: "Fecha (AAAA-MM-DD)" })[c.tipo];
  const instrucciones: { value: string; fontWeight?: "bold" }[][] = [
    ["Columna", "Obligatoria", "Tipo", "Valores permitidos / ayuda"].map((value) => ({ value, ...negrita })),
    ...campos.map((c) => {
      const obligatoria = c.requerido && m.valoresIniciales?.[c.nombre] === undefined;
      const lista = c.tipo === "seleccion" && c.opciones ? `Una de: ${c.opciones.slice(0, 40).map((o) => o.etiqueta).join(" | ")}${c.opciones.length > 40 ? " …" : ""}` : "";
      const inicial = m.valoresIniciales?.[c.nombre] !== undefined && !obligatoria && c.requerido ? "Si se deja vacía se usa el valor por defecto." : "";
      return [c.etiqueta, obligatoria ? "Sí" : "No", tipoDe(c) + (c.max ? ` (máx. ${c.max})` : ""), [lista, c.ayuda ?? "", inicial].filter(Boolean).join(" · ")].map((value) => ({ value }));
    }),
  ];
  const r = writeExcelFile([
    { data: [titulos], sheet: "Datos", columns: campos.map((c) => ({ width: Math.max(14, Math.min(40, c.etiqueta.length + 4)) })) },
    { data: instrucciones, sheet: "Instrucciones", columns: [{ width: 34 }, { width: 12 }, { width: 38 }, { width: 90 }] },
  ]);
  return Buffer.from(await r.toBuffer());
}
