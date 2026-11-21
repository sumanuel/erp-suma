-- AlterTable
ALTER TABLE "factura" ADD COLUMN     "numero_control" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "factura_numero_fiscal_key" ON "factura"("numero_fiscal");

-- CreateIndex
CREATE UNIQUE INDEX "factura_numero_control_key" ON "factura"("numero_control");

