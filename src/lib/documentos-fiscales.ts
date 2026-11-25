// Datos que deja la máquina fiscal (o la imprenta) en un documento de venta: número fiscal, número de control y la impresora que lo emitió
// (original: dcli_numfis, dcli_impresora y dcli_modfis de admdoccli). Reglas comunes a facturas y notas: cada dato se escribe una sola vez.

export type DatosFiscales = { numeroFiscal: string | null; numeroControl: string | null; impresoraSerial?: string | null; impresoraModelo?: string | null };
export type FiscalesActuales = { numeroFiscal: string | null; numeroControl: string | null; impresoraSerial: string | null; impresoraModelo: string | null };

const CAMPOS = ["numeroFiscal", "numeroControl", "impresoraSerial", "impresoraModelo"] as const;
const CODIGO = /^[A-Za-z0-9][A-Za-z0-9\-/.]{0,29}$/;

/** Revisa lo que se quiere registrar contra lo ya guardado. Devuelve los datos nuevos y la condición «siguen vacíos», o el motivo de rechazo. */
export function planearDatosFiscales(actual: FiscalesActuales, d: DatosFiscales): { error: string } | { datos: Partial<Record<(typeof CAMPOS)[number], string>>; vacios: Partial<Record<(typeof CAMPOS)[number], null>> } {
  const datos: Partial<Record<(typeof CAMPOS)[number], string>> = {};
  for (const c of CAMPOS) {
    const v = d[c]?.trim();
    if (v) datos[c] = v;
  }
  for (const c of ["numeroFiscal", "numeroControl", "impresoraSerial"] as const) {
    if (datos[c] !== undefined && !CODIGO.test(datos[c])) return { error: "Los números y el serial admiten letras, dígitos, guion, punto y barra (máximo 30 caracteres)." };
  }
  if ((datos.impresoraModelo?.length ?? 0) > 60) return { error: "El modelo de la impresora admite máximo 60 caracteres." };
  const nuevos = Object.keys(datos) as (typeof CAMPOS)[number][];
  if (nuevos.length === 0) return { error: "Indica el número de factura o el de control." };
  if (nuevos.some((c) => actual[c])) return { error: "Ese dato ya estaba registrado y no se puede cambiar." };
  return { datos, vacios: Object.fromEntries(nuevos.map((c) => [c, null])) };
}
