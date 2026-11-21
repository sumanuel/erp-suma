-- CreateTable
CREATE TABLE "pedido_venta" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "numero" SERIAL NOT NULL,
    "cliente_id" UUID NOT NULL,
    "fecha" DATE NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'BORRADOR',
    "observaciones" TEXT,
    "subtotal" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "descuento" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "iva" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "tasa_usd" DECIMAL(18,8),
    "creado_por_id" UUID,
    "creado_por_nombre" TEXT,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pedido_venta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedido_venta_linea" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pedido_id" UUID NOT NULL,
    "linea" INTEGER NOT NULL,
    "producto_codigo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "cantidad" DECIMAL(18,4) NOT NULL,
    "precio_unitario" DECIMAL(18,4) NOT NULL,
    "descuento" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "iva_porcentaje" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,4) NOT NULL DEFAULT 0,

    CONSTRAINT "pedido_venta_linea_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pedido_venta_numero_key" ON "pedido_venta"("numero");

-- CreateIndex
CREATE INDEX "pedido_venta_cliente_id_idx" ON "pedido_venta"("cliente_id");

-- CreateIndex
CREATE INDEX "pedido_venta_estado_fecha_idx" ON "pedido_venta"("estado", "fecha" DESC);

-- CreateIndex
CREATE INDEX "pedido_venta_linea_producto_codigo_idx" ON "pedido_venta_linea"("producto_codigo");

-- CreateIndex
CREATE UNIQUE INDEX "pedido_venta_linea_pedido_id_linea_key" ON "pedido_venta_linea"("pedido_id", "linea");

-- AddForeignKey
ALTER TABLE "pedido_venta" ADD CONSTRAINT "pedido_venta_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido_venta_linea" ADD CONSTRAINT "pedido_venta_linea_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedido_venta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido_venta_linea" ADD CONSTRAINT "pedido_venta_linea_producto_codigo_fkey" FOREIGN KEY ("producto_codigo") REFERENCES "producto"("codigo") ON DELETE RESTRICT ON UPDATE CASCADE;



-- Reglas que Prisma no expresa.
ALTER TABLE "pedido_venta" ADD CONSTRAINT "pedido_venta_estado_valido" CHECK ("estado" IN ('BORRADOR','CONFIRMADO','FACTURADO','ANULADO'));
ALTER TABLE "pedido_venta" ADD CONSTRAINT "pedido_venta_tasa_valida" CHECK ("tasa_usd" IS NULL OR "tasa_usd" > 0);
ALTER TABLE "pedido_venta_linea" ADD CONSTRAINT "pedido_venta_linea_cantidad_positiva" CHECK ("cantidad" > 0);
ALTER TABLE "pedido_venta_linea" ADD CONSTRAINT "pedido_venta_linea_precio_no_negativo" CHECK ("precio_unitario" >= 0);
ALTER TABLE "pedido_venta_linea" ADD CONSTRAINT "pedido_venta_linea_descuento_valido" CHECK ("descuento" >= 0 AND "descuento" <= 100);
