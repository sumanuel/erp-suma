-- AlterTable
ALTER TABLE "factura" ADD COLUMN     "dias_credito" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "fecha_vencimiento" DATE NOT NULL DEFAULT CURRENT_DATE,
ADD COLUMN     "saldo" DECIMAL(18,4) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "cobro" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "numero" SERIAL NOT NULL,
    "cliente_id" UUID NOT NULL,
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

    CONSTRAINT "cobro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cobro_aplicacion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cobro_id" UUID NOT NULL,
    "factura_id" UUID NOT NULL,
    "monto_usd" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "cobro_aplicacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cobro_numero_key" ON "cobro"("numero");

-- CreateIndex
CREATE INDEX "cobro_cliente_id_fecha_idx" ON "cobro"("cliente_id", "fecha" DESC);

-- CreateIndex
CREATE INDEX "cobro_estado_idx" ON "cobro"("estado");

-- CreateIndex
CREATE INDEX "cobro_aplicacion_factura_id_idx" ON "cobro_aplicacion"("factura_id");

-- CreateIndex
CREATE UNIQUE INDEX "cobro_aplicacion_cobro_id_factura_id_key" ON "cobro_aplicacion"("cobro_id", "factura_id");

-- AddForeignKey
ALTER TABLE "cobro" ADD CONSTRAINT "cobro_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cobro_aplicacion" ADD CONSTRAINT "cobro_aplicacion_cobro_id_fkey" FOREIGN KEY ("cobro_id") REFERENCES "cobro"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cobro_aplicacion" ADD CONSTRAINT "cobro_aplicacion_factura_id_fkey" FOREIGN KEY ("factura_id") REFERENCES "factura"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- Facturas que ya existían: contado (vence el mismo día) y con todo el total por cobrar si están emitidas.
UPDATE "factura" SET "fecha_vencimiento" = "fecha", "saldo" = CASE WHEN "estado" = 'EMITIDA' THEN "total" ELSE 0 END;
ALTER TABLE "factura" ALTER COLUMN "fecha_vencimiento" DROP DEFAULT;

-- Reglas que Prisma no expresa.
ALTER TABLE "factura" ADD CONSTRAINT "factura_saldo_valido" CHECK ("saldo" >= 0 AND "saldo" <= "total");
ALTER TABLE "factura" ADD CONSTRAINT "factura_credito_valido" CHECK ("dias_credito" >= 0 AND "dias_credito" <= 365);
ALTER TABLE "cobro" ADD CONSTRAINT "cobro_estado_valido" CHECK ("estado" IN ('REGISTRADO','ANULADO'));
ALTER TABLE "cobro" ADD CONSTRAINT "cobro_moneda_valida" CHECK ("moneda" IN ('USD','VES'));
ALTER TABLE "cobro" ADD CONSTRAINT "cobro_montos_validos" CHECK ("monto_usd" > 0 AND "monto_moneda" > 0 AND (("moneda" = 'VES') = ("tasa_usd" IS NOT NULL)));
ALTER TABLE "cobro" ADD CONSTRAINT "cobro_anulacion_coherente" CHECK (("estado" = 'ANULADO') = ("anulado_en" IS NOT NULL));
ALTER TABLE "cobro_aplicacion" ADD CONSTRAINT "cobro_aplicacion_monto_positivo" CHECK ("monto_usd" > 0);
