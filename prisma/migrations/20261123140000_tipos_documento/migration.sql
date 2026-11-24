-- Numeración por tipo de documento: contador interno y numeración fiscal automática opcional.
CREATE TABLE "tipo_documento" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "ultimo_numero" INTEGER NOT NULL DEFAULT 0,
    "serie_fiscal_id" UUID,
    "fiscal_automatico" BOOLEAN NOT NULL DEFAULT false,
    "ultimo_fiscal" INTEGER NOT NULL DEFAULT 0,
    "ultimo_control" INTEGER NOT NULL DEFAULT 0,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tipo_documento_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tipo_documento_ultimo_numero_check" CHECK ("ultimo_numero" >= 0 AND "ultimo_fiscal" >= 0 AND "ultimo_control" >= 0)
);
CREATE UNIQUE INDEX "tipo_documento_codigo_key" ON "tipo_documento"("codigo");
ALTER TABLE "tipo_documento" ADD CONSTRAINT "tipo_documento_serie_fiscal_id_fkey" FOREIGN KEY ("serie_fiscal_id") REFERENCES "serie_fiscal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Los contadores arrancan en el número más alto que ya exista de cada documento.
INSERT INTO "tipo_documento" ("codigo", "nombre", "ultimo_numero") VALUES
  ('FACTURA', 'Factura de venta', COALESCE((SELECT MAX("numero") FROM "factura"), 0)),
  ('NOTA_VENTA', 'Notas de crédito y de débito de venta', COALESCE((SELECT MAX("numero") FROM "nota_venta"), 0)),
  ('PEDIDO', 'Pedido de venta', COALESCE((SELECT MAX("numero") FROM "pedido_venta"), 0)),
  ('COTIZACION', 'Cotización', COALESCE((SELECT MAX("numero") FROM "cotizacion"), 0)),
  ('ORDEN_COMPRA', 'Orden de compra', COALESCE((SELECT MAX("numero") FROM "orden_compra"), 0));
