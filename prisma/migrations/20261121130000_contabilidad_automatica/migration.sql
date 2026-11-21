-- AlterTable
ALTER TABLE "cuenta_tesoreria" ADD COLUMN     "cuenta_contable_id" UUID;

-- AlterTable
ALTER TABLE "factura_compra" ADD COLUMN "tasa_usd" DECIMAL(18,8) NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "config_contable" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "automatica" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "config_contable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cuenta_concepto" (
    "concepto" TEXT NOT NULL,
    "cuenta_id" UUID NOT NULL,

    CONSTRAINT "cuenta_concepto_pkey" PRIMARY KEY ("concepto")
);

-- AddForeignKey
ALTER TABLE "cuenta_tesoreria" ADD CONSTRAINT "cuenta_tesoreria_cuenta_contable_id_fkey" FOREIGN KEY ("cuenta_contable_id") REFERENCES "cuenta_contable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuenta_concepto" ADD CONSTRAINT "cuenta_concepto_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "cuenta_contable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- Facturas de proveedor anteriores: se les asigna la última tasa del dólar cargada a su fecha (o la más reciente si no hay), y 1 si no hay ninguna.
UPDATE "factura_compra" fc SET "tasa_usd" = COALESCE(
  (SELECT t."valor" FROM "tasa_cambio" t JOIN "moneda" m ON m."id" = t."moneda_id" WHERE m."codigo" = 'USD' AND t."fecha" <= fc."fecha" ORDER BY t."fecha" DESC, t."creado_en" DESC LIMIT 1),
  (SELECT t."valor" FROM "tasa_cambio" t JOIN "moneda" m ON m."id" = t."moneda_id" WHERE m."codigo" = 'USD' ORDER BY t."fecha" DESC, t."creado_en" DESC LIMIT 1),
  1);
ALTER TABLE "factura_compra" ALTER COLUMN "tasa_usd" DROP DEFAULT;

-- Reglas que Prisma no expresa.
ALTER TABLE "factura_compra" ADD CONSTRAINT "factura_compra_tasa_valida" CHECK ("tasa_usd" > 0);
ALTER TABLE "config_contable" ADD CONSTRAINT "config_contable_una_fila" CHECK ("id" = 1);
INSERT INTO "config_contable" ("id", "automatica") VALUES (1, false);
-- Un documento no puede generar dos veces su asiento automático (los manuales no se restringen).
CREATE UNIQUE INDEX "asiento_origen_referencia_unico" ON "asiento" ("origen", "referencia") WHERE "origen" <> 'MANUAL';
