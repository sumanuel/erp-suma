import "server-only";
import type { Db } from "@/lib/tenant";

// Numeración por tipo de documento (original: correlativo de admtipdoccli / admtipdocpro). Cada tipo tiene un contador en `tipo_documento`
// que se avanza con un UPDATE dentro de la misma transacción que crea el documento: la fila queda bloqueada hasta confirmar, así que dos
// emisiones simultáneas no repiten número y, si la transacción se revierte, el número no se gasta (sin saltos).
// Como en el original, solo llevan correlativo los documentos que el sistema numera: los de proveedor que se transcriben (facturas, notas,
// pagarés) y los pagos no lo tienen.

type Tx = Parameters<Parameters<Db["$transaction"]>[0]>[0];

/**
 * Tipos de documento con contador. `tablas`: dónde viven los números (constantes: nunca vienen del usuario); el contador nunca queda por
 * debajo del mayor número que ya exista. Sin tablas = es un número de comprobante, no el correlativo de una tabla (las retenciones).
 */
export const TIPOS_NUMERADOS = {
  FACTURA: { tablas: ["factura"], prefijo: "FAC-", digitos: 6 },
  // Créditos y débitos viven en la misma tabla pero cada uno lleva su correlativo (en el original: DEV y NDE).
  NOTA_CREDITO: { tablas: ["nota_venta"], donde: `"tipo" = 'CREDITO'`, prefijo: "NC-", digitos: 6 },
  NOTA_DEBITO: { tablas: ["nota_venta"], donde: `"tipo" = 'DEBITO'`, prefijo: "ND-", digitos: 6 },
  PEDIDO: { tablas: ["pedido_venta"], prefijo: "PED-", digitos: 6 },
  COTIZACION: { tablas: ["cotizacion"], prefijo: "COT-", digitos: 6 },
  // Las órdenes de importación comparten este correlativo (en el original ambas son el tipo ORC).
  ORDEN_COMPRA: { tablas: ["orden_compra", "importacion"], prefijo: "OC-", digitos: 6 },
  RECIBO_COBRO: { tablas: ["recibo_cobro"], prefijo: "RC-", digitos: 6 },
  RECEPCION: { tablas: ["recepcion"], prefijo: "REC-", digitos: 6 },
  RETENCION_IVA: { tablas: [], prefijo: "", digitos: 8 },
  RETENCION_ISLR: { tablas: [], prefijo: "", digitos: 8 },
} as const satisfies Record<string, { tablas: readonly string[]; donde?: string; prefijo: string; digitos: number }>;
export type TipoNumerado = keyof typeof TIPOS_NUMERADOS;

const mayorSql = (tipo: TipoNumerado) => {
  const d: { tablas: readonly string[]; donde?: string } = TIPOS_NUMERADOS[tipo];
  return d.tablas.map((t) => `COALESCE((SELECT MAX("numero") FROM "${t}"${d.donde ? ` WHERE ${d.donde}` : ""}), 0)`);
};

/** El mayor número que ya existe de ese documento (los contadores nunca pueden quedar por debajo). */
export async function mayorNumeroExistente(db: Pick<Db, "$queryRawUnsafe">, tipo: TipoNumerado): Promise<number> {
  const partes = mayorSql(tipo);
  if (partes.length === 0) return 0;
  const r = await db.$queryRawUnsafe<{ m: number }[]>(`SELECT GREATEST(${partes.join(", ")})::int AS m`);
  return r[0]?.m ?? 0;
}

/** Siguiente número del tipo: el contador + 1, o el mayor existente + 1 si alguien creó documentos por fuera. */
export async function siguienteNumero(tx: Tx, tipo: TipoNumerado): Promise<number> {
  const r = await tx.$queryRawUnsafe<{ n: number }[]>(
    `UPDATE "tipo_documento" SET "ultimo_numero" = GREATEST("ultimo_numero"${mayorSql(tipo).map((p) => `, ${p}`).join("")}) + 1, "actualizado_en" = now() WHERE "codigo" = $1 RETURNING "ultimo_numero" AS n`,
    tipo,
  );
  if (!r[0]) throw new Error(`Falta el tipo de documento ${tipo} en la numeración.`);
  return r[0].n;
}

/**
 * Número del comprobante de una retención que practicamos (original: YYYYMM + el correlativo de 8 dígitos de RIVA/RISL). Avanza el contador
 * del tipo (IVA o ISLR) en la misma transacción.
 */
export async function siguienteComprobanteRetencion(tx: Tx, tipo: "IVA" | "ISLR", fecha: Date): Promise<string> {
  const n = await siguienteNumero(tx, tipo === "IVA" ? "RETENCION_IVA" : "RETENCION_ISLR");
  return `${fecha.getUTCFullYear()}${String(fecha.getUTCMonth() + 1).padStart(2, "0")}${String(n).padStart(8, "0")}`;
}

const fiscal = (n: number) => String(n).padStart(8, "0");
const control = (n: number) => `00-${String(n).padStart(8, "0")}`;

/**
 * Si la numeración fiscal de las facturas es automática, devuelve el siguiente número de factura y de control (los contadores avanzan en la
 * misma transacción). Se saltan los que ya estén en otra factura (por ejemplo, registrados a mano). Si no es automática, devuelve null.
 */
export async function siguienteFiscalFactura(tx: Tx): Promise<{ numeroFiscal: string; numeroControl: string } | null> {
  const t = await tx.$queryRawUnsafe<{ fiscal_automatico: boolean; ultimo_fiscal: number; ultimo_control: number }[]>(`SELECT "fiscal_automatico", "ultimo_fiscal", "ultimo_control" FROM "tipo_documento" WHERE "codigo" = 'FACTURA' FOR UPDATE`);
  if (!t[0]?.fiscal_automatico) return null;
  let nf = t[0].ultimo_fiscal;
  let nc = t[0].ultimo_control;
  for (let i = 0; i < 1000; i++) {
    nf++;
    if (!(await tx.factura.findFirst({ where: { numeroFiscal: fiscal(nf) }, select: { id: true } }))) break;
  }
  for (let i = 0; i < 1000; i++) {
    nc++;
    if (!(await tx.factura.findFirst({ where: { numeroControl: control(nc) }, select: { id: true } }))) break;
  }
  await tx.$executeRawUnsafe(`UPDATE "tipo_documento" SET "ultimo_fiscal" = $1, "ultimo_control" = $2, "actualizado_en" = now() WHERE "codigo" = 'FACTURA'`, nf, nc);
  return { numeroFiscal: fiscal(nf), numeroControl: control(nc) };
}
