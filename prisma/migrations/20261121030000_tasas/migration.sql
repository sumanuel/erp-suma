-- CreateTable
CREATE TABLE "moneda" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "simbolo" TEXT NOT NULL,
    "es_base" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moneda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasa_cambio" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "moneda_id" UUID NOT NULL,
    "fecha" DATE NOT NULL,
    "valor" DECIMAL(18,8) NOT NULL,
    "fuente" TEXT NOT NULL DEFAULT 'Manual',
    "observacion" TEXT,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tasa_cambio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "moneda_codigo_key" ON "moneda"("codigo");

-- CreateIndex
CREATE INDEX "tasa_cambio_moneda_id_fecha_creado_en_idx" ON "tasa_cambio"("moneda_id", "fecha" DESC, "creado_en" DESC);

-- AddForeignKey
ALTER TABLE "tasa_cambio" ADD CONSTRAINT "tasa_cambio_moneda_id_fkey" FOREIGN KEY ("moneda_id") REFERENCES "moneda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

