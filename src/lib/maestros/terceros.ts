import type { CampoForm } from "@/lib/formularios";
import type { Db } from "@/lib/tenant";
import type { Delegado, Fila, Maestro } from "./tipos";
import { rangoPorcentaje } from "./comunes";

// Clientes y proveedores: dos maestros sobre el mismo motor. Llevan los campos del sistema anterior (admclientes, admproveedor): identificación,
// condición fiscal, contacto, ubicación (país → estado → municipio → parroquia), condiciones comerciales y de crédito. Ver ANALISIS-CAMPOS.md.

const normalizar = (datos: Fila): Fila => {
  const d: Fila = { ...datos };
  if (typeof d.documento === "string") d.documento = d.documento.replace(/[\s.\-]/g, "").toUpperCase();
  if (typeof d.nif === "string") d.nif = d.nif.replace(/[\s.\-]/g, "").toUpperCase() || null;
  // Sin código se deja que la base asigne el siguiente (C000123 / P000123).
  if (typeof d.codigo === "string" && d.codigo.trim()) d.codigo = d.codigo.trim().toUpperCase();
  else delete d.codigo;
  return d;
};

const opts = (valores: string[]) => valores.map((v) => ({ valor: v, etiqueta: v }));
const SITUACIONES = [{ valor: "NORMAL", etiqueta: "Normal" }, { valor: "MOROSO", etiqueta: "Moroso" }, { valor: "BLOQUEADO", etiqueta: "Bloqueado (no se le vende o compra)" }];
const PERSONAS = [{ valor: "NATURAL", etiqueta: "Natural" }, { valor: "JURIDICA", etiqueta: "Jurídica" }];
const DIVISAS = [{ valor: "USD", etiqueta: "Dólares (USD)" }, { valor: "VES", etiqueta: "Bolívares (Bs.)" }];
const LISTAS = ["A", "B", "C", "D", "E", "F"].map((l) => ({ valor: l, etiqueta: `Lista ${l}` }));

async function catalogo<T extends { id: string }>(consulta: Promise<T[]>, etiqueta: (x: T) => string) {
  return (await consulta).map((x) => ({ valor: x.id, etiqueta: etiqueta(x) }));
}

/** Cuenta contable propia del tercero y su auxiliar (el auxiliar se filtra por la cuenta elegida). */
async function contabilidadTercero(db: Db, seccion: string): Promise<CampoForm[]> {
  const [cuentas, auxiliares] = await Promise.all([
    db.cuentaContable.findMany({ where: { posteable: true, activo: true }, orderBy: { codigo: "asc" }, select: { id: true, codigo: true, nombre: true } }),
    db.auxiliarContable.findMany({ where: { activo: true }, orderBy: { nombre: "asc" }, select: { id: true, codigo: true, nombre: true, cuentaId: true } }),
  ]);
  return [
    { nombre: "cuentaContableId", etiqueta: "Cuenta contable propia", tipo: "seleccion", seccion, ayuda: "Opcional. Si la dejas vacía se usa la cuenta general de cuentas por cobrar/pagar.", opciones: cuentas.map((c) => ({ valor: c.id, etiqueta: `${c.codigo} ${c.nombre}` })) },
    { nombre: "auxiliarContableId", etiqueta: "Auxiliar contable", tipo: "seleccion", dependeDe: "cuentaContableId", opciones: auxiliares.map((a) => ({ valor: a.id, etiqueta: `${a.codigo} · ${a.nombre}`, padre: a.cuentaId })) },
  ];
}

/** Catálogos de ubicación: cada nivel lleva el `padre` para que el formulario filtre. */
export async function ubicacion(db: Db, seccion: string): Promise<CampoForm[]> {
  const [paises, estados, municipios, parroquias] = await Promise.all([
    db.pais.findMany({ where: { activo: true }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true } }),
    db.estado.findMany({ where: { activo: true }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true, paisId: true } }),
    db.municipio.findMany({ where: { activo: true }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true, estadoId: true } }),
    db.parroquia.findMany({ where: { activo: true }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true, municipioId: true } }),
  ]);
  return [
    { nombre: "paisId", etiqueta: "País", tipo: "seleccion", seccion, opciones: paises.map((p) => ({ valor: p.id, etiqueta: p.nombre })) },
    { nombre: "estadoId", etiqueta: "Estado", tipo: "seleccion", dependeDe: "paisId", opciones: estados.map((e) => ({ valor: e.id, etiqueta: e.nombre, padre: e.paisId })) },
    { nombre: "municipioId", etiqueta: "Municipio", tipo: "seleccion", dependeDe: "estadoId", opciones: municipios.map((m) => ({ valor: m.id, etiqueta: m.nombre, padre: m.estadoId })) },
    { nombre: "parroquiaId", etiqueta: "Parroquia", tipo: "seleccion", dependeDe: "municipioId", opciones: parroquias.map((p) => ({ valor: p.id, etiqueta: p.nombre, padre: p.municipioId })) },
  ];
}

/** Que estado, municipio y parroquia elegidos pertenezcan a lo de arriba. */
export async function validarUbicacion(db: Db, d: Fila): Promise<Record<string, string>> {
  const e: Record<string, string> = {};
  if (typeof d.estadoId === "string") {
    const x = await db.estado.findUnique({ where: { id: d.estadoId }, select: { paisId: true } });
    if (!x || (d.paisId && x.paisId !== d.paisId)) e.estadoId = "El estado no pertenece al país elegido.";
  }
  if (typeof d.municipioId === "string") {
    const x = await db.municipio.findUnique({ where: { id: d.municipioId }, select: { estadoId: true } });
    if (!x || (d.estadoId && x.estadoId !== d.estadoId)) e.municipioId = "El municipio no pertenece al estado elegido.";
  }
  if (typeof d.parroquiaId === "string") {
    const x = await db.parroquia.findUnique({ where: { id: d.parroquiaId }, select: { municipioId: true } });
    if (!x || (d.municipioId && x.municipioId !== d.municipioId)) e.parroquiaId = "La parroquia no pertenece al municipio elegido.";
  }
  return e;
}

async function validarTercero(db: Db, datos: Fila) {
  const errores: Record<string, string> = {};
  const doc = datos.documento;
  if (typeof doc === "string" && doc.length > 0 && !/^[A-Z0-9]{5,20}$/.test(doc)) errores.documento = "Documento inválido (5 a 20 letras o números).";
  const email = datos.email;
  if (typeof email === "string" && email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errores.email = "Correo inválido.";
  if (typeof datos.codigo === "string" && !/^[A-Z0-9][A-Z0-9\-]{0,19}$/.test(datos.codigo)) errores.codigo = "Código inválido (letras, números o guion, hasta 20).";
  Object.assign(errores, rangoPorcentaje(datos, ["descuento1", "descuento2", "descuento3"]));
  if (typeof datos.limiteCredito === "number" && datos.limiteCredito < 0) errores.limiteCredito = "No puede ser negativo.";
  Object.assign(errores, await validarUbicacion(db, datos));
  if (typeof datos.auxiliarContableId === "string") {
    const a = await db.auxiliarContable.findUnique({ where: { id: datos.auxiliarContableId }, select: { cuentaId: true } });
    if (!datos.cuentaContableId) errores.auxiliarContableId = "Elige primero la cuenta contable.";
    else if (!a || a.cuentaId !== datos.cuentaContableId) errores.auxiliarContableId = "El auxiliar no pertenece a la cuenta elegida.";
  }
  return errores;
}

const estado = (v: unknown) => (v === false ? { texto: "Inactivo", tono: "neutro" as const } : { texto: "Activo", tono: "exito" as const });
const situacion = (v: unknown) => (v === "BLOQUEADO" ? { texto: "Bloqueado", tono: "error" as const } : v === "MOROSO" ? { texto: "Moroso", tono: "aviso" as const } : { texto: "Normal", tono: "neutro" as const });
const filtroEstado = {
  id: "estado",
  etiqueta: "Estado",
  todos: "Activos e inactivos",
  opciones: [
    { valor: "activos", etiqueta: "Solo activos", donde: { activo: true } },
    { valor: "inactivos", etiqueta: "Solo inactivos", donde: { activo: false } },
  ],
};
const filtroSituacion = {
  id: "situacion",
  etiqueta: "Situación",
  todos: "Cualquier situación",
  opciones: [{ valor: "moroso", etiqueta: "Morosos", donde: { situacion: "MOROSO" } }, { valor: "bloqueado", etiqueta: "Bloqueados", donde: { situacion: "BLOQUEADO" } }],
};

const nombreDe = (rel: string) => (f: Fila) => (f[rel] as { nombre?: string; razonSocial?: string } | null | undefined)?.nombre;

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
  incluir: { vendedor: { select: { nombre: true } }, condicionPago: { select: { nombre: true } } },
  campos: async (db) => {
    const [clasificaciones, actividades] = await Promise.all([
      catalogo(db.clasificacionCliente.findMany({ where: { activo: true }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true } }), (c) => c.nombre),
      catalogo(db.actividadEconomica.findMany({ where: { activo: true }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true } }), (c) => c.nombre),
    ]);
    const [vendedores, cobradores, condiciones, tiposNegocio, transportes] = await Promise.all([
      catalogo(db.vendedor.findMany({ where: { activo: true, esVendedor: true }, orderBy: { nombre: "asc" }, select: { id: true, codigo: true, nombre: true } }), (v) => `${v.nombre} (${v.codigo})`),
      catalogo(db.vendedor.findMany({ where: { activo: true, esCobrador: true }, orderBy: { nombre: "asc" }, select: { id: true, codigo: true, nombre: true } }), (v) => `${v.nombre} (${v.codigo})`),
      catalogo(db.condicionPago.findMany({ where: { activo: true }, orderBy: { dias: "asc" }, select: { id: true, nombre: true } }), (c) => c.nombre),
      catalogo(db.tipoNegocio.findMany({ where: { activo: true }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true } }), (t) => t.nombre),
      catalogo(db.transporte.findMany({ where: { activo: true }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true } }), (t) => t.nombre),
    ]);
    return [
      { nombre: "codigo", etiqueta: "Código", tipo: "texto", max: 20, soloCrear: true, seccion: "Identificación", ayuda: "Si lo dejas vacío se asigna el siguiente (C000123). No se puede cambiar después." },
      { nombre: "razonSocial", etiqueta: "Razón social", tipo: "texto", max: 200, requerido: true, ancho: 2 },
      { nombre: "documento", etiqueta: "RIF / documento", tipo: "texto", max: 25, requerido: true, ayuda: "Los puntos, guiones y espacios se quitan al guardar." },
      { nombre: "nombreComercial", etiqueta: "Nombre comercial", tipo: "texto", max: 200, ancho: 2 },
      { nombre: "nif", etiqueta: "NIF", tipo: "texto", max: 25 },
      { nombre: "tipoPersona", etiqueta: "Tipo de persona", tipo: "seleccion", opciones: PERSONAS },
      { nombre: "tipo", etiqueta: "Tipo", tipo: "seleccion", requerido: true, opciones: opts(["Privado", "Público"]) },
      { nombre: "categoria", etiqueta: "Categoría", tipo: "seleccion", opciones: opts(["Comercial", "Industrial", "Sanitario", "Municipal", "Residencial"]) },
      { nombre: "tipoNegocioId", etiqueta: "Tipo de negocio", tipo: "seleccion", opciones: tiposNegocio },
      { nombre: "clasificacionId", etiqueta: "Clasificación", tipo: "seleccion", opciones: clasificaciones },
      { nombre: "actividadEconomicaId", etiqueta: "Actividad económica", tipo: "seleccion", opciones: actividades },
      { nombre: "representante", etiqueta: "Representante", tipo: "texto", max: 100 },
      { nombre: "situacion", etiqueta: "Situación", tipo: "seleccion", requerido: true, opciones: SITUACIONES },

      { nombre: "residente", etiqueta: "Residente en el país", tipo: "booleano", seccion: "Condición fiscal", ayuda: "Define la retención de ISLR que se le aplica." },
      { nombre: "contribuyente", etiqueta: "Contribuyente de IVA", tipo: "booleano" },
      { nombre: "contribuyenteEspecial", etiqueta: "Contribuyente especial", tipo: "booleano", ayuda: "Retiene IVA a sus proveedores." },

      { nombre: "telefono", etiqueta: "Teléfono", tipo: "texto", max: 40, seccion: "Contacto" },
      { nombre: "telefono2", etiqueta: "Teléfono 2", tipo: "texto", max: 40 },
      { nombre: "celular", etiqueta: "Celular", tipo: "texto", max: 40 },
      { nombre: "celular2", etiqueta: "Otro celular", tipo: "texto", max: 40 },
      { nombre: "fax", etiqueta: "Fax", tipo: "texto", max: 40 },
      { nombre: "email", etiqueta: "Correo", tipo: "texto", max: 200 },
      { nombre: "web", etiqueta: "Página web", tipo: "texto", max: 200 },

      { nombre: "direccion", etiqueta: "Dirección fiscal", tipo: "texto", max: 300, ancho: 3, seccion: "Ubicación" },
      { nombre: "direccion2", etiqueta: "Dirección 2", tipo: "texto", max: 300, ancho: 3 },
      { nombre: "direccionEnvio", etiqueta: "Dirección de envío (entrega)", tipo: "texto", max: 300, ancho: 3 },
      ...(await ubicacion(db, "Ubicación")),
      { nombre: "zonaPostal", etiqueta: "Zona postal", tipo: "texto", max: 20 },
      { nombre: "zona", etiqueta: "Zona geográfica", tipo: "texto", max: 40 },

      { nombre: "vendedorId", etiqueta: "Vendedor", tipo: "seleccion", opciones: vendedores, seccion: "Condiciones comerciales" },
      { nombre: "cobradorId", etiqueta: "Cobrador", tipo: "seleccion", opciones: cobradores },
      { nombre: "condicionPagoId", etiqueta: "Condición de pago", tipo: "seleccion", opciones: condiciones },
      { nombre: "comisionVentaPct", etiqueta: "Comisión de venta (%)", tipo: "decimal", requerido: true },
      { nombre: "comisionCobroPct", etiqueta: "Comisión de cobranza (%)", tipo: "decimal", requerido: true },
      { nombre: "listaPrecio", etiqueta: "Lista de precios", tipo: "seleccion", requerido: true, opciones: LISTAS },
      { nombre: "descuento1", etiqueta: "Descuento de ventas 1 (%)", tipo: "decimal", requerido: true },
      { nombre: "descuento2", etiqueta: "Descuento de ventas 2 (%)", tipo: "decimal", requerido: true },
      { nombre: "descuento3", etiqueta: "Descuento de ventas 3 (%)", tipo: "decimal", requerido: true },
      { nombre: "transporteId", etiqueta: "Transporte habitual", tipo: "seleccion", opciones: transportes },
      { nombre: "divisa", etiqueta: "Moneda en que se le cotiza", tipo: "seleccion", requerido: true, opciones: DIVISAS },
      { nombre: "ultimoPrecio", etiqueta: "Respetar el último precio vendido", tipo: "booleano" },

      { nombre: "tieneCredito", etiqueta: "Compra a crédito", tipo: "booleano", seccion: "Crédito y cobranza" },
      { nombre: "limiteCredito", etiqueta: "Límite de crédito (USD)", tipo: "decimal", requerido: true },
      { nombre: "diasMaxVencimiento", etiqueta: "Días máximos de vencimiento", tipo: "entero", requerido: true, ayuda: "Antes de pasarse de estos días con facturas vencidas, se le bloquean ventas a crédito. 0 = sin tope." },
      { nombre: "diaCobro", etiqueta: "Día de cobro", tipo: "texto", max: 30 },
      { nombre: "horaCobro", etiqueta: "Hora de cobro", tipo: "texto", max: 30 },

      ...(await contabilidadTercero(db, "Contabilidad")),

      { nombre: "fechaNacimiento", etiqueta: "Fecha de nacimiento / constitución", tipo: "fecha", seccion: "Otros datos" },
      { nombre: "observaciones", etiqueta: "Observaciones", tipo: "textoLargo", max: 2000, ancho: 3 },
      { nombre: "activo", etiqueta: "Activo", tipo: "booleano" },
    ];
  },
  valoresIniciales: {
    activo: true, residente: true, contribuyente: true, situacion: "NORMAL", tipo: "Privado", listaPrecio: "A", divisa: "USD", comisionVentaPct: "0", comisionCobroPct: "0",
    descuento1: "0", descuento2: "0", descuento3: "0", limiteCredito: "0", diasMaxVencimiento: "0",
  },
  columnas: [
    { id: "razonSocial", titulo: "Razón social", campo: "razonSocial", fija: true },
    { id: "codigo", titulo: "Código", campo: "codigo" },
    { id: "documento", titulo: "RIF", campo: "documento" },
    { id: "nombreComercial", titulo: "Nombre comercial", campo: "nombreComercial", oculta: true },
    { id: "tipo", titulo: "Tipo", campo: "tipo", oculta: true },
    { id: "categoria", titulo: "Categoría", campo: "categoria", oculta: true },
    { id: "vendedor", titulo: "Vendedor", valor: nombreDe("vendedor"), oculta: true },
    { id: "condicionPago", titulo: "Condición de pago", valor: nombreDe("condicionPago"), oculta: true },
    { id: "limiteCredito", titulo: "Límite de crédito", campo: "limiteCredito", alinear: "derecha", oculta: true },
    { id: "telefono", titulo: "Teléfono", campo: "telefono" },
    { id: "email", titulo: "Correo", campo: "email", oculta: true },
    { id: "situacion", titulo: "Situación", campo: "situacion", etiqueta: situacion, oculta: true },
    { id: "activo", titulo: "Estado", campo: "activo", etiqueta: estado },
  ],
  busqueda: { texto: "Buscar por razón social, nombre comercial, código o RIF", campos: ["razonSocial", "nombreComercial", "documento", "codigo"] },
  filtros: [filtroEstado, filtroSituacion],
  orden: { columna: "razonSocial", dir: "asc" },
  titulo: (f) => String(f.razonSocial ?? ""),
  descripcion: (f) => `Código ${f.codigo} · RIF ${f.documento}`,
  preparar: normalizar,
  validar: async (db, d) => {
    const e = await validarTercero(db, d);
    return Object.keys(e).length ? e : null;
  },
  mensajeDuplicado: "Ya existe un cliente con este documento o código.",
  importable: true,
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
  incluir: { condicionPago: { select: { nombre: true } } },
  campos: async (db) => {
    const [clasificaciones, actividades] = await Promise.all([
      catalogo(db.clasificacionProveedor.findMany({ where: { activo: true }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true } }), (c) => c.nombre),
      catalogo(db.actividadEconomica.findMany({ where: { activo: true }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true } }), (c) => c.nombre),
    ]);
    const [condiciones, bancos] = await Promise.all([
      catalogo(db.condicionPago.findMany({ where: { activo: true }, orderBy: { dias: "asc" }, select: { id: true, nombre: true } }), (c) => c.nombre),
      catalogo(db.banco.findMany({ where: { activo: true }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true } }), (b) => b.nombre),
    ]);
    return [
      { nombre: "codigo", etiqueta: "Código", tipo: "texto", max: 20, soloCrear: true, seccion: "Identificación", ayuda: "Si lo dejas vacío se asigna el siguiente (P000123). No se puede cambiar después." },
      { nombre: "razonSocial", etiqueta: "Razón social", tipo: "texto", max: 200, requerido: true, ancho: 2 },
      { nombre: "documento", etiqueta: "RIF / documento", tipo: "texto", max: 25, requerido: true, ayuda: "Los puntos, guiones y espacios se quitan al guardar." },
      { nombre: "nombreComercial", etiqueta: "Nombre comercial", tipo: "texto", max: 200, ancho: 2 },
      { nombre: "tipoPersona", etiqueta: "Tipo de persona", tipo: "seleccion", opciones: PERSONAS },
      { nombre: "clasificacionId", etiqueta: "Clasificación", tipo: "seleccion", opciones: clasificaciones },
      { nombre: "actividadEconomicaId", etiqueta: "Actividad económica", tipo: "seleccion", opciones: actividades, ayuda: "Orienta el concepto de retención de ISLR." },
      { nombre: "contacto", etiqueta: "Persona de contacto", tipo: "texto", max: 120 },
      { nombre: "situacion", etiqueta: "Situación", tipo: "seleccion", requerido: true, opciones: SITUACIONES },

      { nombre: "residente", etiqueta: "Residente en el país", tipo: "booleano", seccion: "Condición fiscal", ayuda: "Define la retención de ISLR que se le practica." },
      { nombre: "contribuyente", etiqueta: "Contribuyente de IVA", tipo: "booleano" },
      { nombre: "contribuyenteEspecial", etiqueta: "Contribuyente especial", tipo: "booleano" },
      { nombre: "zonaLibre", etiqueta: "Opera en zona libre", tipo: "booleano" },
      { nombre: "retencionIvaPct", etiqueta: "Retención de IVA (%)", tipo: "decimal", requerido: true, ayuda: "0 = no se le retiene IVA; 75 o 100 según su caso. Se propone al aplicar la retención." },

      { nombre: "telefono", etiqueta: "Teléfono", tipo: "texto", max: 40, seccion: "Contacto" },
      { nombre: "telefono2", etiqueta: "Teléfono 2", tipo: "texto", max: 40 },
      { nombre: "telefono3", etiqueta: "Teléfono 3", tipo: "texto", max: 40 },
      { nombre: "celular", etiqueta: "Celular", tipo: "texto", max: 40 },
      { nombre: "celular2", etiqueta: "Otro celular", tipo: "texto", max: 40 },
      { nombre: "email", etiqueta: "Correo", tipo: "texto", max: 200 },
      { nombre: "web", etiqueta: "Página web", tipo: "texto", max: 200 },

      { nombre: "direccion", etiqueta: "Dirección", tipo: "texto", max: 300, ancho: 3, seccion: "Ubicación" },
      { nombre: "direccion2", etiqueta: "Dirección 2", tipo: "texto", max: 300, ancho: 3 },
      { nombre: "direccion3", etiqueta: "Dirección 3", tipo: "texto", max: 300, ancho: 3 },
      ...(await ubicacion(db, "Ubicación")),

      { nombre: "divisa", etiqueta: "Moneda en que factura", tipo: "seleccion", requerido: true, opciones: DIVISAS, seccion: "Condiciones de compra y pago" },
      { nombre: "condicionPagoId", etiqueta: "Condición de pago", tipo: "seleccion", opciones: condiciones, ayuda: "Si eliges una y los días de crédito están en 0, se toman de la condición." },
      { nombre: "diasCredito", etiqueta: "Días de crédito", tipo: "entero", requerido: true, ayuda: "0 = contado." },
      { nombre: "limiteCredito", etiqueta: "Límite de crédito (USD)", tipo: "decimal", requerido: true },
      { nombre: "descuento1", etiqueta: "Descuento 1 (%)", tipo: "decimal", requerido: true },
      { nombre: "descuento2", etiqueta: "Descuento 2 (%)", tipo: "decimal", requerido: true },
      { nombre: "descuento3", etiqueta: "Descuento 3 (%)", tipo: "decimal", requerido: true },
      { nombre: "cxpMonedaExtranjera", etiqueta: "Cuentas por pagar en moneda extranjera", tipo: "booleano" },
      { nombre: "ordenesMonedaExtranjera", etiqueta: "Órdenes de compra en moneda extranjera", tipo: "booleano" },
      { nombre: "solicitaCotizacionMonedaExtranjera", etiqueta: "Solicita cotización en moneda extranjera", tipo: "booleano" },

      { nombre: "bancoId", etiqueta: "Banco del proveedor", tipo: "seleccion", opciones: bancos, seccion: "Datos bancarios", ayuda: "Para pagarle por transferencia." },
      { nombre: "tipoCuentaBancaria", etiqueta: "Tipo de cuenta", tipo: "seleccion", opciones: [{ valor: "CORRIENTE", etiqueta: "Corriente" }, { valor: "AHORRO", etiqueta: "Ahorro" }] },
      { nombre: "numeroCuentaBancaria", etiqueta: "Número de cuenta", tipo: "texto", max: 30 },

      ...(await contabilidadTercero(db, "Contabilidad")),

      { nombre: "observaciones", etiqueta: "Observaciones", tipo: "textoLargo", max: 2000, ancho: 3, seccion: "Otros datos" },
      { nombre: "activo", etiqueta: "Activo", tipo: "booleano" },
    ];
  },
  valoresIniciales: {
    activo: true, residente: true, contribuyente: true, situacion: "NORMAL", divisa: "USD", diasCredito: "0", retencionIvaPct: "0", limiteCredito: "0",
    descuento1: "0", descuento2: "0", descuento3: "0",
  },
  columnas: [
    { id: "razonSocial", titulo: "Razón social", campo: "razonSocial", fija: true },
    { id: "codigo", titulo: "Código", campo: "codigo" },
    { id: "documento", titulo: "RIF", campo: "documento" },
    { id: "contacto", titulo: "Contacto", campo: "contacto" },
    { id: "telefono", titulo: "Teléfono", campo: "telefono" },
    { id: "condicionPago", titulo: "Condición de pago", valor: nombreDe("condicionPago"), oculta: true },
    { id: "diasCredito", titulo: "Días de crédito", campo: "diasCredito", alinear: "derecha" },
    { id: "retencionIvaPct", titulo: "Retención IVA %", campo: "retencionIvaPct", alinear: "derecha", oculta: true },
    { id: "email", titulo: "Correo", campo: "email", oculta: true },
    { id: "situacion", titulo: "Situación", campo: "situacion", etiqueta: situacion, oculta: true },
    { id: "activo", titulo: "Estado", campo: "activo", etiqueta: estado },
  ],
  busqueda: { texto: "Buscar por razón social, nombre comercial, código o RIF", campos: ["razonSocial", "nombreComercial", "documento", "codigo"] },
  filtros: [filtroEstado, filtroSituacion],
  orden: { columna: "razonSocial", dir: "asc" },
  titulo: (f) => String(f.razonSocial ?? ""),
  descripcion: (f) => `Código ${f.codigo} · RIF ${f.documento}`,
  preparar: normalizar,
  validar: async (db, datos) => {
    const errores = await validarTercero(db, datos);
    const d = datos.diasCredito;
    if (typeof d === "number" && (d < 0 || d > 365)) errores.diasCredito = "Entre 0 y 365 días.";
    const r = datos.retencionIvaPct;
    if (typeof r === "number" && (r < 0 || r > 100)) errores.retencionIvaPct = "Entre 0 y 100.";
    if (datos.tipoCuentaBancaria && !datos.bancoId) errores.bancoId = "Elige el banco de la cuenta.";
    if (datos.numeroCuentaBancaria && !/^[0-9 \-]{8,30}$/.test(String(datos.numeroCuentaBancaria))) errores.numeroCuentaBancaria = "Número de cuenta inválido (solo dígitos, 8 a 30).";
    return Object.keys(errores).length ? errores : null;
  },
  // Con una condición de pago elegida y 0 días de crédito, los días salen de la condición.
  completar: async (db, datos) => {
    if (typeof datos.condicionPagoId === "string" && datos.diasCredito === 0) {
      const c = await db.condicionPago.findUnique({ where: { id: datos.condicionPagoId }, select: { dias: true } });
      if (c) return { ...datos, diasCredito: c.dias };
    }
    return datos;
  },
  mensajeDuplicado: "Ya existe un proveedor con este documento o código.",
  importable: true,
  mensajeDependientes: "No se puede eliminar: tiene compras asociadas. Márcalo como inactivo en su lugar.",
};
