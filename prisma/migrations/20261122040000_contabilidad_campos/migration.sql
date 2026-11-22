-- Contabilidad con los campos del sistema anterior: siglas y banderas de impresión de la cuenta, auxiliares contables y referencia/documento por línea de asiento.

ALTER TABLE "cuenta_contable"
  ADD COLUMN "siglas" TEXT,
  ADD COLUMN "imprime_balance" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "imprime_diario" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "auxiliar_contable" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cuenta_id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "maneja_documentos" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "auxiliar_contable_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "auxiliar_contable_cuenta_id_codigo_key" ON "auxiliar_contable"("cuenta_id", "codigo");
ALTER TABLE "auxiliar_contable" ADD CONSTRAINT "auxiliar_contable_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "cuenta_contable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "asiento_linea"
  ADD COLUMN "auxiliar_id" UUID,
  ADD COLUMN "referencia" TEXT,
  ADD COLUMN "documento" TEXT;
ALTER TABLE "asiento_linea" ADD CONSTRAINT "asiento_linea_auxiliar_id_fkey" FOREIGN KEY ("auxiliar_id") REFERENCES "auxiliar_contable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "asiento_linea_auxiliar_id_idx" ON "asiento_linea"("auxiliar_id");
