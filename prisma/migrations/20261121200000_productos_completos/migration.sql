-- Productos con los campos del sistema anterior (ver ANALISIS-CAMPOS.md, 3.3): marca, método de costo, listas de precio y promociones.

CREATE TABLE "marca" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "marca_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "marca_codigo_key" ON "marca"("codigo");

ALTER TABLE "producto"
  ADD COLUMN "marca_id" UUID,
  ADD COLUMN "metodo_costo" TEXT NOT NULL DEFAULT 'PROMEDIO',
  ADD COLUMN "descripcion_editable" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "utilizacion" TEXT,
  ADD COLUMN "requiere_medida" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "contenido" DECIMAL(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN "descontinuado" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "producto" ADD CONSTRAINT "producto_marca_id_fkey" FOREIGN KEY ("marca_id") REFERENCES "marca"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "producto" ADD CONSTRAINT "producto_metodo_costo_valido" CHECK ("metodo_costo" IN ('PROMEDIO','ULTIMO'));
ALTER TABLE "producto" ADD CONSTRAINT "producto_contenido_valido" CHECK ("contenido" >= 0);
CREATE INDEX "producto_marca_id_idx" ON "producto"("marca_id");

ALTER TABLE "producto_presentacion"
  ADD COLUMN "visible_ventas" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "visible_compras" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "producto_precio" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "producto_codigo" TEXT NOT NULL,
    "presentacion_id" UUID,
    "lista" TEXT NOT NULL,
    "precio_usd" DECIMAL(18,4) NOT NULL,
    "utilidad_pct" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "descuento_pct" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "descuento_max_pct" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "vence_en" DATE,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "producto_precio_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "producto_precio_producto_codigo_idx" ON "producto_precio"("producto_codigo");
-- Un solo precio por producto, presentación (o el base) y lista.
CREATE UNIQUE INDEX "producto_precio_unico" ON "producto_precio"("producto_codigo", COALESCE("presentacion_id", '00000000-0000-0000-0000-000000000000'::uuid), "lista");
ALTER TABLE "producto_precio" ADD CONSTRAINT "producto_precio_producto_codigo_fkey" FOREIGN KEY ("producto_codigo") REFERENCES "producto"("codigo") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "producto_precio" ADD CONSTRAINT "producto_precio_presentacion_id_fkey" FOREIGN KEY ("presentacion_id") REFERENCES "producto_presentacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "producto_precio" ADD CONSTRAINT "producto_precio_valido" CHECK (
  "lista" ~ '^[A-Z]$' AND "precio_usd" >= 0 AND "utilidad_pct" >= 0
  AND "descuento_pct" BETWEEN 0 AND 100 AND "descuento_max_pct" BETWEEN 0 AND 100
);

CREATE TABLE "promocion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "producto_codigo" TEXT NOT NULL,
    "presentacion_id" UUID,
    "lista" TEXT,
    "precio_usd" DECIMAL(18,4),
    "descuento_pct" DECIMAL(7,4),
    "cantidad_requerida" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "cantidad_otorgada" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "multiplo" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "desde" DATE NOT NULL,
    "hasta" DATE NOT NULL,
    "observaciones" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "promocion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "promocion_producto_codigo_desde_hasta_idx" ON "promocion"("producto_codigo", "desde", "hasta");
ALTER TABLE "promocion" ADD CONSTRAINT "promocion_producto_codigo_fkey" FOREIGN KEY ("producto_codigo") REFERENCES "producto"("codigo") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "promocion" ADD CONSTRAINT "promocion_presentacion_id_fkey" FOREIGN KEY ("presentacion_id") REFERENCES "producto_presentacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "promocion" ADD CONSTRAINT "promocion_valida" CHECK (
  "hasta" >= "desde"
  AND ("lista" IS NULL OR "lista" ~ '^[A-Z]$')
  AND ("precio_usd" IS NULL OR "precio_usd" >= 0)
  AND ("descuento_pct" IS NULL OR "descuento_pct" BETWEEN 0 AND 100)
  AND "cantidad_requerida" >= 0 AND "cantidad_otorgada" >= 0 AND "multiplo" >= 0
  AND ("precio_usd" IS NOT NULL OR "descuento_pct" IS NOT NULL OR "cantidad_otorgada" > 0)
);
