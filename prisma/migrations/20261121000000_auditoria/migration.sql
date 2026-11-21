-- CreateTable
CREATE TABLE "auditoria_cambio" (
    "id" BIGSERIAL NOT NULL,
    "usuario_id" UUID,
    "usuario_nombre" TEXT,
    "modulo" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidad_id" TEXT NOT NULL,
    "descripcion" TEXT,
    "accion" TEXT NOT NULL,
    "antes" JSONB,
    "despues" JSONB,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_cambio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "auditoria_cambio_modulo_creado_en_idx" ON "auditoria_cambio"("modulo", "creado_en");

-- CreateIndex
CREATE INDEX "auditoria_cambio_entidad_entidad_id_idx" ON "auditoria_cambio"("entidad", "entidad_id");

-- CreateIndex
CREATE INDEX "auditoria_cambio_usuario_id_idx" ON "auditoria_cambio"("usuario_id");

