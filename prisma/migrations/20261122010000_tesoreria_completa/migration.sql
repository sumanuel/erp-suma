-- Cuentas con los datos bancarios del sistema anterior (titular, banco del catálogo, ITF, chequeras) y pagos con cheque (ver ANALISIS-CAMPOS.md, 5.2 y 5.3).

ALTER TABLE "cuenta_tesoreria"
  ADD COLUMN "banco_id" UUID,
  ADD COLUMN "titular" TEXT,
  ADD COLUMN "sucursal" TEXT,
  ADD COLUMN "descripcion" TEXT,
  ADD COLUMN "tipo_cuenta_bancaria" TEXT,
  ADD COLUMN "acepta_depositos" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "acepta_pagos" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "itf_porcentaje" DECIMAL(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN "itf_desde" DATE,
  ADD COLUMN "itf_hasta" DATE,
  ADD COLUMN "formato_cheque" TEXT;
ALTER TABLE "cuenta_tesoreria"
  ADD CONSTRAINT "cuenta_tesoreria_banco_id_fkey" FOREIGN KEY ("banco_id") REFERENCES "banco"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "cuenta_tipo_cuenta_valido" CHECK ("tipo_cuenta_bancaria" IS NULL OR "tipo_cuenta_bancaria" IN ('CORRIENTE','AHORRO')),
  ADD CONSTRAINT "cuenta_itf_valido" CHECK ("itf_porcentaje" BETWEEN 0 AND 100 AND ("itf_desde" IS NULL OR "itf_hasta" IS NULL OR "itf_hasta" >= "itf_desde"));

CREATE TABLE "chequera" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cuenta_id" UUID NOT NULL,
    "desde" INTEGER NOT NULL,
    "hasta" INTEGER NOT NULL,
    "ultimo_cheque" INTEGER NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT false,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chequera_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "chequera_cuenta_id_idx" ON "chequera"("cuenta_id");
-- Una sola chequera activa por cuenta.
CREATE UNIQUE INDEX "chequera_una_activa_por_cuenta" ON "chequera"("cuenta_id") WHERE "activa";
ALTER TABLE "chequera"
  ADD CONSTRAINT "chequera_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "cuenta_tesoreria"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "chequera_rango_valido" CHECK ("desde" > 0 AND "hasta" >= "desde" AND "ultimo_cheque" >= "desde" - 1 AND "ultimo_cheque" <= "hasta");

ALTER TABLE "pago_proveedor"
  ADD COLUMN "numero_cheque" INTEGER,
  ADD COLUMN "chequera_id" UUID,
  ADD COLUMN "portador" TEXT,
  ADD COLUMN "comprobante" TEXT;
ALTER TABLE "pago_proveedor" ADD CONSTRAINT "pago_proveedor_chequera_id_fkey" FOREIGN KEY ("chequera_id") REFERENCES "chequera"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- El libro de tesorería admite el cargo del impuesto a las transacciones financieras (ITF).
ALTER TABLE "movimiento_tesoreria" DROP CONSTRAINT "movimiento_tesoreria_tipo_valido";
ALTER TABLE "movimiento_tesoreria" ADD CONSTRAINT "movimiento_tesoreria_tipo_valido" CHECK ("tipo" IN ('SALDO_INICIAL','COBRO','PAGO','ANULACION_COBRO','ANULACION_PAGO','INGRESO','EGRESO','TRANSFERENCIA_ENTRADA','TRANSFERENCIA_SALIDA','ENTERO_IMPUESTO','ANULACION_ENTERO','VUELTO_ENTRADA','VUELTO_SALIDA','IMPUESTO_ITF'));
ALTER TABLE "movimiento_tesoreria" DROP CONSTRAINT "movimiento_tesoreria_signo_coherente";
ALTER TABLE "movimiento_tesoreria" ADD CONSTRAINT "movimiento_tesoreria_signo_coherente" CHECK (
  ("tipo" IN ('COBRO','ANULACION_PAGO','INGRESO','TRANSFERENCIA_ENTRADA','ANULACION_ENTERO','VUELTO_ENTRADA') AND "monto" > 0)
  OR ("tipo" IN ('PAGO','ANULACION_COBRO','EGRESO','TRANSFERENCIA_SALIDA','ENTERO_IMPUESTO','VUELTO_SALIDA','IMPUESTO_ITF') AND "monto" < 0)
  OR "tipo" = 'SALDO_INICIAL'
);

-- Concepto contable del ITF (gastos financieros) para los clientes que ya existen.
INSERT INTO "cuenta_concepto" ("concepto", "cuenta_id") SELECT 'GASTOS_FINANCIEROS', id FROM "cuenta_contable" WHERE codigo = '6.1.03' ON CONFLICT ("concepto") DO NOTHING;
