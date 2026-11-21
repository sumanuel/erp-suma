-- AlterTable
ALTER TABLE "retencion" ADD COLUMN     "entero_id" UUID;

-- CreateTable
CREATE TABLE "entero_retencion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "numero" SERIAL NOT NULL,
    "tipo" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "cuenta_id" UUID NOT NULL,
    "monto_bs" DECIMAL(18,2) NOT NULL,
    "referencia" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'ACTIVO',
    "creado_por_id" UUID,
    "creado_por_nombre" TEXT,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anulado_en" TIMESTAMPTZ(6),
    "anulado_por_nombre" TEXT,
    "motivo_anulacion" TEXT,

    CONSTRAINT "entero_retencion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "empresa" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "rif" TEXT,
    "razon_social" TEXT,
    "nombre_comercial" TEXT,
    "direccion" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "agente_retencion" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "empresa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "entero_retencion_numero_key" ON "entero_retencion"("numero");

-- CreateIndex
CREATE INDEX "entero_retencion_estado_fecha_idx" ON "entero_retencion"("estado", "fecha" DESC);

-- CreateIndex
CREATE INDEX "retencion_entero_id_idx" ON "retencion"("entero_id");

-- AddForeignKey
ALTER TABLE "retencion" ADD CONSTRAINT "retencion_entero_id_fkey" FOREIGN KEY ("entero_id") REFERENCES "entero_retencion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entero_retencion" ADD CONSTRAINT "entero_retencion_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "cuenta_tesoreria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- Reglas que Prisma no expresa.
INSERT INTO "empresa" ("id") VALUES (1);
ALTER TABLE "empresa" ADD CONSTRAINT "empresa_una_fila" CHECK ("id" = 1);
ALTER TABLE "entero_retencion" ADD CONSTRAINT "entero_retencion_tipo_valido" CHECK ("tipo" IN ('IVA','ISLR'));
ALTER TABLE "entero_retencion" ADD CONSTRAINT "entero_retencion_estado_valido" CHECK ("estado" IN ('ACTIVO','ANULADO'));
ALTER TABLE "entero_retencion" ADD CONSTRAINT "entero_retencion_monto_positivo" CHECK ("monto_bs" > 0);
ALTER TABLE "entero_retencion" ADD CONSTRAINT "entero_retencion_anulacion_coherente" CHECK (("estado" = 'ANULADO') = ("anulado_en" IS NOT NULL));

-- El libro de tesorería admite el pago de impuestos retenidos y su anulación.
ALTER TABLE "movimiento_tesoreria" DROP CONSTRAINT "movimiento_tesoreria_tipo_valido";
ALTER TABLE "movimiento_tesoreria" ADD CONSTRAINT "movimiento_tesoreria_tipo_valido" CHECK ("tipo" IN ('SALDO_INICIAL','COBRO','PAGO','ANULACION_COBRO','ANULACION_PAGO','INGRESO','EGRESO','TRANSFERENCIA_ENTRADA','TRANSFERENCIA_SALIDA','ENTERO_IMPUESTO','ANULACION_ENTERO'));
ALTER TABLE "movimiento_tesoreria" DROP CONSTRAINT "movimiento_tesoreria_signo_coherente";
ALTER TABLE "movimiento_tesoreria" ADD CONSTRAINT "movimiento_tesoreria_signo_coherente" CHECK (
  ("tipo" IN ('COBRO','ANULACION_PAGO','INGRESO','TRANSFERENCIA_ENTRADA','ANULACION_ENTERO') AND "monto" > 0)
  OR ("tipo" IN ('PAGO','ANULACION_COBRO','EGRESO','TRANSFERENCIA_SALIDA','ENTERO_IMPUESTO') AND "monto" < 0)
  OR "tipo" = 'SALDO_INICIAL'
);
