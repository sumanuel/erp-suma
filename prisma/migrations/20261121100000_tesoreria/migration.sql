-- AlterTable
ALTER TABLE "cobro" ADD COLUMN     "cuenta_id" UUID;

-- AlterTable
ALTER TABLE "pago_proveedor" ADD COLUMN     "cuenta_id" UUID;

-- CreateTable
CREATE TABLE "cuenta_tesoreria" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "moneda" TEXT NOT NULL,
    "banco" TEXT,
    "numero_cuenta" TEXT,
    "saldo" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "permite_sobregiro" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cuenta_tesoreria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimiento_tesoreria" (
    "id" BIGSERIAL NOT NULL,
    "fecha" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cuenta_id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "monto" DECIMAL(18,2) NOT NULL,
    "saldo_despues" DECIMAL(18,2) NOT NULL,
    "documento" TEXT,
    "descripcion" TEXT,
    "grupo" UUID,
    "conciliado" BOOLEAN NOT NULL DEFAULT false,
    "conciliado_en" TIMESTAMPTZ(6),
    "usuario_id" UUID,
    "usuario_nombre" TEXT,

    CONSTRAINT "movimiento_tesoreria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cuenta_tesoreria_codigo_key" ON "cuenta_tesoreria"("codigo");

-- CreateIndex
CREATE INDEX "movimiento_tesoreria_cuenta_id_fecha_idx" ON "movimiento_tesoreria"("cuenta_id", "fecha" DESC);

-- CreateIndex
CREATE INDEX "movimiento_tesoreria_grupo_idx" ON "movimiento_tesoreria"("grupo");

-- AddForeignKey
ALTER TABLE "cobro" ADD CONSTRAINT "cobro_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "cuenta_tesoreria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pago_proveedor" ADD CONSTRAINT "pago_proveedor_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "cuenta_tesoreria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_tesoreria" ADD CONSTRAINT "movimiento_tesoreria_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "cuenta_tesoreria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- Reglas que Prisma no expresa.
ALTER TABLE "cuenta_tesoreria" ADD CONSTRAINT "cuenta_tipo_valido" CHECK ("tipo" IN ('CAJA','BANCO'));
ALTER TABLE "cuenta_tesoreria" ADD CONSTRAINT "cuenta_moneda_valida" CHECK ("moneda" IN ('USD','VES'));
ALTER TABLE "cuenta_tesoreria" ADD CONSTRAINT "cuenta_sin_sobregiro" CHECK ("permite_sobregiro" OR "saldo" >= 0);
ALTER TABLE "movimiento_tesoreria" ADD CONSTRAINT "movimiento_tesoreria_tipo_valido" CHECK ("tipo" IN ('SALDO_INICIAL','COBRO','PAGO','ANULACION_COBRO','ANULACION_PAGO','INGRESO','EGRESO','TRANSFERENCIA_ENTRADA','TRANSFERENCIA_SALIDA'));
ALTER TABLE "movimiento_tesoreria" ADD CONSTRAINT "movimiento_tesoreria_monto_no_cero" CHECK ("monto" <> 0);
ALTER TABLE "movimiento_tesoreria" ADD CONSTRAINT "movimiento_tesoreria_signo_coherente" CHECK (
  ("tipo" IN ('COBRO','ANULACION_PAGO','INGRESO','TRANSFERENCIA_ENTRADA') AND "monto" > 0)
  OR ("tipo" IN ('PAGO','ANULACION_COBRO','EGRESO','TRANSFERENCIA_SALIDA') AND "monto" < 0)
  OR "tipo" = 'SALDO_INICIAL'
);
