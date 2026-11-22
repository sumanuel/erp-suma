import "server-only";
import type { Db } from "@/lib/tenant";
import { balanceComprobacion, type FilaBalance } from "@/lib/contabilidad/reportes";
import { aFecha } from "./ayudas";
import type { Fila, Resultado } from "./tipos";

// Estados financieros en bolívares, calculados del libro contable (solo asientos registrados). Los montos internos están en centavos enteros.
const clave = (c: string) => c.split(".").map((n) => n.padStart(6, "0")).join(".");
const orden = (a: FilaBalance, b: FilaBalance) => clave(a.codigo).localeCompare(clave(b.codigo));
const bs = (centavos: number) => centavos / 100;

/** Líneas de un tipo de cuenta: cada cuenta con movimiento (las de agrupación en negrita) y el total del tipo. `signo` +1 deudor, −1 acreedor. */
function seccion(filas: FilaBalance[], tipos: string[], valor: (f: FilaBalance) => number, signo: 1 | -1) {
  const lista = filas.filter((f) => tipos.includes(f.tipo) && valor(f) !== 0).sort(orden);
  // Las cuentas marcadas «no imprime balance» no se detallan, pero sus montos siguen sumando en los totales.
  const lineas: Fila[] = lista.filter((f) => f.imprimeBalance || !f.posteable).map((f) => ({ cuenta: `${f.codigo} ${f.nombre}`, saldo: bs(signo * valor(f)), _nivel: f.nivel - 1, _negrita: !f.posteable }));
  const total = lista.filter((f) => f.posteable).reduce((s, f) => s + signo * valor(f), 0);
  return { lineas, total };
}

/** Balance general al día `hasta`: Activo = Pasivo + Patrimonio, donde el patrimonio incluye el resultado acumulado del ejercicio aún no cerrado. */
export async function reporteBalanceGeneral(db: Db, v: Record<string, string>): Promise<Resultado> {
  const { filas } = await balanceComprobacion(db, new Date(Date.UTC(2000, 0, 1)), aFecha(v.hasta));
  const saldo = (f: FilaBalance) => f.saldoFinal;
  const activo = seccion(filas, ["ACTIVO"], saldo, 1);
  const pasivo = seccion(filas, ["PASIVO"], saldo, -1);
  const patrimonio = seccion(filas, ["PATRIMONIO"], saldo, -1);
  // Resultado acumulado = ingresos − costos − gastos (en positivo si hay ganancia).
  const resultado = -filas.filter((f) => f.posteable && ["INGRESO", "COSTO", "GASTO"].includes(f.tipo)).reduce((s, f) => s + f.saldoFinal, 0);
  const totalPatrimonio = patrimonio.total + resultado;
  const cuadra = activo.total === pasivo.total + totalPatrimonio;
  const filasOut: Fila[] = [
    { cuenta: "ACTIVO", saldo: null, _negrita: true }, ...activo.lineas, { cuenta: "Total activo", saldo: bs(activo.total), _negrita: true },
    { cuenta: "PASIVO", saldo: null, _negrita: true }, ...pasivo.lineas, { cuenta: "Total pasivo", saldo: bs(pasivo.total), _negrita: true },
    { cuenta: "PATRIMONIO", saldo: null, _negrita: true }, ...patrimonio.lineas, { cuenta: "Resultado del ejercicio (aún no cerrado)", saldo: bs(resultado), _nivel: 1 },
    { cuenta: "Total patrimonio", saldo: bs(totalPatrimonio), _negrita: true },
    { cuenta: "Total pasivo + patrimonio", saldo: bs(pasivo.total + totalPatrimonio), _negrita: true },
  ];
  return {
    columnas: [{ clave: "cuenta", titulo: "Cuenta", tipo: "texto" }, { clave: "saldo", titulo: "Saldo Bs.", tipo: "moneda" }],
    filas: filasOut,
    notas: [cuadra ? "El balance cuadra: Activo = Pasivo + Patrimonio." : "ATENCIÓN: el balance NO cuadra. Hay un error en los datos contables.", "Cifras en bolívares según los asientos registrados al día indicado."],
  };
}

/** Estado de resultados del rango [desde, hasta]: ingresos, costos y gastos de ese período. */
export async function reporteEstadoResultados(db: Db, v: Record<string, string>): Promise<Resultado> {
  const { filas } = await balanceComprobacion(db, aFecha(v.desde), aFecha(v.hasta));
  const neto = (f: FilaBalance) => f.debe - f.haber; // movimiento del período, no el saldo acumulado
  const ingresos = seccion(filas, ["INGRESO"], neto, -1);
  const costos = seccion(filas, ["COSTO"], neto, 1);
  const gastos = seccion(filas, ["GASTO"], neto, 1);
  const bruta = ingresos.total - costos.total;
  const utilidad = bruta - gastos.total;
  return {
    columnas: [{ clave: "cuenta", titulo: "Cuenta", tipo: "texto" }, { clave: "saldo", titulo: "Monto Bs.", tipo: "moneda" }],
    filas: [
      { cuenta: "INGRESOS", saldo: null, _negrita: true }, ...ingresos.lineas, { cuenta: "Total ingresos", saldo: bs(ingresos.total), _negrita: true },
      { cuenta: "COSTOS", saldo: null, _negrita: true }, ...costos.lineas, { cuenta: "Total costos", saldo: bs(costos.total), _negrita: true },
      { cuenta: "Utilidad bruta", saldo: bs(bruta), _negrita: true },
      { cuenta: "GASTOS", saldo: null, _negrita: true }, ...gastos.lineas, { cuenta: "Total gastos", saldo: bs(gastos.total), _negrita: true },
      { cuenta: utilidad >= 0 ? "Utilidad neta del período" : "Pérdida neta del período", saldo: bs(utilidad), _negrita: true },
    ],
    notas: ["Movimientos del período en bolívares según los asientos registrados."],
  };
}

/**
 * Libro diario del rango: cada asiento registrado con sus líneas (cuenta, auxiliar, referencia, documento, concepto, debe y haber), en bolívares.
 * Las líneas de las cuentas marcadas «no se detalla en el libro diario» se omiten (y se avisa cuántas).
 */
export async function reporteLibroDiario(db: Db, v: Record<string, string>): Promise<Resultado> {
  const asientos = await db.asiento.findMany({
    where: { estado: "REGISTRADO", fecha: { gte: aFecha(v.desde), lte: aFecha(v.hasta) } },
    orderBy: { numero: "asc" },
    take: 5000,
    include: { lineas: { orderBy: { linea: "asc" }, include: { cuenta: { select: { codigo: true, nombre: true, imprimeDiario: true } }, auxiliar: { select: { codigo: true, nombre: true } } } } },
  });
  const filas: Fila[] = [];
  let omitidas = 0;
  let debe = 0, haber = 0;
  for (const a of asientos) {
    filas.push({ fecha: a.fecha, asiento: `AS-${String(a.numero).padStart(6, "0")}`, cuenta: a.descripcion, auxiliar: "", referencia: a.referencia ?? "", documento: "", detalle: a.origen === "APERTURA" ? "APERTURA" : "", debe: null, haber: null, _negrita: true });
    for (const l of a.lineas) {
      if (!l.cuenta.imprimeDiario) { omitidas++; continue; }
      debe += Math.round(Number(l.debe) * 100);
      haber += Math.round(Number(l.haber) * 100);
      filas.push({ fecha: null, asiento: "", cuenta: `${l.cuenta.codigo} ${l.cuenta.nombre}`, auxiliar: l.auxiliar ? `${l.auxiliar.codigo} · ${l.auxiliar.nombre}` : "", referencia: l.referencia ?? "", documento: l.documento ?? "", detalle: l.descripcion ?? "", debe: Number(l.debe) || null, haber: Number(l.haber) || null, _nivel: 1 });
    }
  }
  return {
    columnas: [
      { clave: "fecha", titulo: "Fecha", tipo: "fecha" }, { clave: "asiento", titulo: "Asiento", tipo: "texto" }, { clave: "cuenta", titulo: "Cuenta / descripción", tipo: "texto" }, { clave: "auxiliar", titulo: "Auxiliar", tipo: "texto" },
      { clave: "referencia", titulo: "Referencia", tipo: "texto" }, { clave: "documento", titulo: "Documento", tipo: "texto" }, { clave: "detalle", titulo: "Concepto", tipo: "texto" },
      { clave: "debe", titulo: "Debe Bs.", tipo: "moneda" }, { clave: "haber", titulo: "Haber Bs.", tipo: "moneda" },
    ],
    filas,
    totales: { debe: bs(debe), haber: bs(haber) },
    notas: [
      `${asientos.length} asiento(s) registrado(s) en el período${asientos.length === 5000 ? " (se muestran los primeros 5.000)" : ""}.`,
      ...(omitidas ? [`Se omiten ${omitidas} línea(s) de cuentas marcadas como «no se detalla en el libro diario»: el debe y el haber mostrados pueden no coincidir.`] : []),
    ],
  };
}
