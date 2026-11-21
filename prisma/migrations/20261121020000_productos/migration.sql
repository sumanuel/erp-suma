-- CreateTable
CREATE TABLE "categoria" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "comision_venta" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "comision_cobro" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subcategoria" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "categoria_id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "comision_venta" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "comision_cobro" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subcategoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alicuota_iva" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nombre" TEXT NOT NULL,
    "porcentaje_venta" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "porcentaje_compra" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "porcentaje_zona_libre" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alicuota_iva_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arancel" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "codigo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "porcentaje" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "impuesto" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "kilos" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "arancel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unidad_medida" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unidad_medida_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "producto" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "codigo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "categoria_id" UUID NOT NULL,
    "subcategoria_id" UUID,
    "alicuota_iva_id" UUID NOT NULL,
    "arancel_id" UUID,
    "codigo_fabricante" TEXT,
    "codigo_barras" TEXT,
    "procedencia" TEXT,
    "garantia" TEXT,
    "peso" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "volumen" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "alto" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "ancho" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "existencia_minima" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "existencia_maxima" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "comision_venta" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "comision_compra" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "ultimo_costo" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "costo_promedio" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "precio_lista" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "precio_maximo_publico" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "observaciones" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "producto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "producto_presentacion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "producto_codigo" TEXT NOT NULL,
    "unidad_medida_id" UUID NOT NULL,
    "nombre" TEXT,
    "cantidad" DECIMAL(18,4) NOT NULL DEFAULT 1,
    "peso" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "volumen" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "precio_compra" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "precio_venta" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "producto_presentacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "producto_proveedor" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "producto_codigo" TEXT NOT NULL,
    "proveedor_id" UUID NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'USD',
    "pais" TEXT,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "producto_proveedor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categoria_codigo_key" ON "categoria"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "subcategoria_categoria_id_codigo_key" ON "subcategoria"("categoria_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "alicuota_iva_nombre_key" ON "alicuota_iva"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "arancel_codigo_key" ON "arancel"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "unidad_medida_codigo_key" ON "unidad_medida"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "producto_codigo_key" ON "producto"("codigo");

-- CreateIndex
CREATE INDEX "producto_descripcion_idx" ON "producto"("descripcion");

-- CreateIndex
CREATE INDEX "producto_categoria_id_idx" ON "producto"("categoria_id");

-- CreateIndex
CREATE INDEX "producto_codigo_barras_idx" ON "producto"("codigo_barras");

-- CreateIndex
CREATE UNIQUE INDEX "producto_presentacion_producto_codigo_unidad_medida_id_key" ON "producto_presentacion"("producto_codigo", "unidad_medida_id");

-- CreateIndex
CREATE UNIQUE INDEX "producto_proveedor_producto_codigo_proveedor_id_key" ON "producto_proveedor"("producto_codigo", "proveedor_id");

-- AddForeignKey
ALTER TABLE "subcategoria" ADD CONSTRAINT "subcategoria_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producto" ADD CONSTRAINT "producto_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producto" ADD CONSTRAINT "producto_subcategoria_id_fkey" FOREIGN KEY ("subcategoria_id") REFERENCES "subcategoria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producto" ADD CONSTRAINT "producto_alicuota_iva_id_fkey" FOREIGN KEY ("alicuota_iva_id") REFERENCES "alicuota_iva"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producto" ADD CONSTRAINT "producto_arancel_id_fkey" FOREIGN KEY ("arancel_id") REFERENCES "arancel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producto_presentacion" ADD CONSTRAINT "producto_presentacion_producto_codigo_fkey" FOREIGN KEY ("producto_codigo") REFERENCES "producto"("codigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producto_presentacion" ADD CONSTRAINT "producto_presentacion_unidad_medida_id_fkey" FOREIGN KEY ("unidad_medida_id") REFERENCES "unidad_medida"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producto_proveedor" ADD CONSTRAINT "producto_proveedor_producto_codigo_fkey" FOREIGN KEY ("producto_codigo") REFERENCES "producto"("codigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producto_proveedor" ADD CONSTRAINT "producto_proveedor_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

