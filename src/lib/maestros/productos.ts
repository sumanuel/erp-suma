import type { CampoForm } from "@/lib/formularios";
import type { Db } from "@/lib/tenant";
import type { Delegado, Fila, Maestro } from "./tipos";
import { conErrores, etiquetaActivo, filtroActivo, noNegativos, rangoPorcentaje } from "./comunes";

// Productos, sus presentaciones con precio y los proveedores que los surten (adminv, adminvmed y adminvparam del sistema anterior).
// Costos y precios en USD.

const mayus = (d: Fila, campo: string): Fila => ({ ...d, [campo]: typeof d[campo] === "string" ? (d[campo] as string).toUpperCase() : d[campo] });
const rel = (f: Fila, r: string, campo: string) => (f[r] as Record<string, unknown> | null | undefined)?.[campo];

async function opciones(db: Db) {
  const [cats, subs, ivas, aranceles, unidades, provs] = await Promise.all([
    db.categoria.findMany({ where: { activo: true }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true } }),
    db.subcategoria.findMany({ where: { activo: true }, orderBy: [{ categoria: { nombre: "asc" } }, { nombre: "asc" }], select: { id: true, nombre: true, categoria: { select: { nombre: true } } } }),
    db.alicuotaIva.findMany({ where: { activo: true }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true, porcentajeVenta: true } }),
    db.arancel.findMany({ where: { activo: true }, orderBy: { codigo: "asc" }, select: { id: true, codigo: true, descripcion: true } }),
    db.unidadMedida.findMany({ where: { activo: true }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true, codigo: true } }),
    db.proveedor.findMany({ where: { activo: true }, orderBy: { razonSocial: "asc" }, take: 1000, select: { id: true, razonSocial: true } }),
  ]);
  return {
    categorias: cats.map((c) => ({ valor: c.id, etiqueta: c.nombre })),
    subcategorias: subs.map((s) => ({ valor: s.id, etiqueta: `${s.categoria.nombre} › ${s.nombre}` })),
    alicuotas: ivas.map((i) => ({ valor: i.id, etiqueta: `${i.nombre} (${Number(i.porcentajeVenta)}%)` })),
    aranceles: aranceles.map((a) => ({ valor: a.id, etiqueta: `${a.codigo} · ${a.descripcion}` })),
    unidades: unidades.map((u) => ({ valor: u.id, etiqueta: `${u.nombre} (${u.codigo})` })),
    proveedores: provs.map((p) => ({ valor: p.id, etiqueta: p.razonSocial })),
  };
}

const MEDIDAS = ["peso", "volumen", "alto", "ancho", "existenciaMinima", "existenciaMaxima", "ultimoCosto", "costoPromedio", "precioLista", "precioMaximoPublico"];

export const productos: Maestro = {
  id: "productos",
  modulo: "productos",
  ruta: "/productos",
  entidad: "producto",
  singular: "producto",
  plural: "productos",
  genero: "el",
  delegado: (db) => db.producto as unknown as Delegado,
  clave: { campo: "id", autogenerada: true },
  incluir: { categoria: { select: { nombre: true } }, alicuotaIva: { select: { nombre: true } } },
  campos: async (db): Promise<CampoForm[]> => {
    const o = await opciones(db);
    return [
      { nombre: "codigo", etiqueta: "Código", tipo: "texto", max: 30, requerido: true, soloCrear: true, ayuda: "No se puede cambiar después." },
      { nombre: "descripcion", etiqueta: "Descripción", tipo: "texto", max: 200, requerido: true, ancho: 2 },
      { nombre: "categoriaId", etiqueta: "Categoría", tipo: "seleccion", requerido: true, opciones: o.categorias },
      { nombre: "subcategoriaId", etiqueta: "Subcategoría (opcional)", tipo: "seleccion", opciones: o.subcategorias, ayuda: "Debe pertenecer a la categoría elegida." },
      { nombre: "alicuotaIvaId", etiqueta: "Alícuota de IVA", tipo: "seleccion", requerido: true, opciones: o.alicuotas },
      { nombre: "arancelId", etiqueta: "Arancel (opcional)", tipo: "seleccion", opciones: o.aranceles },
      { nombre: "codigoFabricante", etiqueta: "Código del fabricante (opcional)", tipo: "texto", max: 60 },
      { nombre: "codigoBarras", etiqueta: "Código de barras (opcional)", tipo: "texto", max: 60 },
      { nombre: "procedencia", etiqueta: "Procedencia (opcional)", tipo: "seleccion", opciones: ["Nacional", "Importado"].map((v) => ({ valor: v, etiqueta: v })) },
      { nombre: "garantia", etiqueta: "Garantía (opcional)", tipo: "texto", max: 100 },
      { nombre: "ultimoCosto", etiqueta: "Último costo (USD)", tipo: "decimal", requerido: true },
      { nombre: "costoPromedio", etiqueta: "Costo promedio (USD)", tipo: "decimal", requerido: true },
      { nombre: "precioLista", etiqueta: "Precio de lista (USD)", tipo: "decimal", requerido: true },
      { nombre: "precioMaximoPublico", etiqueta: "Precio máximo al público (USD)", tipo: "decimal", requerido: true, ayuda: "0 = sin tope (precio regulado)." },
      { nombre: "existenciaMinima", etiqueta: "Existencia mínima", tipo: "decimal", requerido: true },
      { nombre: "existenciaMaxima", etiqueta: "Existencia máxima", tipo: "decimal", requerido: true },
      { nombre: "comisionVenta", etiqueta: "Comisión por venta (%)", tipo: "decimal", requerido: true },
      { nombre: "comisionCompra", etiqueta: "Comisión por compra (%)", tipo: "decimal", requerido: true },
      { nombre: "peso", etiqueta: "Peso (kg)", tipo: "decimal", requerido: true },
      { nombre: "volumen", etiqueta: "Volumen (m³)", tipo: "decimal", requerido: true },
      { nombre: "alto", etiqueta: "Alto (cm)", tipo: "decimal", requerido: true },
      { nombre: "ancho", etiqueta: "Ancho (cm)", tipo: "decimal", requerido: true },
      { nombre: "observaciones", etiqueta: "Observaciones (opcional)", tipo: "textoLargo", max: 1000, ancho: 3 },
      { nombre: "activo", etiqueta: "Activo", tipo: "booleano" },
    ];
  },
  valoresIniciales: {
    activo: true, ultimoCosto: "0", costoPromedio: "0", precioLista: "0", precioMaximoPublico: "0", existenciaMinima: "0", existenciaMaxima: "0",
    comisionVenta: "0", comisionCompra: "0", peso: "0", volumen: "0", alto: "0", ancho: "0",
  },
  columnas: [
    { id: "descripcion", titulo: "Descripción", campo: "descripcion", fija: true },
    { id: "codigo", titulo: "Código", campo: "codigo" },
    { id: "categoria", titulo: "Categoría", valor: (f) => rel(f, "categoria", "nombre") },
    { id: "iva", titulo: "IVA", valor: (f) => rel(f, "alicuotaIva", "nombre"), oculta: true },
    { id: "precioLista", titulo: "Precio lista (USD)", campo: "precioLista", alinear: "derecha" },
    { id: "costoPromedio", titulo: "Costo prom. (USD)", campo: "costoPromedio", alinear: "derecha", oculta: true },
    { id: "codigoBarras", titulo: "Código de barras", campo: "codigoBarras", oculta: true },
    { id: "codigoFabricante", titulo: "Cód. fabricante", campo: "codigoFabricante", oculta: true },
    { id: "activo", titulo: "Estado", campo: "activo", etiqueta: etiquetaActivo },
  ],
  busqueda: { texto: "Buscar por código, descripción, código de barras o del fabricante", campos: ["codigo", "descripcion", "codigoBarras", "codigoFabricante"] },
  filtros: [filtroActivo],
  orden: { columna: "descripcion", dir: "asc" },
  titulo: (f) => String(f.descripcion ?? ""),
  descripcion: (f) => `Código ${f.codigo}`,
  preparar: (d) => mayus(d, "codigo"),
  validar: async (db, d) => {
    const errores = { ...noNegativos(d, MEDIDAS), ...rangoPorcentaje(d, ["comisionVenta", "comisionCompra"]) } as Record<string, string>;
    const min = d.existenciaMinima, max = d.existenciaMaxima;
    if (typeof min === "number" && typeof max === "number" && max > 0 && min > max) errores.existenciaMinima = "La mínima no puede superar a la máxima.";
    if (typeof d.subcategoriaId === "string" && d.subcategoriaId) {
      const s = await db.subcategoria.findUnique({ where: { id: d.subcategoriaId }, select: { categoriaId: true } });
      if (!s || s.categoriaId !== d.categoriaId) errores.subcategoriaId = "La subcategoría no pertenece a la categoría elegida.";
    }
    return conErrores(errores);
  },
  mensajeDuplicado: "Ya existe un producto con este código.",
  mensajeDependientes: "No se puede eliminar: tiene presentaciones, proveedores o movimientos. Márcalo como inactivo en su lugar.",
};

export const presentaciones: Maestro = {
  id: "presentaciones",
  modulo: "productos",
  ruta: "/productos/presentaciones",
  entidad: "producto_presentacion",
  singular: "presentación",
  plural: "presentaciones",
  genero: "la",
  delegado: (db) => db.productoPresentacion as unknown as Delegado,
  clave: { campo: "id", autogenerada: true },
  incluir: { producto: { select: { descripcion: true } }, unidadMedida: { select: { nombre: true } } },
  campos: async (db) => [
    { nombre: "productoCodigo", etiqueta: "Código del producto", tipo: "texto", max: 30, requerido: true, soloCrear: true, ayuda: "El producto debe existir. No se puede cambiar después." },
    { nombre: "unidadMedidaId", etiqueta: "Unidad de medida", tipo: "seleccion", requerido: true, opciones: (await opciones(db)).unidades },
    { nombre: "nombre", etiqueta: "Presentación (opcional)", tipo: "texto", max: 80, ayuda: "Por ejemplo: Caja x 12." },
    { nombre: "cantidad", etiqueta: "Unidades base que contiene", tipo: "decimal", requerido: true },
    { nombre: "precioCompra", etiqueta: "Precio de compra (USD)", tipo: "decimal", requerido: true },
    { nombre: "precioVenta", etiqueta: "Precio de venta (USD)", tipo: "decimal", requerido: true },
    { nombre: "peso", etiqueta: "Peso (kg)", tipo: "decimal", requerido: true },
    { nombre: "volumen", etiqueta: "Volumen (m³)", tipo: "decimal", requerido: true },
    { nombre: "principal", etiqueta: "Presentación principal", tipo: "booleano", ayuda: "La que se propone por defecto al vender." },
  ],
  valoresIniciales: { cantidad: "1", precioCompra: "0", precioVenta: "0", peso: "0", volumen: "0" },
  columnas: [
    { id: "producto", titulo: "Producto", valor: (f) => `${f.productoCodigo} · ${rel(f, "producto", "descripcion") ?? ""}`, fija: true },
    { id: "unidad", titulo: "Unidad", valor: (f) => rel(f, "unidadMedida", "nombre") },
    { id: "nombre", titulo: "Presentación", campo: "nombre" },
    { id: "cantidad", titulo: "Cantidad", campo: "cantidad", alinear: "derecha" },
    { id: "precioCompra", titulo: "Compra (USD)", campo: "precioCompra", alinear: "derecha" },
    { id: "precioVenta", titulo: "Venta (USD)", campo: "precioVenta", alinear: "derecha" },
    { id: "principal", titulo: "Principal", campo: "principal", etiqueta: (v) => (v === true ? { texto: "Principal", tono: "marca" } : { texto: "—", tono: "neutro" }) },
  ],
  busqueda: { texto: "Buscar por código de producto o presentación", campos: ["productoCodigo", "nombre"] },
  orden: { columna: "producto", dir: "asc" },
  titulo: (f) => `${f.productoCodigo}${f.nombre ? ` · ${f.nombre}` : ""}`,
  preparar: (d) => mayus(d, "productoCodigo"),
  validar: async (db, d, editando) => {
    const errores = noNegativos(d, ["peso", "volumen", "precioCompra", "precioVenta"]);
    if (typeof d.cantidad === "number" && d.cantidad <= 0) errores.cantidad = "Debe ser mayor que 0.";
    if (!editando && typeof d.productoCodigo === "string" && !(await db.producto.findUnique({ where: { codigo: d.productoCodigo }, select: { id: true } }))) {
      errores.productoCodigo = "No existe un producto con este código.";
    }
    return conErrores(errores);
  },
  mensajeDuplicado: "Ese producto ya tiene una presentación con esa unidad de medida.",
};

export const proveedoresProducto: Maestro = {
  id: "proveedores-producto",
  modulo: "productos",
  ruta: "/productos/proveedores",
  entidad: "producto_proveedor",
  singular: "proveedor del producto",
  plural: "proveedores por producto",
  genero: "el",
  delegado: (db) => db.productoProveedor as unknown as Delegado,
  clave: { campo: "id", autogenerada: true },
  incluir: { producto: { select: { descripcion: true } }, proveedor: { select: { razonSocial: true } } },
  campos: async (db) => [
    { nombre: "productoCodigo", etiqueta: "Código del producto", tipo: "texto", max: 30, requerido: true, soloCrear: true, ayuda: "El producto debe existir." },
    { nombre: "proveedorId", etiqueta: "Proveedor", tipo: "seleccion", requerido: true, soloCrear: true, opciones: (await opciones(db)).proveedores },
    { nombre: "moneda", etiqueta: "Moneda de compra", tipo: "seleccion", requerido: true, opciones: ["USD", "EUR", "VES"].map((v) => ({ valor: v, etiqueta: v })) },
    { nombre: "pais", etiqueta: "País de origen (opcional)", tipo: "texto", max: 60 },
  ],
  valoresIniciales: { moneda: "USD" },
  columnas: [
    { id: "producto", titulo: "Producto", valor: (f) => `${f.productoCodigo} · ${rel(f, "producto", "descripcion") ?? ""}`, fija: true },
    { id: "proveedor", titulo: "Proveedor", valor: (f) => rel(f, "proveedor", "razonSocial") },
    { id: "moneda", titulo: "Moneda", campo: "moneda" },
    { id: "pais", titulo: "País", campo: "pais" },
  ],
  busqueda: { texto: "Buscar por código de producto", campos: ["productoCodigo", "pais"] },
  orden: { columna: "producto", dir: "asc" },
  titulo: (f) => String(f.productoCodigo ?? ""),
  preparar: (d) => mayus(d, "productoCodigo"),
  validar: async (db, d, editando) => {
    if (!editando && typeof d.productoCodigo === "string" && !(await db.producto.findUnique({ where: { codigo: d.productoCodigo }, select: { id: true } }))) {
      return { productoCodigo: "No existe un producto con este código." };
    }
    return null;
  },
  mensajeDuplicado: "Ese proveedor ya está asignado a este producto.",
};
