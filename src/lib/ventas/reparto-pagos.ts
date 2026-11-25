// Reparto del total de una venta de contado entre las formas de pago, y el vuelto. Sin dependencias de servidor: lo usan el punto de venta,
// la factura con cobro y la vista previa del formulario.

export type PagoContado = {
  formaPago: string;
  moneda: string;
  /// Lo que entregó el cliente, en la moneda del pago.
  recibido: number;
};

export type ParteReparto<P> = { p: P; montoUsd: number; montoMoneda: number; exceso: number };

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const r4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;
const bs = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2 });

/** Lo recibido, en bolívares (lo que realmente se cuenta), a la tasa dada. */
export const recibidoEnBs = (pagos: PagoContado[], tasa: number) => r2(pagos.reduce((s, p) => s + (p.moneda === "VES" ? p.recibido : p.recibido * tasa), 0));

/**
 * Reparte el total (USD) entre los pagos en orden: cada uno aplica lo que pueda hasta completar. Solo el último puede dejar excedente, y solo
 * si es en efectivo (es el vuelto). Devuelve el motivo si no se puede cobrar así.
 */
export function repartirPagos<P extends PagoContado>(totalUsd: number, totalBs: number, tasa: number, pagos: P[], nombreForma: (f: string) => string): { error: string } | { reparto: ParteReparto<P>[] } {
  const recibido = recibidoEnBs(pagos, tasa);
  if (recibido + 0.005 < totalBs) return { error: `Falta cobrar ${bs(totalBs - recibido)} Bs. (total ${bs(totalBs)} Bs., recibido ${bs(recibido)} Bs.).` };
  let falta = totalUsd;
  const reparto: ParteReparto<P>[] = [];
  for (const p of pagos) {
    if (falta <= 0) return { error: "Sobra un pago: la venta ya estaba cubierta por los anteriores." };
    const usdEq = r4(p.moneda === "USD" ? p.recibido : p.recibido / tasa);
    const montoUsd = Math.min(falta, usdEq);
    const completo = usdEq <= falta + 1e-9;
    const montoMoneda = completo ? p.recibido : r2(p.moneda === "USD" ? montoUsd : montoUsd * tasa);
    const exceso = r2(p.recibido - montoMoneda);
    if (exceso > 0 && p.formaPago !== "EFECTIVO") return { error: `El pago por ${nombreForma(p.formaPago)} supera lo que falta por cobrar: solo el efectivo da vuelto.` };
    reparto.push({ p, montoUsd: completo ? usdEq : r4(montoUsd), montoMoneda, exceso });
    falta = r4(falta - (completo ? usdEq : montoUsd));
  }
  // Un resto de centavos por redondeo se carga al último pago (no cambia lo que se recibió).
  if (falta > 0) {
    if (r2(falta * tasa) > 0.01) return { error: "Falta cobrar parte de la venta." };
    reparto[reparto.length - 1].montoUsd = r4(reparto[reparto.length - 1].montoUsd + falta);
  }
  if (reparto.slice(0, -1).some((x) => x.exceso > 0)) return { error: "Solo el último pago puede generar vuelto." };
  return { reparto };
}
