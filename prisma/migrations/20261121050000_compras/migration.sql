-- CreateTable
CREATE TABLE "orden_compra" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "numero" SERIAL NOT NULL,
    "proveedor_id" UUID NOT NULL,
    "fecha" DATE NOT NULL,
    "fecha_esperada" DATE,
    "estado" TEXT NOT NULL DEFAULT 'BORRADOR',
    "observaciones" TEXT,
    "subtotal" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "descuento" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "iva" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "creado_por_id" UUID,
    "creado_por_nombre" TEXT,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orden_compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orden_compra_linea" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "orden_id" UUID NOT NULL,
    "linea" INTEGER NOT NULL,
    "producto_codigo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "cantidad" DECIMAL(18,4) NOT NULL,
    "costo_unitario" DECIMAL(18,4) NOT NULL,
    "descuento" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "iva_porcentaje" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "cantidad_recibida" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,4) NOT NULL DEFAULT 0,

    CONSTRAINT "orden_compra_linea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recepcion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "numero" SERIAL NOT NULL,
    "orden_id" UUID NOT NULL,
    "almacen_id" UUID NOT NULL,
    "fecha" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "documento" TEXT,
    "observaciones" TEXT,
    "usuario_id" UUID,
    "usuario_nombre" TEXT,

    CONSTRAINT "recepcion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recepcion_linea" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "recepcion_id" UUID NOT NULL,
    "orden_linea_id" UUID NOT NULL,
    "producto_codigo" TEXT NOT NULL,
    "cantidad" DECIMAL(18,4) NOT NULL,
    "costo_unitario" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "recepcion_linea_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "orden_compra_numero_key" ON "orden_compra"("numero");

-- CreateIndex
CREATE INDEX "orden_compra_proveedor_id_idx" ON "orden_compra"("proveedor_id");

-- CreateIndex
CREATE INDEX "orden_compra_estado_fecha_idx" ON "orden_compra"("estado", "fecha" DESC);

-- CreateIndex
CREATE INDEX "orden_compra_linea_producto_codigo_idx" ON "orden_compra_linea"("producto_codigo");

-- CreateIndex
CREATE UNIQUE INDEX "orden_compra_linea_orden_id_linea_key" ON "orden_compra_linea"("orden_id", "linea");

-- CreateIndex
CREATE UNIQUE INDEX "recepcion_numero_key" ON "recepcion"("numero");

-- CreateIndex
CREATE INDEX "recepcion_orden_id_idx" ON "recepcion"("orden_id");

-- AddForeignKey
ALTER TABLE "orden_compra" ADD CONSTRAINT "orden_compra_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_compra_linea" ADD CONSTRAINT "orden_compra_linea_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "orden_compra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_compra_linea" ADD CONSTRAINT "orden_compra_linea_producto_codigo_fkey" FOREIGN KEY ("producto_codigo") REFERENCES "producto"("codigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recepcion" ADD CONSTRAINT "recepcion_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "orden_compra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recepcion" ADD CONSTRAINT "recepcion_almacen_id_fkey" FOREIGN KEY ("almacen_id") REFERENCES "almacen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recepcion_linea" ADD CONSTRAINT "recepcion_linea_recepcion_id_fkey" FOREIGN KEY ("recepcion_id") REFERENCES "recepcion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recepcion_linea" ADD CONSTRAINT "recepcion_linea_orden_linea_id_fkey" FOREIGN KEY ("orden_linea_id") REFERENCES "orden_compra_linea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Reglas que Prisma no expresa.
ALTER TABLE "orden_compra" ADD CONSTRAINT "orden_compra_estado_valido" CHECK ("estado" IN ('BORRADOR','EMITIDA','RECIBIDA_PARCIAL','RECIBIDA','ANULADA'));
ALTER TABLE "orden_compra_linea" ADD CONSTRAINT "orden_compra_linea_cantidad_positiva" CHECK ("cantidad" > 0);
ALTER TABLE "orden_compra_linea" ADD CONSTRAINT "orden_compra_linea_costo_no_negativo" CHECK ("costo_unitario" >= 0);
ALTER TABLE "orden_compra_linea" ADD CONSTRAINT "orden_compra_linea_descuento_valido" CHECK ("descuento" >= 0 AND "descuento" <= 100);
ALTER TABLE "orden_compra_linea" ADD CONSTRAINT "orden_compra_linea_recibida_valida" CHECK ("cantidad_recibida" >= 0 AND "cantidad_recibida" <= "cantidad");
ALTER TABLE "recepcion_linea" ADD CONSTRAINT "recepcion_linea_cantidad_positiva" CHECK ("cantidad" > 0);
