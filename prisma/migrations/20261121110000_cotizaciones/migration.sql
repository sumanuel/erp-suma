-- AlterTable
ALTER TABLE "pedido_venta" ADD COLUMN     "cotizacion_id" UUID;

-- CreateTable
CREATE TABLE "cotizacion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "numero" SERIAL NOT NULL,
    "cliente_id" UUID NOT NULL,
    "fecha" DATE NOT NULL,
    "validez_dias" INTEGER NOT NULL DEFAULT 15,
    "fecha_vencimiento" DATE NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'BORRADOR',
    "observaciones" TEXT,
    "subtotal" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "descuento" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "iva" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "tasa_usd" DECIMAL(18,8),
    "motivo_cierre" TEXT,
    "creado_por_id" UUID,
    "creado_por_nombre" TEXT,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cotizacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cotizacion_linea" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cotizacion_id" UUID NOT NULL,
    "linea" INTEGER NOT NULL,
    "producto_codigo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "cantidad" DECIMAL(18,4) NOT NULL,
    "precio_unitario" DECIMAL(18,4) NOT NULL,
    "descuento" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "iva_porcentaje" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,4) NOT NULL DEFAULT 0,

    CONSTRAINT "cotizacion_linea_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cotizacion_numero_key" ON "cotizacion"("numero");

-- CreateIndex
CREATE INDEX "cotizacion_cliente_id_idx" ON "cotizacion"("cliente_id");

-- CreateIndex
CREATE INDEX "cotizacion_estado_fecha_idx" ON "cotizacion"("estado", "fecha" DESC);

-- CreateIndex
CREATE INDEX "cotizacion_linea_producto_codigo_idx" ON "cotizacion_linea"("producto_codigo");

-- CreateIndex
CREATE UNIQUE INDEX "cotizacion_linea_cotizacion_id_linea_key" ON "cotizacion_linea"("cotizacion_id", "linea");

-- AddForeignKey
ALTER TABLE "cotizacion" ADD CONSTRAINT "cotizacion_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizacion_linea" ADD CONSTRAINT "cotizacion_linea_cotizacion_id_fkey" FOREIGN KEY ("cotizacion_id") REFERENCES "cotizacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizacion_linea" ADD CONSTRAINT "cotizacion_linea_producto_codigo_fkey" FOREIGN KEY ("producto_codigo") REFERENCES "producto"("codigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido_venta" ADD CONSTRAINT "pedido_venta_cotizacion_id_fkey" FOREIGN KEY ("cotizacion_id") REFERENCES "cotizacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- Reglas que Prisma no expresa.
ALTER TABLE "cotizacion" ADD CONSTRAINT "cotizacion_estado_valido" CHECK ("estado" IN ('BORRADOR','EMITIDA','ACEPTADA','RECHAZADA','ANULADA'));
ALTER TABLE "cotizacion" ADD CONSTRAINT "cotizacion_validez_valida" CHECK ("validez_dias" >= 1 AND "validez_dias" <= 365);
ALTER TABLE "cotizacion" ADD CONSTRAINT "cotizacion_tasa_valida" CHECK ("tasa_usd" IS NULL OR "tasa_usd" > 0);
ALTER TABLE "cotizacion_linea" ADD CONSTRAINT "cotizacion_linea_cantidad_positiva" CHECK ("cantidad" > 0);
ALTER TABLE "cotizacion_linea" ADD CONSTRAINT "cotizacion_linea_precio_no_negativo" CHECK ("precio_unitario" >= 0);
ALTER TABLE "cotizacion_linea" ADD CONSTRAINT "cotizacion_linea_descuento_valido" CHECK ("descuento" >= 0 AND "descuento" <= 100);
