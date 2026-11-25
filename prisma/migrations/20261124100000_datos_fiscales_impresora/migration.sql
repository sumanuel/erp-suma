-- Datos fiscales por documento, como en el original (admdoccli: dcli_impresora = serial, dcli_modfis = modelo).
ALTER TABLE "factura" ADD COLUMN "impresora_serial" TEXT, ADD COLUMN "impresora_modelo" TEXT;
ALTER TABLE "nota_venta" ADD COLUMN "impresora_serial" TEXT, ADD COLUMN "impresora_modelo" TEXT;

-- Cada impresora fiscal lleva su propio contador, y la de crédito y la de débito son series distintas: el número fiscal no es único en toda
-- la empresa sino por impresora (y, en las notas, por tipo). Los documentos sin serial se comparan entre sí.
DROP INDEX "factura_numero_fiscal_key";
CREATE UNIQUE INDEX "factura_impresora_numero_fiscal_key" ON "factura" ((COALESCE("impresora_serial", '')), "numero_fiscal") WHERE "numero_fiscal" IS NOT NULL;
DROP INDEX "nota_venta_numero_fiscal_key";
CREATE UNIQUE INDEX "nota_venta_tipo_impresora_numero_fiscal_key" ON "nota_venta" ("tipo", (COALESCE("impresora_serial", '')), "numero_fiscal") WHERE "numero_fiscal" IS NOT NULL;
