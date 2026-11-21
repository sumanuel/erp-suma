import { ResumenExistencias } from "@/components/existencias/resumen-existencias";
import { registrarMovimiento, TIPOS_MOVIMIENTO, trasladar, type TipoMovimiento } from "@/lib/inventario/movimientos";
import type { Delegado, Fila, Maestro } from "./tipos";
import { conErrores, etiquetaActivo, filtroActivo } from "./comunes";

const rel = (f: Fila, r: string, campo: string) => (f[r] as Record<string, unknown> | null | undefined)?.[campo];
const num = (v: unknown) => Number(v ?? 0);

export const almacenes: Maestro = {
  id: "almacenes",
  modulo: "existencias",
  ruta: "/existencias/almacenes",
  entidad: "almacen",
  singular: "almacén",
  plural: "almacenes",
  genero: "el",
  delegado: (db) => db.almacen as unknown as Delegado,
  clave: { campo: "id", autogenerada: true },
  campos: [
    { nombre: "codigo", etiqueta: "Código", tipo: "texto", max: 15, requerido: true, soloCrear: true, ayuda: "No se puede cambiar después." },
    { nombre: "nombre", etiqueta: "Nombre", tipo: "texto", max: 100, requerido: true },
    { nombre: "direccion", etiqueta: "Dirección (opcional)", tipo: "texto", max: 300, ancho: 2 },
    { nombre: "activo", etiqueta: "Activo", tipo: "booleano" },
  ],
  valoresIniciales: { activo: true },
  columnas: [
    { id: "nombre", titulo: "Nombre", campo: "nombre", fija: true },
    { id: "codigo", titulo: "Código", campo: "codigo" },
    { id: "direccion", titulo: "Dirección", campo: "direccion" },
    { id: "activo", titulo: "Estado", campo: "activo", etiqueta: etiquetaActivo },
  ],
  busqueda: { texto: "Buscar por código o nombre", campos: ["codigo", "nombre"] },
  filtros: [filtroActivo],
  orden: { columna: "nombre", dir: "asc" },
  titulo: (f) => String(f.nombre ?? ""),
  descripcion: (f) => `Código ${f.codigo}`,
  preparar: (d) => ({ ...d, codigo: typeof d.codigo === "string" ? d.codigo.toUpperCase() : d.codigo }),
  mensajeDuplicado: "Ya existe un almacén con este código.",
  mensajeDependientes: "No se puede eliminar: tiene existencias o movimientos. Márcalo como inactivo en su lugar.",
};

export const existencias: Maestro = {
  id: "existencias",
  modulo: "existencias",
  ruta: "/existencias",
  entidad: "existencia",
  singular: "existencia",
  plural: "existencias",
  genero: "la",
  soloConsulta: true,
  delegado: (db) => db.existencia as unknown as Delegado,
  clave: { campo: "productoCodigo" },
  claveFila: (f) => `${f.almacenId}:${f.productoCodigo}`,
  incluir: { producto: { select: { descripcion: true, costoPromedio: true, existenciaMinima: true } }, almacen: { select: { nombre: true } } },
  encabezado: async (db) => <ResumenExistencias db={db} />,
  campos: [],
  columnas: [
    { id: "codigo", titulo: "Código", campo: "productoCodigo", fija: true },
    { id: "descripcion", titulo: "Producto", valor: (f) => rel(f, "producto", "descripcion") },
    { id: "almacen", titulo: "Almacén", valor: (f) => rel(f, "almacen", "nombre") },
    { id: "cantidad", titulo: "Existencia", campo: "cantidad", alinear: "derecha" },
    { id: "costo", titulo: "Costo prom. (USD)", valor: (f) => rel(f, "producto", "costoPromedio"), alinear: "derecha", oculta: true },
    { id: "valor", titulo: "Valor (USD)", valor: (f) => Math.round(num(f.cantidad) * num(rel(f, "producto", "costoPromedio")) * 100) / 100, alinear: "derecha" },
    {
      id: "estado", titulo: "Estado", valor: (f) => (num(f.cantidad) <= 0 ? "Sin existencia" : num(f.cantidad) < num(rel(f, "producto", "existenciaMinima")) ? "Bajo mínimo" : "Disponible"),
      etiqueta: (v) => (v === "Sin existencia" ? { texto: "Sin existencia", tono: "error" } : v === "Bajo mínimo" ? { texto: "Bajo mínimo", tono: "aviso" } : { texto: "Disponible", tono: "exito" }),
    },
  ],
  busqueda: { texto: "Buscar por código o descripción del producto", campos: ["productoCodigo", "producto.descripcion"] },
  filtros: [
    {
      id: "saldo", etiqueta: "Saldo", todos: "Con y sin existencia",
      opciones: [
        { valor: "con", etiqueta: "Con existencia", donde: { cantidad: { gt: 0 } } },
        { valor: "sin", etiqueta: "Sin existencia", donde: { cantidad: 0 } },
      ],
    },
  ],
  orden: { columna: "codigo", dir: "asc" },
  titulo: (f) => String(f.productoCodigo ?? ""),
};

const ETIQUETA_TIPO: Record<string, string> = { ...Object.fromEntries(Object.entries(TIPOS_MOVIMIENTO).map(([k, v]) => [k, v.etiqueta])) };

export const movimientos: Maestro = {
  id: "movimientos",
  modulo: "existencias",
  ruta: "/existencias/movimientos",
  entidad: "movimiento_inventario",
  singular: "movimiento",
  plural: "movimientos",
  genero: "el",
  sinEdicion: true,
  sinEliminar: true,
  delegado: (db) => db.movimientoInventario as unknown as Delegado,
  clave: { campo: "id", autogenerada: true },
  incluir: { almacen: { select: { nombre: true } }, producto: { select: { descripcion: true } } },
  campos: async (db) => [
    {
      nombre: "tipo", etiqueta: "Tipo de movimiento", tipo: "seleccion", requerido: true,
      opciones: [
        { valor: "ENTRADA", etiqueta: "Entrada" },
        { valor: "SALIDA", etiqueta: "Salida" },
        { valor: "AJUSTE_POSITIVO", etiqueta: "Ajuste: sobrante" },
        { valor: "AJUSTE_NEGATIVO", etiqueta: "Ajuste: faltante" },
        { valor: "TRASLADO", etiqueta: "Traslado entre almacenes" },
      ],
    },
    {
      nombre: "almacenId", etiqueta: "Almacén (origen en traslados)", tipo: "seleccion", requerido: true,
      opciones: (await db.almacen.findMany({ where: { activo: true }, orderBy: { nombre: "asc" } })).map((a) => ({ valor: a.id, etiqueta: `${a.nombre} (${a.codigo})` })),
    },
    {
      nombre: "almacenDestinoId", etiqueta: "Almacén destino (solo traslados)", tipo: "seleccion",
      opciones: (await db.almacen.findMany({ where: { activo: true }, orderBy: { nombre: "asc" } })).map((a) => ({ valor: a.id, etiqueta: `${a.nombre} (${a.codigo})` })),
    },
    { nombre: "productoCodigo", etiqueta: "Código del producto", tipo: "texto", max: 30, requerido: true },
    { nombre: "cantidad", etiqueta: "Cantidad", tipo: "decimal", requerido: true, ayuda: "Siempre positiva; el tipo define si suma o resta. Hasta 4 decimales." },
    { nombre: "costoUnitario", etiqueta: "Costo unitario USD (solo entradas)", tipo: "decimal", ayuda: "Si lo dejas vacío se usa el costo promedio. Una entrada con costo actualiza el costo promedio del producto." },
    { nombre: "documento", etiqueta: "Documento (opcional)", tipo: "texto", max: 60, ayuda: "Factura, compra, nota…" },
    { nombre: "motivo", etiqueta: "Motivo", tipo: "texto", max: 200, ancho: 2, ayuda: "Obligatorio en los ajustes." },
  ],
  columnas: [
    { id: "fecha", titulo: "Fecha", campo: "fecha", formato: "fechaHora", fija: true },
    {
      id: "tipo", titulo: "Tipo", campo: "tipo",
      etiqueta: (v) => ({ texto: ETIQUETA_TIPO[String(v)] ?? String(v), tono: TIPOS_MOVIMIENTO[v as TipoMovimiento]?.signo === 1 ? "exito" : "aviso" }),
    },
    { id: "producto", titulo: "Producto", campo: "productoCodigo" },
    { id: "descripcion", titulo: "Descripción", valor: (f) => rel(f, "producto", "descripcion"), oculta: true },
    { id: "almacen", titulo: "Almacén", valor: (f) => rel(f, "almacen", "nombre") },
    { id: "cantidad", titulo: "Cantidad", campo: "cantidad", alinear: "derecha" },
    { id: "saldo", titulo: "Saldo después", campo: "saldoDespues", alinear: "derecha" },
    { id: "costo", titulo: "Costo (USD)", campo: "costoUnitario", alinear: "derecha", oculta: true },
    { id: "documento", titulo: "Documento", campo: "documento" },
    { id: "usuario", titulo: "Usuario", campo: "usuarioNombre" },
    { id: "motivo", titulo: "Motivo", campo: "motivo", oculta: true },
  ],
  busqueda: { texto: "Buscar por producto, documento o motivo", campos: ["productoCodigo", "documento", "motivo", "producto.descripcion"] },
  filtros: [
    {
      id: "tipo", etiqueta: "Tipo", todos: "Todos los tipos",
      opciones: [
        { valor: "entradas", etiqueta: "Entradas", donde: { tipo: "ENTRADA" } },
        { valor: "salidas", etiqueta: "Salidas", donde: { tipo: "SALIDA" } },
        { valor: "ajustes", etiqueta: "Ajustes", donde: { tipo: { in: ["AJUSTE_POSITIVO", "AJUSTE_NEGATIVO"] } } },
        { valor: "traslados", etiqueta: "Traslados", donde: { tipo: { in: ["TRASLADO_ENTRADA", "TRASLADO_SALIDA"] } } },
      ],
    },
  ],
  orden: { columna: "fecha", dir: "desc" },
  titulo: (f) => `${f.productoCodigo}`,
  preparar: (d) => ({ ...d, productoCodigo: typeof d.productoCodigo === "string" ? d.productoCodigo.toUpperCase() : d.productoCodigo }),
  validar: async (_db, d) => {
    const errores: Record<string, string> = {};
    if (d.tipo === "TRASLADO") {
      if (!d.almacenDestinoId) errores.almacenDestinoId = "Elige el almacén destino.";
      else if (d.almacenDestinoId === d.almacenId) errores.almacenDestinoId = "El destino debe ser otro almacén.";
    } else if (d.almacenDestinoId) errores.almacenDestinoId = "Solo se usa en traslados.";
    if (d.costoUnitario != null && d.tipo !== "ENTRADA") errores.costoUnitario = "Solo las entradas llevan costo.";
    return conErrores(errores);
  },
  crear: async (db, usuario, d) => {
    const comunes = { almacenId: String(d.almacenId), productoCodigo: String(d.productoCodigo), cantidad: Number(d.cantidad), documento: (d.documento as string | null) ?? null, motivo: (d.motivo as string | null) ?? null };
    const r =
      d.tipo === "TRASLADO"
        ? await trasladar(db, usuario, { origenId: comunes.almacenId, destinoId: String(d.almacenDestinoId), productoCodigo: comunes.productoCodigo, cantidad: comunes.cantidad, documento: comunes.documento, motivo: comunes.motivo })
        : await registrarMovimiento(db, usuario, { ...comunes, tipo: d.tipo as "ENTRADA", costoUnitario: d.costoUnitario == null ? null : Number(d.costoUnitario) });
    return r.ok ? undefined : { errores: r.errores };
  },
};
