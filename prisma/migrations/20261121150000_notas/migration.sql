-- AlterTable
ALTER TABLE "factura" ADD COLUMN     "ajuste" DECIMAL(18,4) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "factura_compra" ADD COLUMN     "ajuste" DECIMAL(18,4) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "nota_venta" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "numero" SERIAL NOT NULL,
    "tipo" TEXT NOT NULL,
    "modo" TEXT NOT NULL,
    "factura_id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "almacen_id" UUID,
    "fecha" DATE NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'ACTIVA',
    "motivo" TEXT NOT NULL,
    "subtotal" DECIMAL(18,4) NOT NULL,
    "iva" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,4) NOT NULL,
    "iva_porcentaje" DECIMAL(7,4),
    "tasa_usd" DECIMAL(18,8) NOT NULL,
    "numero_fiscal" TEXT,
    "numero_control" TEXT,
    "creado_por_id" UUID,
    "creado_por_nombre" TEXT,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anulada_en" TIMESTAMPTZ(6),
    "anulada_por_nombre" TEXT,
    "motivo_anulacion" TEXT,

    CONSTRAINT "nota_venta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nota_venta_linea" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nota_id" UUID NOT NULL,
    "linea" INTEGER NOT NULL,
    "factura_linea_id" UUID NOT NULL,
    "producto_codigo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "cantidad" DECIMAL(18,4) NOT NULL,
    "precio_unitario" DECIMAL(18,4) NOT NULL,
    "descuento" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "iva_porcentaje" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "costo_unitario" DECIMAL(18,4) NOT NULL DEFAULT 0,

    CONSTRAINT "nota_venta_linea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nota_compra" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "numero" SERIAL NOT NULL,
    "tipo" TEXT NOT NULL,
    "factura_id" UUID NOT NULL,
    "proveedor_id" UUID NOT NULL,
    "documento" TEXT NOT NULL,
    "numero_control" TEXT,
    "fecha" DATE NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'ACTIVA',
    "motivo" TEXT NOT NULL,
    "subtotal" DECIMAL(18,4) NOT NULL,
    "iva" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,4) NOT NULL,
    "tasa_usd" DECIMAL(18,8) NOT NULL,
    "creado_por_id" UUID,
    "creado_por_nombre" TEXT,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anulada_en" TIMESTAMPTZ(6),
    "anulada_por_nombre" TEXT,
    "motivo_anulacion" TEXT,

    CONSTRAINT "nota_compra_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "nota_venta_numero_key" ON "nota_venta"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "nota_venta_numero_fiscal_key" ON "nota_venta"("numero_fiscal");

-- CreateIndex
CREATE UNIQUE INDEX "nota_venta_numero_control_key" ON "nota_venta"("numero_control");

-- CreateIndex
CREATE INDEX "nota_venta_factura_id_idx" ON "nota_venta"("factura_id");

-- CreateIndex
CREATE INDEX "nota_venta_cliente_id_idx" ON "nota_venta"("cliente_id");

-- CreateIndex
CREATE INDEX "nota_venta_estado_fecha_idx" ON "nota_venta"("estado", "fecha" DESC);

-- CreateIndex
CREATE INDEX "nota_venta_linea_factura_linea_id_idx" ON "nota_venta_linea"("factura_linea_id");

-- CreateIndex
CREATE UNIQUE INDEX "nota_venta_linea_nota_id_linea_key" ON "nota_venta_linea"("nota_id", "linea");

-- CreateIndex
CREATE UNIQUE INDEX "nota_compra_numero_key" ON "nota_compra"("numero");

-- CreateIndex
CREATE INDEX "nota_compra_factura_id_idx" ON "nota_compra"("factura_id");

-- CreateIndex
CREATE UNIQUE INDEX "nota_compra_proveedor_id_documento_key" ON "nota_compra"("proveedor_id", "documento");

-- AddForeignKey
ALTER TABLE "nota_venta" ADD CONSTRAINT "nota_venta_factura_id_fkey" FOREIGN KEY ("factura_id") REFERENCES "factura"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nota_venta" ADD CONSTRAINT "nota_venta_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nota_venta" ADD CONSTRAINT "nota_venta_almacen_id_fkey" FOREIGN KEY ("almacen_id") REFERENCES "almacen"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nota_venta_linea" ADD CONSTRAINT "nota_venta_linea_nota_id_fkey" FOREIGN KEY ("nota_id") REFERENCES "nota_venta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nota_venta_linea" ADD CONSTRAINT "nota_venta_linea_factura_linea_id_fkey" FOREIGN KEY ("factura_linea_id") REFERENCES "factura_linea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nota_compra" ADD CONSTRAINT "nota_compra_factura_id_fkey" FOREIGN KEY ("factura_id") REFERENCES "factura_compra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nota_compra" ADD CONSTRAINT "nota_compra_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- El saldo ahora puede llegar hasta total + ajuste (las notas de débito suben lo que se debe; las de crédito lo bajan).
ALTER TABLE "factura" DROP CONSTRAINT "factura_saldo_valido";
ALTER TABLE "factura" ADD CONSTRAINT "factura_saldo_valido" CHECK ("saldo" >= 0 AND "saldo" <= "total" + "ajuste");
ALTER TABLE "factura" ADD CONSTRAINT "factura_ajuste_valido" CHECK ("total" + "ajuste" >= 0);
ALTER TABLE "factura_compra" DROP CONSTRAINT "factura_compra_saldo_valido";
ALTER TABLE "factura_compra" ADD CONSTRAINT "factura_compra_saldo_valido" CHECK ("saldo" >= 0 AND "saldo" <= "total" + "ajuste");
ALTER TABLE "factura_compra" ADD CONSTRAINT "factura_compra_ajuste_valido" CHECK ("total" + "ajuste" >= 0);

-- Reglas que Prisma no expresa.
ALTER TABLE "nota_venta" ADD CONSTRAINT "nota_venta_tipo_modo_valido" CHECK (("tipo" = 'CREDITO' AND "modo" IN ('DEVOLUCION','AJUSTE')) OR ("tipo" = 'DEBITO' AND "modo" = 'CARGO'));
ALTER TABLE "nota_venta" ADD CONSTRAINT "nota_venta_estado_valido" CHECK ("estado" IN ('ACTIVA','ANULADA'));
ALTER TABLE "nota_venta" ADD CONSTRAINT "nota_venta_montos_validos" CHECK ("subtotal" > 0 AND "iva" >= 0 AND "total" = "subtotal" + "iva" AND "tasa_usd" > 0);
ALTER TABLE "nota_venta" ADD CONSTRAINT "nota_venta_devolucion_con_almacen" CHECK (("modo" = 'DEVOLUCION') = ("almacen_id" IS NOT NULL));
ALTER TABLE "nota_venta" ADD CONSTRAINT "nota_venta_anulacion_coherente" CHECK (("estado" = 'ANULADA') = ("anulada_en" IS NOT NULL));
ALTER TABLE "nota_venta_linea" ADD CONSTRAINT "nota_venta_linea_cantidad_positiva" CHECK ("cantidad" > 0);
ALTER TABLE "nota_compra" ADD CONSTRAINT "nota_compra_tipo_valido" CHECK ("tipo" IN ('CREDITO','DEBITO'));
ALTER TABLE "nota_compra" ADD CONSTRAINT "nota_compra_estado_valido" CHECK ("estado" IN ('ACTIVA','ANULADA'));
ALTER TABLE "nota_compra" ADD CONSTRAINT "nota_compra_montos_validos" CHECK ("subtotal" > 0 AND "iva" >= 0 AND "total" = "subtotal" + "iva" AND "tasa_usd" > 0);
ALTER TABLE "nota_compra" ADD CONSTRAINT "nota_compra_anulacion_coherente" CHECK (("estado" = 'ANULADA') = ("anulada_en" IS NOT NULL));
