import type { CampoForm } from "@/lib/formularios";
import type { Db } from "@/lib/tenant";
import type { Delegado, Fila, Maestro } from "./tipos";
import { conErrores, etiquetaActivo, filtroActivo, noNegativos, rangoPorcentaje } from "./comunes";

// Productos, sus presentaciones con precio y los proveedores que los surten (adminv, adminvmed y adminvparam del sistema anterior).
// Costos y precios en USD.

const mayus = (d: Fila, campo: string): Fila => ({ ...d, [campo]: typeof d[campo] === "string" ? (d[campo] as string).toUpperCase() : d[campo] });
const rel = (f: Fila, r: string, campo: string) => (f[r] as Record<string, unknown> | null | undefined)?.[campo];

async function opciones(db: Db) {
  const divisiones = await db.division.findMany({ where: { activo: true }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true } });
  const [cats, subs, ivas, aranceles, unidades, provs, marcas] = await Promise.all([
    db.categoria.findMany({ where: { activo: true }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true } }),
    db.subcategoria.findMany({ where: { activo: true }, orderBy: [{ categoria: { nombre: "asc" } }, { nombre: "asc" }], select: { id: true, nombre: true, categoria: { select: { nombre: true } } } }),
    db.alicuotaIva.findMany({ where: { activo: true }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true, porcentajeVenta: true } }),
    db.arancel.findMany({ where: { activo: true }, orderBy: { codigo: "asc" }, select: { id: true, codigo: true, descripcion: true } }),
    db.unidadMedida.findMany({ where: { activo: true }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true, codigo: true } }),
    db.proveedor.findMany({ where: { activo: true }, orderBy: { razonSocial: "asc" }, take: 1000, select: { id: true, razonSocial: true } }),
    db.marca.findMany({ where: { activo: true }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true } }),
  ]);
  return {
    categorias: cats.map((c) => ({ valor: c.id, etiqueta: c.nombre })),
    subcategorias: subs.map((s) => ({ valor: s.id, etiqueta: `${s.categoria.nombre} › ${s.nombre}` })),
    alicuotas: ivas.map((i) => ({ valor: i.id, etiqueta: `${i.nombre} (${Number(i.porcentajeVenta)}%)` })),
    aranceles: aranceles.map((a) => ({ valor: a.id, etiqueta: `${a.codigo} · ${a.descripcion}` })),
    unidades: unidades.map((u) => ({ valor: u.id, etiqueta: `${u.nombre} (${u.codigo})` })),
    proveedores: provs.map((p) => ({ valor: p.id, etiqueta: p.razonSocial })),
    marcas: marcas.map((m) => ({ valor: m.id, etiqueta: m.nombre })),
    divisiones: divisiones.map((d) => ({ valor: d.id, etiqueta: d.nombre })),
  };
}

const MEDIDAS = ["contenido", "peso", "volumen", "alto", "ancho", "existenciaMinima", "existenciaMaxima", "ultimoCosto", "costoPromedio", "precioLista", "precioMaximoPublico"];

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
  incluir: { categoria: { select: { nombre: true } }, alicuotaIva: { select: { nombre: true } }, marca: { select: { nombre: true } } },
  campos: async (db): Promise<CampoForm[]> => {
    const o = await opciones(db);
    return [
      { nombre: "codigo", etiqueta: "Código", tipo: "texto", max: 30, requerido: true, soloCrear: true, seccion: "Identificación", ayuda: "No se puede cambiar después." },
      { nombre: "descripcion", etiqueta: "Descripción", tipo: "texto", max: 200, requerido: true, ancho: 2 },
      { nombre: "descripcionEditable", etiqueta: "La descripción se puede editar al vender", tipo: "booleano" },
      { nombre: "codigoFabricante", etiqueta: "Código del fabricante", tipo: "texto", max: 60 },
      { nombre: "codigoBarras", etiqueta: "Código de barras", tipo: "texto", max: 60 },
      { nombre: "marcaId", etiqueta: "Marca", tipo: "seleccion", opciones: o.marcas },

      { nombre: "categoriaId", etiqueta: "Categoría", tipo: "seleccion", requerido: true, opciones: o.categorias, seccion: "Clasificación" },
      { nombre: "subcategoriaId", etiqueta: "Subcategoría", tipo: "seleccion", opciones: o.subcategorias, ayuda: "Debe pertenecer a la categoría elegida." },
      { nombre: "divisionId", etiqueta: "División", tipo: "seleccion", opciones: o.divisiones },
      { nombre: "alicuotaIvaId", etiqueta: "Alícuota de IVA", tipo: "seleccion", requerido: true, opciones: o.alicuotas },
      { nombre: "arancelId", etiqueta: "Arancel", tipo: "seleccion", opciones: o.aranceles },
      { nombre: "procedencia", etiqueta: "Procedencia", tipo: "seleccion", opciones: ["Nacional", "Importado"].map((v) => ({ valor: v, etiqueta: v })) },
      { nombre: "utilizacion", etiqueta: "Utilización", tipo: "texto", max: 60 },
      { nombre: "garantia", etiqueta: "Garantía", tipo: "texto", max: 100 },

      { nombre: "metodoCosto", etiqueta: "Método de costo", tipo: "seleccion", requerido: true, seccion: "Costos y precios", opciones: [{ valor: "PROMEDIO", etiqueta: "Costo promedio ponderado" }, { valor: "ULTIMO", etiqueta: "Último costo de compra" }], ayuda: "Cuál se usa como costo del producto en ventas y contabilidad." },
      { nombre: "ultimoCosto", etiqueta: "Último costo (USD)", tipo: "decimal", requerido: true },
      { nombre: "costoPromedio", etiqueta: "Costo promedio (USD)", tipo: "decimal", requerido: true },
      { nombre: "precioLista", etiqueta: "Precio de lista A (USD)", tipo: "decimal", requerido: true, ayuda: "Las demás listas y los precios por presentación están en «Precios por lista»." },
      { nombre: "precioMaximoPublico", etiqueta: "Precio máximo al público (USD)", tipo: "decimal", requerido: true, ayuda: "0 = sin tope (precio regulado)." },
      { nombre: "comisionVenta", etiqueta: "Comisión por venta (%)", tipo: "decimal", requerido: true },
      { nombre: "comisionCompra", etiqueta: "Comisión por compra (%)", tipo: "decimal", requerido: true },

      { nombre: "existenciaMinima", etiqueta: "Existencia mínima", tipo: "decimal", requerido: true, seccion: "Inventario y medidas" },
      { nombre: "existenciaMaxima", etiqueta: "Existencia máxima", tipo: "decimal", requerido: true },
      { nombre: "contenido", etiqueta: "Capacidad o contenido", tipo: "decimal", requerido: true, ayuda: "Litros, kilos o piezas que trae cada unidad." },
      { nombre: "requiereMedida", etiqueta: "Requiere indicar medida al vender", tipo: "booleano" },
      { nombre: "peso", etiqueta: "Peso (kg)", tipo: "decimal", requerido: true },
      { nombre: "volumen", etiqueta: "Volumen (m³)", tipo: "decimal", requerido: true },
      { nombre: "alto", etiqueta: "Alto (cm)", tipo: "decimal", requerido: true },
      { nombre: "ancho", etiqueta: "Ancho (cm)", tipo: "decimal", requerido: true },

      { nombre: "observaciones", etiqueta: "Observaciones", tipo: "textoLargo", max: 1000, ancho: 3, seccion: "Otros datos" },
      { nombre: "descontinuado", etiqueta: "Descontinuado (no se vuelve a comprar)", tipo: "booleano" },
      { nombre: "activo", etiqueta: "Activo", tipo: "booleano" },
    ];
  },
  valoresIniciales: {
    activo: true, metodoCosto: "PROMEDIO", contenido: "0", ultimoCosto: "0", costoPromedio: "0", precioLista: "0", precioMaximoPublico: "0", existenciaMinima: "0", existenciaMaxima: "0",
    comisionVenta: "0", comisionCompra: "0", peso: "0", volumen: "0", alto: "0", ancho: "0",
  },
  columnas: [
    { id: "descripcion", titulo: "Descripción", campo: "descripcion", fija: true },
    { id: "codigo", titulo: "Código", campo: "codigo" },
    { id: "categoria", titulo: "Categoría", valor: (f) => rel(f, "categoria", "nombre") },
    { id: "iva", titulo: "IVA", valor: (f) => rel(f, "alicuotaIva", "nombre"), oculta: true },
    { id: "precioLista", titulo: "Precio lista (USD)", campo: "precioLista", alinear: "derecha" },
    { id: "costoPromedio", titulo: "Costo prom. (USD)", campo: "costoPromedio", alinear: "derecha", oculta: true },
    { id: "marca", titulo: "Marca", valor: (f) => rel(f, "marca", "nombre"), oculta: true },
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
    { nombre: "visibleVentas", etiqueta: "Visible en ventas", tipo: "booleano" },
    { nombre: "visibleCompras", etiqueta: "Visible en compras", tipo: "booleano" },
  ],
  valoresIniciales: { visibleVentas: true, visibleCompras: true, cantidad: "1", precioCompra: "0", precioVenta: "0", peso: "0", volumen: "0" },
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

const LISTAS = ["A", "B", "C", "D", "E", "F"].map((l) => ({ valor: l, etiqueta: `Lista ${l}` }));
const fecha = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : "");

/** Presentaciones de un producto, para elegir una dentro de un formulario (el código del producto va aparte). */
async function presentacionDe(db: Db, productoCodigo: unknown, presentacionId: unknown) {
  if (typeof productoCodigo !== "string") return null;
  if (typeof presentacionId !== "string" || !presentacionId) return "BASE";
  const p = await db.productoPresentacion.findUnique({ where: { id: presentacionId }, select: { productoCodigo: true } });
  return p && p.productoCodigo === productoCodigo ? "OK" : null;
}

export const preciosLista: Maestro = {
  id: "precios-lista",
  modulo: "productos",
  ruta: "/productos/precios",
  entidad: "producto_precio",
  singular: "precio por lista",
  plural: "precios por lista",
  genero: "el",
  delegado: (db) => db.productoPrecio as unknown as Delegado,
  clave: { campo: "id", autogenerada: true },
  incluir: { producto: { select: { descripcion: true } }, presentacion: { select: { nombre: true, unidadMedida: { select: { nombre: true } } } } },
  campos: async (db) => [
    { nombre: "productoCodigo", etiqueta: "Código del producto", tipo: "texto", max: 30, requerido: true, soloCrear: true, ayuda: "El producto debe existir. No se puede cambiar después." },
    { nombre: "presentacionId", etiqueta: "Presentación", tipo: "seleccion", soloCrear: true, ayuda: "Vacío = precio base del producto.", opciones: (await db.productoPresentacion.findMany({ take: 2000, orderBy: { productoCodigo: "asc" }, select: { id: true, productoCodigo: true, nombre: true, unidadMedida: { select: { nombre: true } } } })).map((p) => ({ valor: p.id, etiqueta: `${p.productoCodigo} · ${p.nombre ?? p.unidadMedida.nombre}` })) },
    { nombre: "lista", etiqueta: "Lista de precios", tipo: "seleccion", requerido: true, soloCrear: true, opciones: LISTAS },
    { nombre: "precioUsd", etiqueta: "Precio (USD)", tipo: "decimal", requerido: true },
    { nombre: "utilidadPct", etiqueta: "Utilidad sobre el costo (%)", tipo: "decimal", requerido: true, ayuda: "Informativo: margen con que se fijó el precio." },
    { nombre: "descuentoPct", etiqueta: "Descuento (%)", tipo: "decimal", requerido: true },
    { nombre: "descuentoMaxPct", etiqueta: "Descuento máximo (%)", tipo: "decimal", requerido: true, ayuda: "Lo máximo que un vendedor puede rebajar." },
    { nombre: "venceEn", etiqueta: "Vence", tipo: "fecha", ayuda: "Vacío = sin vencimiento." },
    { nombre: "activo", etiqueta: "Activo", tipo: "booleano" },
  ],
  valoresIniciales: { activo: true, utilidadPct: "0", descuentoPct: "0", descuentoMaxPct: "0", precioUsd: "0" },
  columnas: [
    { id: "producto", titulo: "Producto", valor: (f) => `${f.productoCodigo} · ${rel(f, "producto", "descripcion") ?? ""}`, fija: true },
    { id: "presentacion", titulo: "Presentación", valor: (f) => rel(f, "presentacion", "nombre") ?? (f.presentacion ? "" : "Base") },
    { id: "lista", titulo: "Lista", campo: "lista" },
    { id: "precioUsd", titulo: "Precio (USD)", campo: "precioUsd", alinear: "derecha" },
    { id: "descuentoMaxPct", titulo: "Desc. máx. %", campo: "descuentoMaxPct", alinear: "derecha", oculta: true },
    { id: "venceEn", titulo: "Vence", campo: "venceEn", formato: "fecha" },
    { id: "activo", titulo: "Estado", campo: "activo", etiqueta: etiquetaActivo },
  ],
  busqueda: { texto: "Buscar por código de producto", campos: ["productoCodigo"] },
  filtros: [filtroActivo],
  orden: { columna: "producto", dir: "asc" },
  titulo: (f) => `${f.productoCodigo} · lista ${f.lista}`,
  preparar: (d) => mayus(d, "productoCodigo"),
  validar: async (db, d, editando) => {
    const errores = { ...noNegativos(d, ["precioUsd", "utilidadPct"]), ...rangoPorcentaje(d, ["descuentoPct", "descuentoMaxPct"]) } as Record<string, string>;
    if (typeof d.descuentoPct === "number" && typeof d.descuentoMaxPct === "number" && d.descuentoPct > d.descuentoMaxPct) errores.descuentoPct = "No puede superar el descuento máximo.";
    if (!editando) {
      if (typeof d.productoCodigo === "string" && !(await db.producto.findUnique({ where: { codigo: d.productoCodigo }, select: { id: true } }))) errores.productoCodigo = "No existe un producto con este código.";
      else if ((await presentacionDe(db, d.productoCodigo, d.presentacionId)) === null) errores.presentacionId = "La presentación no pertenece a ese producto.";
    }
    return conErrores(errores);
  },
  mensajeDuplicado: "Ese producto (o presentación) ya tiene un precio en esa lista.",
};

export const promociones: Maestro = {
  id: "promociones",
  modulo: "productos",
  ruta: "/productos/promociones",
  entidad: "promocion",
  singular: "promoción",
  plural: "promociones",
  genero: "la",
  delegado: (db) => db.promocion as unknown as Delegado,
  clave: { campo: "id", autogenerada: true },
  incluir: { producto: { select: { descripcion: true } }, presentacion: { select: { nombre: true } } },
  campos: async (db) => [
    { nombre: "productoCodigo", etiqueta: "Código del producto", tipo: "texto", max: 30, requerido: true, soloCrear: true, ayuda: "El producto debe existir. No se puede cambiar después." },
    { nombre: "presentacionId", etiqueta: "Presentación", tipo: "seleccion", soloCrear: true, ayuda: "Vacío = todas las presentaciones.", opciones: (await db.productoPresentacion.findMany({ take: 2000, orderBy: { productoCodigo: "asc" }, select: { id: true, productoCodigo: true, nombre: true, unidadMedida: { select: { nombre: true } } } })).map((p) => ({ valor: p.id, etiqueta: `${p.productoCodigo} · ${p.nombre ?? p.unidadMedida.nombre}` })) },
    { nombre: "lista", etiqueta: "Lista de precios", tipo: "seleccion", opciones: LISTAS, ayuda: "Vacío = todas las listas." },
    { nombre: "desde", etiqueta: "Desde", tipo: "fecha", requerido: true },
    { nombre: "hasta", etiqueta: "Hasta", tipo: "fecha", requerido: true },
    { nombre: "precioUsd", etiqueta: "Precio promocional (USD)", tipo: "decimal" },
    { nombre: "descuentoPct", etiqueta: "Descuento (%)", tipo: "decimal" },
    { nombre: "cantidadRequerida", etiqueta: "Cantidad requerida", tipo: "decimal", requerido: true, ayuda: "Lo que hay que comprar para que aplique (0 = sin mínimo)." },
    { nombre: "cantidadOtorgada", etiqueta: "Cantidad otorgada", tipo: "decimal", requerido: true, ayuda: "Lo que se regala o se agrega, por ejemplo «compra 10, llévate 1»." },
    { nombre: "multiplo", etiqueta: "Múltiplo", tipo: "decimal", requerido: true, ayuda: "Se otorga por cada múltiplo de esta cantidad (0 = una sola vez)." },
    { nombre: "observaciones", etiqueta: "Observaciones", tipo: "textoLargo", max: 500, ancho: 3 },
    { nombre: "activo", etiqueta: "Activa", tipo: "booleano" },
  ],
  valoresIniciales: { activo: true, cantidadRequerida: "0", cantidadOtorgada: "0", multiplo: "0" },
  columnas: [
    { id: "producto", titulo: "Producto", valor: (f) => `${f.productoCodigo} · ${rel(f, "producto", "descripcion") ?? ""}`, fija: true },
    { id: "lista", titulo: "Lista", valor: (f) => (f.lista ? String(f.lista) : "Todas") },
    { id: "precioUsd", titulo: "Precio (USD)", campo: "precioUsd", alinear: "derecha" },
    { id: "descuentoPct", titulo: "Desc. %", campo: "descuentoPct", alinear: "derecha" },
    { id: "cantidadRequerida", titulo: "Requerida", campo: "cantidadRequerida", alinear: "derecha", oculta: true },
    { id: "cantidadOtorgada", titulo: "Otorgada", campo: "cantidadOtorgada", alinear: "derecha", oculta: true },
    { id: "desde", titulo: "Desde", campo: "desde", formato: "fecha" },
    { id: "hasta", titulo: "Hasta", campo: "hasta", formato: "fecha" },
    { id: "activo", titulo: "Estado", campo: "activo", etiqueta: etiquetaActivo },
  ],
  busqueda: { texto: "Buscar por código de producto", campos: ["productoCodigo"] },
  filtros: [filtroActivo],
  orden: { columna: "desde", dir: "desc" },
  titulo: (f) => `${f.productoCodigo} · ${fecha(f.desde)} a ${fecha(f.hasta)}`,
  preparar: (d) => mayus(d, "productoCodigo"),
  validar: async (db, d, editando) => {
    const errores = { ...noNegativos(d, ["precioUsd", "cantidadRequerida", "cantidadOtorgada", "multiplo"]), ...rangoPorcentaje(d, ["descuentoPct"]) } as Record<string, string>;
    if (d.desde instanceof Date && d.hasta instanceof Date && d.hasta < d.desde) errores.hasta = "No puede ser anterior a la fecha de inicio.";
    const beneficio = d.precioUsd != null || d.descuentoPct != null || (typeof d.cantidadOtorgada === "number" && d.cantidadOtorgada > 0);
    if (!beneficio) errores.precioUsd = "Indica un precio, un descuento o una cantidad otorgada.";
    if (!editando) {
      if (typeof d.productoCodigo === "string" && !(await db.producto.findUnique({ where: { codigo: d.productoCodigo }, select: { id: true } }))) errores.productoCodigo = "No existe un producto con este código.";
      else if ((await presentacionDe(db, d.productoCodigo, d.presentacionId)) === null) errores.presentacionId = "La presentación no pertenece a ese producto.";
    }
    return conErrores(errores);
  },
};
