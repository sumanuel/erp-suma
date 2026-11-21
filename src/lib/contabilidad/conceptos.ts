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
  RET_IVA_PAGAR: { etiqueta: "Retenciones de IVA por pagar", sugerida: "2.1.03", uso: "IVA que retenemos a proveedores y debemos enterar" },
  RET_ISLR_PAGAR: { etiqueta: "Retenciones de ISLR por pagar", sugerida: "2.1.04", uso: "ISLR que retenemos a proveedores y debemos enterar" },
  RET_IVA_SUFRIDA: { etiqueta: "IVA retenido por clientes (a favor)", sugerida: "1.1.05", uso: "IVA que un cliente nos retuvo al pagarnos" },
  RET_ISLR_SUFRIDA: { etiqueta: "ISLR retenido por clientes (anticipo)", sugerida: "1.1.06", uso: "ISLR que un cliente nos retuvo al pagarnos" },
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
  NOTA_VENTA: "Nota de crédito o débito de venta",
  ANULACION_NOTA_VENTA: "Anulación de nota de venta",
  NOTA_COMPRA: "Nota del proveedor",
  ANULACION_NOTA_COMPRA: "Anulación de nota del proveedor",
  RETENCION: "Retención de IVA o ISLR",
  ANULACION_RETENCION: "Anulación de retención",
  TESORERIA: "Movimiento de tesorería",
  ENTERO_RETENCION: "Pago de retenciones al fisco",
  ANULACION_ENTERO_RETENCION: "Anulación de pago de retenciones",
};
