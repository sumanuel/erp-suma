// Constantes de tesorería sin acceso a datos (las usan servidor y navegador).
export const TIPOS_MOVIMIENTO_TESORERIA = {
  SALDO_INICIAL: { etiqueta: "Saldo inicial", signo: 1, anulacion: false },
  COBRO: { etiqueta: "Cobro", signo: 1, anulacion: false },
  PAGO: { etiqueta: "Pago a proveedor", signo: -1, anulacion: false },
  ANULACION_COBRO: { etiqueta: "Anulación de cobro", signo: -1, anulacion: true },
  ANULACION_PAGO: { etiqueta: "Anulación de pago", signo: 1, anulacion: true },
  INGRESO: { etiqueta: "Ingreso", signo: 1, anulacion: false },
  EGRESO: { etiqueta: "Egreso", signo: -1, anulacion: false },
  TRANSFERENCIA_ENTRADA: { etiqueta: "Transferencia (entrada)", signo: 1, anulacion: false },
  TRANSFERENCIA_SALIDA: { etiqueta: "Transferencia (salida)", signo: -1, anulacion: false },
  ENTERO_IMPUESTO: { etiqueta: "Pago de impuestos retenidos", signo: -1, anulacion: false },
  ANULACION_ENTERO: { etiqueta: "Anulación de pago de impuestos", signo: 1, anulacion: true },
  IMPUESTO_ITF: { etiqueta: "Impuesto a las transacciones financieras", signo: -1, anulacion: false },
  VUELTO_ENTRADA: { etiqueta: "Excedente recibido (vuelto en otra moneda)", signo: 1, anulacion: false },
  VUELTO_SALIDA: { etiqueta: "Vuelto entregado en otra moneda", signo: -1, anulacion: false },
  REINTEGRO: { etiqueta: "Reintegro por devolución", signo: -1, anulacion: false },
  ANULACION_REINTEGRO: { etiqueta: "Anulación de reintegro", signo: 1, anulacion: true },
} as const;
export type TipoMovimientoTesoreria = keyof typeof TIPOS_MOVIMIENTO_TESORERIA;

export const TIPOS_CUENTA = { CAJA: "Caja", BANCO: "Banco" } as const;
export const MONEDAS_CUENTA = { USD: { etiqueta: "Dólares (USD)", simbolo: "$" }, VES: { etiqueta: "Bolívares (Bs.)", simbolo: "Bs." } } as const;

export const formatoMonto = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
