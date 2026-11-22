-- Tablas base: condición de pago, vendedores/cobradores, tipo de negocio, transporte, bancos, tarifas de ISLR y geografía.

CREATE TABLE "condicion_pago" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "dias" INTEGER NOT NULL DEFAULT 0,
    "dias_mora" INTEGER NOT NULL DEFAULT 0,
    "observaciones" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "condicion_pago_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "vendedor" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "cedula" TEXT,
    "cargo" TEXT,
    "grupo" TEXT,
    "es_vendedor" BOOLEAN NOT NULL DEFAULT true,
    "es_cobrador" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vendedor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tipo_negocio" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descuento_1" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "descuento_2" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "descuento_3" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "primera_leyenda_dias" INTEGER NOT NULL DEFAULT 0,
    "primera_leyenda_pct" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "segunda_leyenda_dias" INTEGER NOT NULL DEFAULT 0,
    "segunda_leyenda_pct" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "observaciones" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tipo_negocio_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "transporte" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "proveedor_id" UUID,
    "observaciones" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "transporte_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "banco" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "direccion" TEXT,
    "contacto" TEXT,
    "telefono1" TEXT,
    "telefono2" TEXT,
    "telefono3" TEXT,
    "web" TEXT,
    "casillero" TEXT,
    "observaciones" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "banco_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tarifa_retencion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "codigo" INTEGER NOT NULL,
    "descripcion" TEXT NOT NULL,
    "concepto_xml" TEXT,
    "numeral" TEXT,
    "tipo_persona" TEXT NOT NULL DEFAULT 'AMBAS',
    "residente" TEXT NOT NULL DEFAULT 'AMBOS',
    "acumulable" BOOLEAN NOT NULL DEFAULT false,
    "porcentaje" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tarifa_retencion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pais" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pais_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "estado" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pais_id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "estado_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "municipio" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "estado_id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "municipio_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "parroquia" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "municipio_id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "parroquia_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "condicion_pago_codigo_key" ON "condicion_pago"("codigo");
CREATE UNIQUE INDEX "vendedor_codigo_key" ON "vendedor"("codigo");
CREATE UNIQUE INDEX "tipo_negocio_codigo_key" ON "tipo_negocio"("codigo");
CREATE UNIQUE INDEX "transporte_codigo_key" ON "transporte"("codigo");
CREATE INDEX "transporte_proveedor_id_idx" ON "transporte"("proveedor_id");
CREATE UNIQUE INDEX "banco_codigo_key" ON "banco"("codigo");
CREATE UNIQUE INDEX "tarifa_retencion_codigo_key" ON "tarifa_retencion"("codigo");
CREATE UNIQUE INDEX "pais_codigo_key" ON "pais"("codigo");
CREATE UNIQUE INDEX "estado_pais_id_codigo_key" ON "estado"("pais_id", "codigo");
CREATE UNIQUE INDEX "municipio_estado_id_codigo_key" ON "municipio"("estado_id", "codigo");
CREATE UNIQUE INDEX "parroquia_municipio_id_codigo_key" ON "parroquia"("municipio_id", "codigo");

ALTER TABLE "transporte" ADD CONSTRAINT "transporte_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "estado" ADD CONSTRAINT "estado_pais_id_fkey" FOREIGN KEY ("pais_id") REFERENCES "pais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "municipio" ADD CONSTRAINT "municipio_estado_id_fkey" FOREIGN KEY ("estado_id") REFERENCES "estado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "parroquia" ADD CONSTRAINT "parroquia_municipio_id_fkey" FOREIGN KEY ("municipio_id") REFERENCES "municipio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reglas que la base misma hace cumplir.
ALTER TABLE "condicion_pago" ADD CONSTRAINT "condicion_pago_dias_validos" CHECK ("dias" >= 0 AND "dias" <= 365 AND "dias_mora" >= 0 AND "dias_mora" <= 365);
ALTER TABLE "vendedor" ADD CONSTRAINT "vendedor_rol_valido" CHECK ("es_vendedor" OR "es_cobrador");
ALTER TABLE "tipo_negocio" ADD CONSTRAINT "tipo_negocio_porcentajes_validos" CHECK (
  "descuento_1" BETWEEN 0 AND 100 AND "descuento_2" BETWEEN 0 AND 100 AND "descuento_3" BETWEEN 0 AND 100
  AND "primera_leyenda_pct" BETWEEN 0 AND 100 AND "segunda_leyenda_pct" BETWEEN 0 AND 100
  AND "primera_leyenda_dias" >= 0 AND "segunda_leyenda_dias" >= 0
);
ALTER TABLE "tarifa_retencion" ADD CONSTRAINT "tarifa_retencion_valida" CHECK (
  "porcentaje" BETWEEN 0 AND 100 AND "tipo_persona" IN ('NATURAL','JURIDICA','AMBAS') AND "residente" IN ('SI','NO','AMBOS')
);
