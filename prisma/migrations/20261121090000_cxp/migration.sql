-- CreateTable
CREATE TABLE "factura_compra" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "numero" SERIAL NOT NULL,
    "proveedor_id" UUID NOT NULL,
    "orden_id" UUID,
    "documento" TEXT NOT NULL,
    "numero_control" TEXT,
    "fecha" DATE NOT NULL,
    "dias_credito" INTEGER NOT NULL DEFAULT 0,
    "fecha_vencimiento" DATE NOT NULL,
    "subtotal" DECIMAL(18,4) NOT NULL,
    "iva" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,4) NOT NULL,
    "saldo" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "estado" TEXT NOT NULL DEFAULT 'REGISTRADA',
    "observaciones" TEXT,
    "creado_por_id" UUID,
    "creado_por_nombre" TEXT,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anulada_en" TIMESTAMPTZ(6),
    "anulada_por_nombre" TEXT,
    "motivo_anulacion" TEXT,

    CONSTRAINT "factura_compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pago_proveedor" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "numero" SERIAL NOT NULL,
    "proveedor_id" UUID NOT NULL,
    "fecha" DATE NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'REGISTRADO',
    "forma_pago" TEXT NOT NULL,
    "moneda" TEXT NOT NULL,
    "monto_moneda" DECIMAL(18,2) NOT NULL,
    "tasa_usd" DECIMAL(18,8),
    "monto_usd" DECIMAL(18,4) NOT NULL,
    "referencia" TEXT,
    "observaciones" TEXT,
    "creado_por_id" UUID,
    "creado_por_nombre" TEXT,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anulado_en" TIMESTAMPTZ(6),
    "anulado_por_nombre" TEXT,
    "motivo_anulacion" TEXT,

    CONSTRAINT "pago_proveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pago_aplicacion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pago_id" UUID NOT NULL,
    "factura_id" UUID NOT NULL,
    "monto_usd" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "pago_aplicacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "factura_compra_numero_key" ON "factura_compra"("numero");

-- CreateIndex
CREATE INDEX "factura_compra_orden_id_idx" ON "factura_compra"("orden_id");

-- CreateIndex
CREATE INDEX "factura_compra_estado_fecha_vencimiento_idx" ON "factura_compra"("estado", "fecha_vencimiento");

-- CreateIndex
CREATE UNIQUE INDEX "factura_compra_proveedor_id_documento_key" ON "factura_compra"("proveedor_id", "documento");

-- CreateIndex
CREATE UNIQUE INDEX "pago_proveedor_numero_key" ON "pago_proveedor"("numero");

-- CreateIndex
CREATE INDEX "pago_proveedor_proveedor_id_fecha_idx" ON "pago_proveedor"("proveedor_id", "fecha" DESC);

-- CreateIndex
CREATE INDEX "pago_proveedor_estado_idx" ON "pago_proveedor"("estado");

-- CreateIndex
CREATE INDEX "pago_aplicacion_factura_id_idx" ON "pago_aplicacion"("factura_id");

-- CreateIndex
CREATE UNIQUE INDEX "pago_aplicacion_pago_id_factura_id_key" ON "pago_aplicacion"("pago_id", "factura_id");

-- AddForeignKey
ALTER TABLE "factura_compra" ADD CONSTRAINT "factura_compra_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factura_compra" ADD CONSTRAINT "factura_compra_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "orden_compra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pago_proveedor" ADD CONSTRAINT "pago_proveedor_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pago_aplicacion" ADD CONSTRAINT "pago_aplicacion_pago_id_fkey" FOREIGN KEY ("pago_id") REFERENCES "pago_proveedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pago_aplicacion" ADD CONSTRAINT "pago_aplicacion_factura_id_fkey" FOREIGN KEY ("factura_id") REFERENCES "factura_compra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- Reglas que Prisma no expresa.
ALTER TABLE "factura_compra" ADD CONSTRAINT "factura_compra_estado_valido" CHECK ("estado" IN ('REGISTRADA','ANULADA'));
ALTER TABLE "factura_compra" ADD CONSTRAINT "factura_compra_montos_validos" CHECK ("subtotal" > 0 AND "iva" >= 0 AND "total" = "subtotal" + "iva");
ALTER TABLE "factura_compra" ADD CONSTRAINT "factura_compra_saldo_valido" CHECK ("saldo" >= 0 AND "saldo" <= "total");
ALTER TABLE "factura_compra" ADD CONSTRAINT "factura_compra_credito_valido" CHECK ("dias_credito" >= 0 AND "dias_credito" <= 365);
ALTER TABLE "factura_compra" ADD CONSTRAINT "factura_compra_anulacion_coherente" CHECK (("estado" = 'ANULADA') = ("anulada_en" IS NOT NULL));
ALTER TABLE "pago_proveedor" ADD CONSTRAINT "pago_proveedor_estado_valido" CHECK ("estado" IN ('REGISTRADO','ANULADO'));
ALTER TABLE "pago_proveedor" ADD CONSTRAINT "pago_proveedor_moneda_valida" CHECK ("moneda" IN ('USD','VES'));
ALTER TABLE "pago_proveedor" ADD CONSTRAINT "pago_proveedor_montos_validos" CHECK ("monto_usd" > 0 AND "monto_moneda" > 0 AND (("moneda" = 'VES') = ("tasa_usd" IS NOT NULL)));
ALTER TABLE "pago_proveedor" ADD CONSTRAINT "pago_proveedor_anulacion_coherente" CHECK (("estado" = 'ANULADO') = ("anulado_en" IS NOT NULL));
ALTER TABLE "pago_aplicacion" ADD CONSTRAINT "pago_aplicacion_monto_positivo" CHECK ("monto_usd" > 0);
