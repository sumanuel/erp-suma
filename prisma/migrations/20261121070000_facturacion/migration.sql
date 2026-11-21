-- CreateTable
CREATE TABLE "factura" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "numero" SERIAL NOT NULL,
    "numero_fiscal" TEXT,
    "cliente_id" UUID NOT NULL,
    "pedido_id" UUID,
    "almacen_id" UUID NOT NULL,
    "fecha" DATE NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'EMITIDA',
    "observaciones" TEXT,
    "subtotal" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "descuento" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "iva" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "tasa_usd" DECIMAL(18,8) NOT NULL,
    "total_bs" DECIMAL(18,2) NOT NULL,
    "creado_por_id" UUID,
    "creado_por_nombre" TEXT,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anulada_en" TIMESTAMPTZ(6),
    "anulada_por_nombre" TEXT,
    "motivo_anulacion" TEXT,

    CONSTRAINT "factura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "factura_linea" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "factura_id" UUID NOT NULL,
    "linea" INTEGER NOT NULL,
    "producto_codigo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "cantidad" DECIMAL(18,4) NOT NULL,
    "precio_unitario" DECIMAL(18,4) NOT NULL,
    "descuento" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "iva_porcentaje" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "costo_unitario" DECIMAL(18,4) NOT NULL DEFAULT 0,

    CONSTRAINT "factura_linea_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "factura_numero_key" ON "factura"("numero");

-- CreateIndex
CREATE INDEX "factura_cliente_id_idx" ON "factura"("cliente_id");

-- CreateIndex
CREATE INDEX "factura_pedido_id_idx" ON "factura"("pedido_id");

-- CreateIndex
CREATE INDEX "factura_estado_fecha_idx" ON "factura"("estado", "fecha" DESC);

-- CreateIndex
CREATE INDEX "factura_linea_producto_codigo_idx" ON "factura_linea"("producto_codigo");

-- CreateIndex
CREATE UNIQUE INDEX "factura_linea_factura_id_linea_key" ON "factura_linea"("factura_id", "linea");

-- AddForeignKey
ALTER TABLE "factura" ADD CONSTRAINT "factura_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factura" ADD CONSTRAINT "factura_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedido_venta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factura" ADD CONSTRAINT "factura_almacen_id_fkey" FOREIGN KEY ("almacen_id") REFERENCES "almacen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factura_linea" ADD CONSTRAINT "factura_linea_factura_id_fkey" FOREIGN KEY ("factura_id") REFERENCES "factura"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factura_linea" ADD CONSTRAINT "factura_linea_producto_codigo_fkey" FOREIGN KEY ("producto_codigo") REFERENCES "producto"("codigo") ON DELETE RESTRICT ON UPDATE CASCADE;



-- Reglas que Prisma no expresa.
ALTER TABLE "factura" ADD CONSTRAINT "factura_estado_valido" CHECK ("estado" IN ('EMITIDA','ANULADA'));
ALTER TABLE "factura" ADD CONSTRAINT "factura_tasa_valida" CHECK ("tasa_usd" > 0);
ALTER TABLE "factura" ADD CONSTRAINT "factura_anulacion_coherente" CHECK (("estado" = 'ANULADA') = ("anulada_en" IS NOT NULL));
ALTER TABLE "factura_linea" ADD CONSTRAINT "factura_linea_cantidad_positiva" CHECK ("cantidad" > 0);
ALTER TABLE "factura_linea" ADD CONSTRAINT "factura_linea_precio_no_negativo" CHECK ("precio_unitario" >= 0);
ALTER TABLE "factura_linea" ADD CONSTRAINT "factura_linea_descuento_valido" CHECK ("descuento" >= 0 AND "descuento" <= 100);
