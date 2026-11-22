-- Cobros con los datos del recibo de ingreso del sistema anterior: cobrador, varias formas de pago en un recibo, datos del cheque y comprobante.

CREATE TABLE "recibo_cobro" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "numero" SERIAL NOT NULL,
    "cliente_id" UUID NOT NULL,
    "fecha" DATE NOT NULL,
    "cobrador_id" UUID,
    "observaciones" TEXT,
    "creado_por_id" UUID,
    "creado_por_nombre" TEXT,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "recibo_cobro_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "recibo_cobro_numero_key" ON "recibo_cobro"("numero");
CREATE INDEX "recibo_cobro_cliente_id_fecha_idx" ON "recibo_cobro"("cliente_id", "fecha" DESC);
ALTER TABLE "recibo_cobro"
  ADD CONSTRAINT "recibo_cobro_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "recibo_cobro_cobrador_id_fkey" FOREIGN KEY ("cobrador_id") REFERENCES "vendedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "cobro"
  ADD COLUMN "recibo_id" UUID,
  ADD COLUMN "cobrador_id" UUID,
  ADD COLUMN "banco_cheque_id" UUID,
  ADD COLUMN "numero_cheque" TEXT,
  ADD COLUMN "fecha_cheque" DATE,
  ADD COLUMN "numero_comprobante" TEXT;
ALTER TABLE "cobro"
  ADD CONSTRAINT "cobro_recibo_id_fkey" FOREIGN KEY ("recibo_id") REFERENCES "recibo_cobro"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "cobro_cobrador_id_fkey" FOREIGN KEY ("cobrador_id") REFERENCES "vendedor"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "cobro_banco_cheque_id_fkey" FOREIGN KEY ("banco_cheque_id") REFERENCES "banco"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "cobro_recibo_id_idx" ON "cobro"("recibo_id");
