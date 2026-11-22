-- Órdenes de compra y documentos del proveedor con los campos del sistema anterior (ver ANALISIS-CAMPOS.md, 4.2 y 4.3) y catálogo de centros de costo.

CREATE TABLE "centro_costo" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "centro_costo_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "centro_costo_codigo_key" ON "centro_costo"("codigo");

ALTER TABLE "orden_compra"
  ADD COLUMN "condicion_pago_id" UUID,
  ADD COLUMN "transporte_id" UUID,
  ADD COLUMN "centro_costo_id" UUID,
  ADD COLUMN "referencia" TEXT,
  ADD COLUMN "moneda" TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN "valor_cambio" DECIMAL(18,8),
  ADD COLUMN "descuento_global_1" DECIMAL(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN "descuento_global_2" DECIMAL(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN "descuento_global_3" DECIMAL(7,4) NOT NULL DEFAULT 0;
ALTER TABLE "orden_compra"
  ADD CONSTRAINT "orden_compra_condicion_pago_id_fkey" FOREIGN KEY ("condicion_pago_id") REFERENCES "condicion_pago"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "orden_compra_transporte_id_fkey" FOREIGN KEY ("transporte_id") REFERENCES "transporte"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "orden_compra_centro_costo_id_fkey" FOREIGN KEY ("centro_costo_id") REFERENCES "centro_costo"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "orden_compra_moneda_valida" CHECK ("moneda" IN ('USD','VES') AND (("moneda" = 'VES') = ("valor_cambio" IS NOT NULL)) AND ("valor_cambio" IS NULL OR "valor_cambio" > 0)),
  ADD CONSTRAINT "orden_compra_descuentos_globales_validos" CHECK ("descuento_global_1" BETWEEN 0 AND 100 AND "descuento_global_2" BETWEEN 0 AND 100 AND "descuento_global_3" BETWEEN 0 AND 100);

ALTER TABLE "orden_compra_linea"
  ADD COLUMN "costo_moneda" DECIMAL(18,4),
  ADD COLUMN "descuento_1" DECIMAL(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN "descuento_2" DECIMAL(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN "descuento_3" DECIMAL(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN "arancel_id" UUID,
  ADD COLUMN "arancel_pct" DECIMAL(7,4) NOT NULL DEFAULT 0;
-- Las líneas anteriores tenían un solo descuento: pasa a ser el descuento 1 (el efectivo ya era ese).
UPDATE "orden_compra_linea" SET "descuento_1" = "descuento";
ALTER TABLE "orden_compra_linea"
  ADD CONSTRAINT "orden_compra_linea_arancel_id_fkey" FOREIGN KEY ("arancel_id") REFERENCES "arancel"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "orden_compra_linea_descuentos_validos" CHECK ("descuento_1" BETWEEN 0 AND 100 AND "descuento_2" BETWEEN 0 AND 100 AND "descuento_3" BETWEEN 0 AND 100 AND "arancel_pct" BETWEEN 0 AND 100);

ALTER TABLE "factura_compra"
  ADD COLUMN "fecha_recepcion" DATE,
  ADD COLUMN "fecha_libro" DATE,
  ADD COLUMN "recibido_por" TEXT,
  ADD COLUMN "planilla_importacion" TEXT,
  ADD COLUMN "condicion_pago_id" UUID,
  ADD COLUMN "transporte_id" UUID,
  ADD COLUMN "centro_costo_id" UUID,
  ADD COLUMN "cuenta_gasto_id" UUID;
ALTER TABLE "factura_compra"
  ADD CONSTRAINT "factura_compra_condicion_pago_id_fkey" FOREIGN KEY ("condicion_pago_id") REFERENCES "condicion_pago"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "factura_compra_transporte_id_fkey" FOREIGN KEY ("transporte_id") REFERENCES "transporte"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "factura_compra_centro_costo_id_fkey" FOREIGN KEY ("centro_costo_id") REFERENCES "centro_costo"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "factura_compra_cuenta_gasto_id_fkey" FOREIGN KEY ("cuenta_gasto_id") REFERENCES "cuenta_contable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "factura_compra_linea" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "factura_id" UUID NOT NULL,
    "porcentaje" DECIMAL(7,4) NOT NULL,
    "base" DECIMAL(18,4) NOT NULL,
    "iva" DECIMAL(18,4) NOT NULL DEFAULT 0,
    CONSTRAINT "factura_compra_linea_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "factura_compra_linea_factura_id_idx" ON "factura_compra_linea"("factura_id");
ALTER TABLE "factura_compra_linea"
  ADD CONSTRAINT "factura_compra_linea_factura_id_fkey" FOREIGN KEY ("factura_id") REFERENCES "factura_compra"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "factura_compra_linea_valida" CHECK ("porcentaje" BETWEEN 0 AND 100 AND "base" >= 0 AND "iva" >= 0);
