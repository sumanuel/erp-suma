// Conceptos contables que usa la contabilización automática y la cuenta que se propone para cada uno en un cliente nuevo (editable por su contador).
export const CONCEPTOS = {
  CXC: { etiqueta: "Cuentas por cobrar clientes", sugerida: "1.1.02", uso: "Se carga al facturar y se abona al cobrar" },
  VENTAS: { etiqueta: "Ventas", sugerida: "4.1.01", uso: "Ingreso de cada factura (sin IVA)" },
  IVA_DEBITO: { etiqueta: "IVA débito fiscal", sugerida: "2.1.02", uso: "IVA de las facturas de venta" },
  COSTO_VENTAS: { etiqueta: "Costo de ventas", sugerida: "5.1.01", uso: "Costo promedio de lo vendido" },
  INVENTARIO: { etiqueta: "Inventario de mercancía", sugerida: "1.1.03", uso: "Sale al vender (costo promedio)" },
  COMPRAS: { etiqueta: "Compras (base de facturas de proveedor)", sugerida: "1.1.03", uso: "Base de la factura del proveedor" },
  IVA_CREDITO: { etiqueta: "IVA crédito fiscal", sugerida: "1.1.04", uso: "IVA de las facturas de proveedor" },
  CXP: { etiqueta: "Cuentas por pagar proveedores", sugerida: "2.1.01", uso: "Se abona al registrar la factura y se carga al pagar" },
  DIFERENCIAL_CAMBIARIO: { etiqueta: "Diferencial cambiario", sugerida: "6.1.04", uso: "Ganancia o pérdida por cobrar/pagar a una tasa distinta de la de la factura" },
} as const;
export type Concepto = keyof typeof CONCEPTOS;
export const LISTA_CONCEPTOS = Object.keys(CONCEPTOS) as Concepto[];

export const ORIGENES_ASIENTO: Record<string, string> = {
  MANUAL: "Manual",
  FACTURA: "Factura de venta",
  ANULACION_FACTURA: "Anulación de factura",
  COBRO: "Cobro",
  ANULACION_COBRO: "Anulación de cobro",
  FACTURA_COMPRA: "Factura de proveedor",
  ANULACION_FACTURA_COMPRA: "Anulación de factura de proveedor",
  PAGO: "Pago a proveedor",
  ANULACION_PAGO: "Anulación de pago",
};
