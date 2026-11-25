-- Devolución de una factura ya cobrada: lo que excede la deuda se reintegra (sale de una caja o banco) o queda como saldo a favor del cliente.
ALTER TABLE "nota_venta"
  ADD COLUMN "excedente" DECIMAL(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN "saldo_favor" DECIMAL(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN "cobro_favor_id" UUID;
ALTER TABLE "nota_venta" ADD CONSTRAINT "nota_venta_excedente_valido" CHECK ("excedente" >= 0 AND "excedente" <= "total" AND "saldo_favor" >= 0 AND "saldo_favor" <= "excedente" AND ("excedente" = 0 OR "modo" = 'DEVOLUCION'));
ALTER TABLE "nota_venta" ADD CONSTRAINT "nota_venta_cobro_favor_id_fkey" FOREIGN KEY ("cobro_favor_id") REFERENCES "cobro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "nota_venta_reintegro" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "nota_id" UUID NOT NULL,
  "forma_pago" TEXT NOT NULL,
  "moneda" TEXT NOT NULL,
  "monto" DECIMAL(18,2) NOT NULL,
  "monto_usd" DECIMAL(18,4) NOT NULL,
  "cuenta_id" UUID NOT NULL,
  "referencia" TEXT,
  CONSTRAINT "nota_venta_reintegro_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "nota_venta_reintegro_valido" CHECK ("moneda" IN ('USD','VES') AND "monto" > 0 AND "monto_usd" > 0)
);
CREATE INDEX "nota_venta_reintegro_nota_id_idx" ON "nota_venta_reintegro"("nota_id");
ALTER TABLE "nota_venta_reintegro" ADD CONSTRAINT "nota_venta_reintegro_nota_id_fkey" FOREIGN KEY ("nota_id") REFERENCES "nota_venta"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "nota_venta_reintegro" ADD CONSTRAINT "nota_venta_reintegro_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "cuenta_tesoreria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "movimiento_tesoreria" DROP CONSTRAINT "movimiento_tesoreria_tipo_valido";
ALTER TABLE "movimiento_tesoreria" ADD CONSTRAINT "movimiento_tesoreria_tipo_valido" CHECK ("tipo" IN ('SALDO_INICIAL','COBRO','PAGO','ANULACION_COBRO','ANULACION_PAGO','INGRESO','EGRESO','TRANSFERENCIA_ENTRADA','TRANSFERENCIA_SALIDA','ENTERO_IMPUESTO','ANULACION_ENTERO','VUELTO_ENTRADA','VUELTO_SALIDA','IMPUESTO_ITF','REINTEGRO','ANULACION_REINTEGRO'));
ALTER TABLE "movimiento_tesoreria" DROP CONSTRAINT "movimiento_tesoreria_signo_coherente";
ALTER TABLE "movimiento_tesoreria" ADD CONSTRAINT "movimiento_tesoreria_signo_coherente" CHECK (
  ("tipo" IN ('COBRO','ANULACION_PAGO','INGRESO','TRANSFERENCIA_ENTRADA','ANULACION_ENTERO','VUELTO_ENTRADA','ANULACION_REINTEGRO') AND "monto" > 0)
  OR ("tipo" IN ('PAGO','ANULACION_COBRO','EGRESO','TRANSFERENCIA_SALIDA','ENTERO_IMPUESTO','VUELTO_SALIDA','IMPUESTO_ITF','REINTEGRO') AND "monto" < 0)
  OR "tipo" = 'SALDO_INICIAL'
);
