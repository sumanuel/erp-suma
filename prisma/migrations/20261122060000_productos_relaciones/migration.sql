-- Sustitutos, asociados y componentes de un producto, y la imagen del producto.
ALTER TABLE "producto" ADD COLUMN "imagen_url" TEXT;

CREATE TABLE "producto_relacion" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "producto_codigo" TEXT NOT NULL, "relacionado_codigo" TEXT NOT NULL, "tipo" TEXT NOT NULL,
  "cantidad" DECIMAL(18,4) NOT NULL DEFAULT 1, "observaciones" TEXT, "activo" BOOLEAN NOT NULL DEFAULT true,
  "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "producto_relacion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "producto_relacion_tipo_valido" CHECK ("tipo" IN ('SUSTITUTO','ASOCIADO','COMPONENTE')),
  CONSTRAINT "producto_relacion_distintos" CHECK ("producto_codigo" <> "relacionado_codigo"),
  CONSTRAINT "producto_relacion_cantidad_positiva" CHECK ("cantidad" > 0),
  CONSTRAINT "producto_relacion_producto_fkey" FOREIGN KEY ("producto_codigo") REFERENCES "producto"("codigo") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "producto_relacion_relacionado_fkey" FOREIGN KEY ("relacionado_codigo") REFERENCES "producto"("codigo") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "producto_relacion_producto_codigo_relacionado_codigo_tipo_key" ON "producto_relacion"("producto_codigo", "relacionado_codigo", "tipo");
CREATE INDEX "producto_relacion_relacionado_codigo_idx" ON "producto_relacion"("relacionado_codigo");
