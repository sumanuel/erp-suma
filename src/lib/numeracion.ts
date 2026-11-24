import "server-only";
import type { Db } from "@/lib/tenant";

// Numeración por tipo de documento (original: correlativo de admtipdoccli / admtipdocpro). Cada tipo tiene un contador en `tipo_documento`
// que se avanza con un UPDATE dentro de la misma transacción que crea el documento: la fila queda bloqueada hasta confirmar, así que dos
// emisiones simultáneas no repiten número y, si la transacción se revierte, el número no se gasta (sin saltos).

type Tx = Parameters<Parameters<Db["$transaction"]>[0]>[0];

/** Tipos de documento numerados y la tabla donde viven sus números (constantes: nunca vienen del usuario). */
export const TIPOS_NUMERADOS = {
  FACTURA: { tabla: "factura", prefijo: "FAC-" },
  NOTA_VENTA: { tabla: "nota_venta", prefijo: "NC-/ND-" },
  PEDIDO: { tabla: "pedido_venta", prefijo: "PED-" },
  COTIZACION: { tabla: "cotizacion", prefijo: "COT-" },
  ORDEN_COMPRA: { tabla: "orden_compra", prefijo: "OC-" },
} as const;
export type TipoNumerado = keyof typeof TIPOS_NUMERADOS;

/** El mayor número que ya existe de ese documento (los contadores nunca pueden quedar por debajo). */
export async function mayorNumeroExistente(db: Pick<Db, "$queryRawUnsafe">, tipo: TipoNumerado): Promise<number> {
  const r = await db.$queryRawUnsafe<{ m: number | null }[]>(`SELECT MAX("numero")::int AS m FROM "${TIPOS_NUMERADOS[tipo].tabla}"`);
  return r[0]?.m ?? 0;
}

/** Siguiente número interno del tipo: el contador + 1, o el mayor existente + 1 si alguien creó documentos por fuera. */
export async function siguienteNumero(tx: Tx, tipo: TipoNumerado): Promise<number> {
  const { tabla } = TIPOS_NUMERADOS[tipo];
  const r = await tx.$queryRawUnsafe<{ n: number }[]>(
    `UPDATE "tipo_documento" SET "ultimo_numero" = GREATEST("ultimo_numero", COALESCE((SELECT MAX("numero") FROM "${tabla}"), 0)) + 1, "actualizado_en" = now() WHERE "codigo" = $1 RETURNING "ultimo_numero" AS n`,
    tipo,
  );
  if (!r[0]) throw new Error(`Falta el tipo de documento ${tipo} en la numeración.`);
  return r[0].n;
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
