-- AlterTable
ALTER TABLE "proveedor" ADD COLUMN     "retencion_iva_pct" DECIMAL(7,4) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "retencion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "numero" SERIAL NOT NULL,
    "tipo" TEXT NOT NULL,
    "sentido" TEXT NOT NULL,
    "factura_compra_id" UUID,
    "proveedor_id" UUID,
    "factura_id" UUID,
    "cliente_id" UUID,
    "comprobante" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "concepto" TEXT,
    "base_usd" DECIMAL(18,4) NOT NULL,
    "porcentaje" DECIMAL(7,4) NOT NULL,
    "monto_usd" DECIMAL(18,4) NOT NULL,
    "tasa_usd" DECIMAL(18,8) NOT NULL,
    "monto_bs" DECIMAL(18,2) NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'ACTIVA',
    "creado_por_id" UUID,
    "creado_por_nombre" TEXT,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anulada_en" TIMESTAMPTZ(6),
    "anulada_por_nombre" TEXT,
    "motivo_anulacion" TEXT,

    CONSTRAINT "retencion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "retencion_numero_key" ON "retencion"("numero");

-- CreateIndex
CREATE INDEX "retencion_factura_compra_id_idx" ON "retencion"("factura_compra_id");

-- CreateIndex
CREATE INDEX "retencion_factura_id_idx" ON "retencion"("factura_id");

-- CreateIndex
CREATE INDEX "retencion_estado_fecha_idx" ON "retencion"("estado", "fecha" DESC);

-- AddForeignKey
ALTER TABLE "retencion" ADD CONSTRAINT "retencion_factura_compra_id_fkey" FOREIGN KEY ("factura_compra_id") REFERENCES "factura_compra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retencion" ADD CONSTRAINT "retencion_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retencion" ADD CONSTRAINT "retencion_factura_id_fkey" FOREIGN KEY ("factura_id") REFERENCES "factura"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retencion" ADD CONSTRAINT "retencion_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- Reglas que Prisma no expresa.
ALTER TABLE "proveedor" ADD CONSTRAINT "proveedor_retencion_iva_valida" CHECK ("retencion_iva_pct" >= 0 AND "retencion_iva_pct" <= 100);
ALTER TABLE "retencion" ADD CONSTRAINT "retencion_tipo_valido" CHECK ("tipo" IN ('IVA','ISLR'));
ALTER TABLE "retencion" ADD CONSTRAINT "retencion_sentido_valido" CHECK ("sentido" IN ('PRACTICADA','SUFRIDA'));
ALTER TABLE "retencion" ADD CONSTRAINT "retencion_estado_valido" CHECK ("estado" IN ('ACTIVA','ANULADA'));
-- Una practicada cuelga de una factura de compra y su proveedor; una sufrida, de una factura de venta y su cliente.
ALTER TABLE "retencion" ADD CONSTRAINT "retencion_documento_coherente" CHECK (
  ("sentido" = 'PRACTICADA' AND "factura_compra_id" IS NOT NULL AND "proveedor_id" IS NOT NULL AND "factura_id" IS NULL AND "cliente_id" IS NULL)
  OR ("sentido" = 'SUFRIDA' AND "factura_id" IS NOT NULL AND "cliente_id" IS NOT NULL AND "factura_compra_id" IS NULL AND "proveedor_id" IS NULL)
);
ALTER TABLE "retencion" ADD CONSTRAINT "retencion_montos_validos" CHECK ("base_usd" > 0 AND "porcentaje" > 0 AND "porcentaje" <= 100 AND "monto_usd" > 0 AND "monto_usd" <= "base_usd" AND "tasa_usd" > 0 AND "monto_bs" > 0);
ALTER TABLE "retencion" ADD CONSTRAINT "retencion_anulacion_coherente" CHECK (("estado" = 'ANULADA') = ("anulada_en" IS NOT NULL));
-- A una factura solo se le puede aplicar una retención vigente de cada tipo.
CREATE UNIQUE INDEX "retencion_compra_tipo_vigente" ON "retencion" ("factura_compra_id", "tipo") WHERE "estado" = 'ACTIVA' AND "factura_compra_id" IS NOT NULL;
CREATE UNIQUE INDEX "retencion_venta_tipo_vigente" ON "retencion" ("factura_id", "tipo") WHERE "estado" = 'ACTIVA' AND "factura_id" IS NOT NULL;
-- Los comprobantes no se repiten: los nuestros son únicos; los de un cliente, únicos por cliente y tipo.
CREATE UNIQUE INDEX "retencion_comprobante_practicada" ON "retencion" ("tipo", "comprobante") WHERE "sentido" = 'PRACTICADA' AND "estado" = 'ACTIVA';
CREATE UNIQUE INDEX "retencion_comprobante_sufrida" ON "retencion" ("cliente_id", "tipo", "comprobante") WHERE "sentido" = 'SUFRIDA' AND "estado" = 'ACTIVA';
