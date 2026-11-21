-- CreateTable
CREATE TABLE "almacen" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "direccion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "almacen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "existencia" (
    "almacen_id" UUID NOT NULL,
    "producto_codigo" TEXT NOT NULL,
    "cantidad" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "existencia_pkey" PRIMARY KEY ("almacen_id","producto_codigo")
);

-- CreateTable
CREATE TABLE "movimiento_inventario" (
    "id" BIGSERIAL NOT NULL,
    "fecha" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tipo" TEXT NOT NULL,
    "almacen_id" UUID NOT NULL,
    "producto_codigo" TEXT NOT NULL,
    "cantidad" DECIMAL(18,4) NOT NULL,
    "costo_unitario" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "saldo_despues" DECIMAL(18,4) NOT NULL,
    "documento" TEXT,
    "motivo" TEXT,
    "grupo" UUID,
    "usuario_id" UUID,
    "usuario_nombre" TEXT,

    CONSTRAINT "movimiento_inventario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "almacen_codigo_key" ON "almacen"("codigo");

-- CreateIndex
CREATE INDEX "existencia_producto_codigo_idx" ON "existencia"("producto_codigo");

-- CreateIndex
CREATE INDEX "movimiento_inventario_producto_codigo_fecha_idx" ON "movimiento_inventario"("producto_codigo", "fecha" DESC);

-- CreateIndex
CREATE INDEX "movimiento_inventario_almacen_id_fecha_idx" ON "movimiento_inventario"("almacen_id", "fecha" DESC);

-- CreateIndex
CREATE INDEX "movimiento_inventario_fecha_idx" ON "movimiento_inventario"("fecha" DESC);

-- AddForeignKey
ALTER TABLE "existencia" ADD CONSTRAINT "existencia_almacen_id_fkey" FOREIGN KEY ("almacen_id") REFERENCES "almacen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "existencia" ADD CONSTRAINT "existencia_producto_codigo_fkey" FOREIGN KEY ("producto_codigo") REFERENCES "producto"("codigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_inventario" ADD CONSTRAINT "movimiento_inventario_almacen_id_fkey" FOREIGN KEY ("almacen_id") REFERENCES "almacen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_inventario" ADD CONSTRAINT "movimiento_inventario_producto_codigo_fkey" FOREIGN KEY ("producto_codigo") REFERENCES "producto"("codigo") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Reglas que Prisma no expresa: el saldo nunca es negativo y el kardex solo tiene tipos conocidos y cantidades distintas de cero.
ALTER TABLE "existencia" ADD CONSTRAINT "existencia_cantidad_no_negativa" CHECK ("cantidad" >= 0);
ALTER TABLE "movimiento_inventario" ADD CONSTRAINT "movimiento_inventario_tipo_valido"
  CHECK ("tipo" IN ('ENTRADA','SALIDA','AJUSTE_POSITIVO','AJUSTE_NEGATIVO','TRASLADO_ENTRADA','TRASLADO_SALIDA'));
ALTER TABLE "movimiento_inventario" ADD CONSTRAINT "movimiento_inventario_cantidad_distinta_de_cero" CHECK ("cantidad" <> 0);
ALTER TABLE "movimiento_inventario" ADD CONSTRAINT "movimiento_inventario_signo_coherente"
  CHECK (("tipo" IN ('ENTRADA','AJUSTE_POSITIVO','TRASLADO_ENTRADA') AND "cantidad" > 0) OR ("tipo" IN ('SALIDA','AJUSTE_NEGATIVO','TRASLADO_SALIDA') AND "cantidad" < 0));
