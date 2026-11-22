-- Clientes y proveedores con los campos que usa el sistema anterior (ver ANALISIS-CAMPOS.md, 3.1 y 3.2).
-- Código propio: se asigna solo (C000001, P000001…) si no se da; los registros existentes lo reciben al agregar la columna.

CREATE SEQUENCE "cliente_codigo_seq";
CREATE SEQUENCE "proveedor_codigo_seq";

ALTER TABLE "cliente"
  ADD COLUMN "codigo" TEXT NOT NULL DEFAULT ('C'::text || lpad((nextval('cliente_codigo_seq'::regclass))::text, 6, '0'::text)),
  ADD COLUMN "nif" TEXT,
  ADD COLUMN "tipo_persona" TEXT,
  ADD COLUMN "residente" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "contribuyente" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "contribuyente_especial" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "situacion" TEXT NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN "representante" TEXT,
  ADD COLUMN "clasificacion" TEXT,
  ADD COLUMN "actividad_economica" TEXT,
  ADD COLUMN "direccion2" TEXT,
  ADD COLUMN "direccion_envio" TEXT,
  ADD COLUMN "pais_id" UUID,
  ADD COLUMN "estado_id" UUID,
  ADD COLUMN "municipio_id" UUID,
  ADD COLUMN "parroquia_id" UUID,
  ADD COLUMN "zona_postal" TEXT,
  ADD COLUMN "zona" TEXT,
  ADD COLUMN "telefono2" TEXT,
  ADD COLUMN "fax" TEXT,
  ADD COLUMN "celular" TEXT,
  ADD COLUMN "celular2" TEXT,
  ADD COLUMN "web" TEXT,
  ADD COLUMN "vendedor_id" UUID,
  ADD COLUMN "cobrador_id" UUID,
  ADD COLUMN "comision_venta_pct" DECIMAL(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN "comision_cobro_pct" DECIMAL(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN "condicion_pago_id" UUID,
  ADD COLUMN "tiene_credito" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "limite_credito" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "dias_max_vencimiento" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "dia_cobro" TEXT,
  ADD COLUMN "hora_cobro" TEXT,
  ADD COLUMN "lista_precio" TEXT NOT NULL DEFAULT 'A',
  ADD COLUMN "ultimo_precio" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "descuento_1" DECIMAL(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN "descuento_2" DECIMAL(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN "descuento_3" DECIMAL(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN "tipo_negocio_id" UUID,
  ADD COLUMN "transporte_id" UUID,
  ADD COLUMN "divisa" TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN "fecha_nacimiento" DATE,
  ADD COLUMN "observaciones" TEXT;

ALTER TABLE "proveedor"
  ADD COLUMN "codigo" TEXT NOT NULL DEFAULT ('P'::text || lpad((nextval('proveedor_codigo_seq'::regclass))::text, 6, '0'::text)),
  ADD COLUMN "tipo_persona" TEXT,
  ADD COLUMN "residente" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "contribuyente" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "contribuyente_especial" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "situacion" TEXT NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN "clasificacion" TEXT,
  ADD COLUMN "actividad_economica" TEXT,
  ADD COLUMN "divisa" TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN "condicion_pago_id" UUID,
  ADD COLUMN "limite_credito" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "descuento_1" DECIMAL(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN "descuento_2" DECIMAL(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN "descuento_3" DECIMAL(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN "zona_libre" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "cxp_moneda_extranjera" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "ordenes_moneda_extranjera" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "solicita_cotizacion_moneda_extranjera" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "banco_id" UUID,
  ADD COLUMN "tipo_cuenta_bancaria" TEXT,
  ADD COLUMN "numero_cuenta_bancaria" TEXT,
  ADD COLUMN "direccion2" TEXT,
  ADD COLUMN "direccion3" TEXT,
  ADD COLUMN "pais_id" UUID,
  ADD COLUMN "estado_id" UUID,
  ADD COLUMN "municipio_id" UUID,
  ADD COLUMN "parroquia_id" UUID,
  ADD COLUMN "telefono2" TEXT,
  ADD COLUMN "telefono3" TEXT,
  ADD COLUMN "celular" TEXT,
  ADD COLUMN "celular2" TEXT,
  ADD COLUMN "web" TEXT,
  ADD COLUMN "observaciones" TEXT;

CREATE UNIQUE INDEX "cliente_codigo_key" ON "cliente"("codigo");
CREATE UNIQUE INDEX "proveedor_codigo_key" ON "proveedor"("codigo");

ALTER TABLE "cliente"
  ADD CONSTRAINT "cliente_pais_id_fkey" FOREIGN KEY ("pais_id") REFERENCES "pais"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "cliente_estado_id_fkey" FOREIGN KEY ("estado_id") REFERENCES "estado"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "cliente_municipio_id_fkey" FOREIGN KEY ("municipio_id") REFERENCES "municipio"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "cliente_parroquia_id_fkey" FOREIGN KEY ("parroquia_id") REFERENCES "parroquia"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "cliente_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "vendedor"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "cliente_cobrador_id_fkey" FOREIGN KEY ("cobrador_id") REFERENCES "vendedor"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "cliente_condicion_pago_id_fkey" FOREIGN KEY ("condicion_pago_id") REFERENCES "condicion_pago"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "cliente_tipo_negocio_id_fkey" FOREIGN KEY ("tipo_negocio_id") REFERENCES "tipo_negocio"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "cliente_transporte_id_fkey" FOREIGN KEY ("transporte_id") REFERENCES "transporte"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "proveedor"
  ADD CONSTRAINT "proveedor_pais_id_fkey" FOREIGN KEY ("pais_id") REFERENCES "pais"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "proveedor_estado_id_fkey" FOREIGN KEY ("estado_id") REFERENCES "estado"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "proveedor_municipio_id_fkey" FOREIGN KEY ("municipio_id") REFERENCES "municipio"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "proveedor_parroquia_id_fkey" FOREIGN KEY ("parroquia_id") REFERENCES "parroquia"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "proveedor_condicion_pago_id_fkey" FOREIGN KEY ("condicion_pago_id") REFERENCES "condicion_pago"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "proveedor_banco_id_fkey" FOREIGN KEY ("banco_id") REFERENCES "banco"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Reglas que hace cumplir la base.
ALTER TABLE "cliente"
  ADD CONSTRAINT "cliente_tipo_persona_valido" CHECK ("tipo_persona" IS NULL OR "tipo_persona" IN ('NATURAL','JURIDICA')),
  ADD CONSTRAINT "cliente_situacion_valida" CHECK ("situacion" IN ('NORMAL','MOROSO','BLOQUEADO')),
  ADD CONSTRAINT "cliente_divisa_valida" CHECK ("divisa" IN ('USD','VES')),
  ADD CONSTRAINT "cliente_porcentajes_validos" CHECK (
    "comision_venta_pct" BETWEEN 0 AND 100 AND "comision_cobro_pct" BETWEEN 0 AND 100
    AND "descuento_1" BETWEEN 0 AND 100 AND "descuento_2" BETWEEN 0 AND 100 AND "descuento_3" BETWEEN 0 AND 100),
  ADD CONSTRAINT "cliente_credito_valido" CHECK ("limite_credito" >= 0 AND "dias_max_vencimiento" >= 0 AND "dias_max_vencimiento" <= 365);
ALTER TABLE "proveedor"
  ADD CONSTRAINT "proveedor_tipo_persona_valido" CHECK ("tipo_persona" IS NULL OR "tipo_persona" IN ('NATURAL','JURIDICA')),
  ADD CONSTRAINT "proveedor_situacion_valida" CHECK ("situacion" IN ('NORMAL','MOROSO','BLOQUEADO')),
  ADD CONSTRAINT "proveedor_divisa_valida" CHECK ("divisa" IN ('USD','VES')),
  ADD CONSTRAINT "proveedor_tipo_cuenta_valido" CHECK ("tipo_cuenta_bancaria" IS NULL OR "tipo_cuenta_bancaria" IN ('CORRIENTE','AHORRO')),
  ADD CONSTRAINT "proveedor_porcentajes_validos" CHECK ("descuento_1" BETWEEN 0 AND 100 AND "descuento_2" BETWEEN 0 AND 100 AND "descuento_3" BETWEEN 0 AND 100),
  ADD CONSTRAINT "proveedor_limite_credito_valido" CHECK ("limite_credito" >= 0);
