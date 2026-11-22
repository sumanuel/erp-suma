-- Catálogos y registros dependientes del sistema anterior: sucursales, actividad económica, clasificaciones, divisiones, colores, tallas, series fiscales,
-- ubicaciones físicas, contactos y sucursales de clientes y proveedores; y los campos nuevos de almacén, cliente, proveedor y producto.

CREATE TABLE "sucursal" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "codigo" TEXT NOT NULL, "nombre" TEXT NOT NULL, "direccion" TEXT, "telefono1" TEXT, "telefono2" TEXT, "fax" TEXT, "rif" TEXT, "email" TEXT,
  "fecha_inicio" DATE, "fecha_fin" DATE, "pais_id" UUID, "estado_id" UUID, "municipio_id" UUID, "parroquia_id" UUID, "activo" BOOLEAN NOT NULL DEFAULT true,
  "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "sucursal_pkey" PRIMARY KEY ("id"));
CREATE TABLE "actividad_economica" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "codigo" TEXT NOT NULL, "nombre" TEXT NOT NULL, "observaciones" TEXT, "activo" BOOLEAN NOT NULL DEFAULT true,
  "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "actividad_economica_pkey" PRIMARY KEY ("id"));
CREATE TABLE "clasificacion_cliente" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "codigo" TEXT NOT NULL, "nombre" TEXT NOT NULL, "observaciones" TEXT, "activo" BOOLEAN NOT NULL DEFAULT true,
  "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "clasificacion_cliente_pkey" PRIMARY KEY ("id"));
CREATE TABLE "clasificacion_proveedor" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "codigo" TEXT NOT NULL, "nombre" TEXT NOT NULL, "observaciones" TEXT, "activo" BOOLEAN NOT NULL DEFAULT true,
  "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "clasificacion_proveedor_pkey" PRIMARY KEY ("id"));
CREATE TABLE "division" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "codigo" TEXT NOT NULL, "nombre" TEXT NOT NULL, "comentario" TEXT, "activo" BOOLEAN NOT NULL DEFAULT true,
  "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "division_pkey" PRIMARY KEY ("id"));
CREATE TABLE "color" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "codigo" TEXT NOT NULL, "nombre" TEXT NOT NULL, "activo" BOOLEAN NOT NULL DEFAULT true,
  "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "color_pkey" PRIMARY KEY ("id"));
CREATE TABLE "talla" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "codigo" TEXT NOT NULL, "nombre" TEXT NOT NULL, "activo" BOOLEAN NOT NULL DEFAULT true,
  "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "talla_pkey" PRIMARY KEY ("id"));
CREATE TABLE "serie_fiscal" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "serie" TEXT NOT NULL, "serial" TEXT, "impresora" TEXT, "ip" TEXT, "documento" TEXT NOT NULL DEFAULT 'FACTURA', "caja" TEXT,
  "punto_activo" BOOLEAN NOT NULL DEFAULT true, "activo" BOOLEAN NOT NULL DEFAULT true,
  "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "serie_fiscal_pkey" PRIMARY KEY ("id"));
CREATE TABLE "ubicacion_fisica" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "codigo" TEXT NOT NULL, "almacen_id" UUID NOT NULL, "pasillo" TEXT, "anaquel" TEXT, "nivel" TEXT, "sector" TEXT, "comentario" TEXT,
  "activo" BOOLEAN NOT NULL DEFAULT true, "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "ubicacion_fisica_pkey" PRIMARY KEY ("id"));
CREATE TABLE "contacto_cliente" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "cliente_id" UUID NOT NULL, "nombre" TEXT NOT NULL, "cargo" TEXT, "extension" TEXT, "telefono" TEXT, "celular" TEXT, "email" TEXT, "observaciones" TEXT,
  "activo" BOOLEAN NOT NULL DEFAULT true, "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "contacto_cliente_pkey" PRIMARY KEY ("id"));
CREATE TABLE "sucursal_cliente" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "cliente_id" UUID NOT NULL, "codigo" TEXT NOT NULL, "nombre" TEXT NOT NULL, "direccion" TEXT, "telefono" TEXT, "fax" TEXT, "celular" TEXT,
  "contacto" TEXT, "cargo" TEXT, "email" TEXT, "pais_id" UUID, "estado_id" UUID, "municipio_id" UUID, "parroquia_id" UUID, "observaciones" TEXT, "activo" BOOLEAN NOT NULL DEFAULT true,
  "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "sucursal_cliente_pkey" PRIMARY KEY ("id"));
CREATE TABLE "contacto_proveedor" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "proveedor_id" UUID NOT NULL, "nombre" TEXT NOT NULL, "cargo" TEXT, "extension" TEXT, "telefono" TEXT, "celular" TEXT, "email" TEXT, "observaciones" TEXT,
  "activo" BOOLEAN NOT NULL DEFAULT true, "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "contacto_proveedor_pkey" PRIMARY KEY ("id"));

CREATE UNIQUE INDEX "sucursal_codigo_key" ON "sucursal"("codigo");
CREATE UNIQUE INDEX "actividad_economica_codigo_key" ON "actividad_economica"("codigo");
CREATE UNIQUE INDEX "clasificacion_cliente_codigo_key" ON "clasificacion_cliente"("codigo");
CREATE UNIQUE INDEX "clasificacion_proveedor_codigo_key" ON "clasificacion_proveedor"("codigo");
CREATE UNIQUE INDEX "division_codigo_key" ON "division"("codigo");
CREATE UNIQUE INDEX "color_codigo_key" ON "color"("codigo");
CREATE UNIQUE INDEX "talla_codigo_key" ON "talla"("codigo");
CREATE UNIQUE INDEX "serie_fiscal_serie_key" ON "serie_fiscal"("serie");
CREATE UNIQUE INDEX "ubicacion_fisica_codigo_key" ON "ubicacion_fisica"("codigo");
CREATE INDEX "ubicacion_fisica_almacen_id_idx" ON "ubicacion_fisica"("almacen_id");
CREATE INDEX "contacto_cliente_cliente_id_idx" ON "contacto_cliente"("cliente_id");
CREATE UNIQUE INDEX "sucursal_cliente_cliente_id_codigo_key" ON "sucursal_cliente"("cliente_id", "codigo");
CREATE INDEX "contacto_proveedor_proveedor_id_idx" ON "contacto_proveedor"("proveedor_id");

ALTER TABLE "sucursal"
  ADD CONSTRAINT "sucursal_pais_id_fkey" FOREIGN KEY ("pais_id") REFERENCES "pais"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "sucursal_estado_id_fkey" FOREIGN KEY ("estado_id") REFERENCES "estado"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "sucursal_municipio_id_fkey" FOREIGN KEY ("municipio_id") REFERENCES "municipio"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "sucursal_parroquia_id_fkey" FOREIGN KEY ("parroquia_id") REFERENCES "parroquia"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "sucursal_fechas_validas" CHECK ("fecha_inicio" IS NULL OR "fecha_fin" IS NULL OR "fecha_fin" >= "fecha_inicio");
ALTER TABLE "serie_fiscal" ADD CONSTRAINT "serie_fiscal_documento_valido" CHECK ("documento" IN ('FACTURA','NOTA_CREDITO','NOTA_DEBITO'));
ALTER TABLE "ubicacion_fisica" ADD CONSTRAINT "ubicacion_fisica_almacen_id_fkey" FOREIGN KEY ("almacen_id") REFERENCES "almacen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contacto_cliente" ADD CONSTRAINT "contacto_cliente_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sucursal_cliente"
  ADD CONSTRAINT "sucursal_cliente_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "sucursal_cliente_pais_id_fkey" FOREIGN KEY ("pais_id") REFERENCES "pais"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "sucursal_cliente_estado_id_fkey" FOREIGN KEY ("estado_id") REFERENCES "estado"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "sucursal_cliente_municipio_id_fkey" FOREIGN KEY ("municipio_id") REFERENCES "municipio"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "sucursal_cliente_parroquia_id_fkey" FOREIGN KEY ("parroquia_id") REFERENCES "parroquia"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contacto_proveedor" ADD CONSTRAINT "contacto_proveedor_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Almacén.
ALTER TABLE "almacen"
  ADD COLUMN "telefono1" TEXT, ADD COLUMN "telefono2" TEXT, ADD COLUMN "comentario" TEXT, ADD COLUMN "sucursal_id" UUID,
  ADD COLUMN "cuenta_inventario_id" UUID, ADD COLUMN "cuenta_entrada_traslado_id" UUID, ADD COLUMN "cuenta_salida_traslado_id" UUID,
  ADD COLUMN "cuenta_entrada_ajuste_id" UUID, ADD COLUMN "cuenta_salida_ajuste_id" UUID, ADD COLUMN "cuenta_entrada_proceso_id" UUID, ADD COLUMN "cuenta_salida_proceso_id" UUID;
ALTER TABLE "almacen"
  ADD CONSTRAINT "almacen_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursal"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "almacen_cuenta_inventario_id_fkey" FOREIGN KEY ("cuenta_inventario_id") REFERENCES "cuenta_contable"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "almacen_cuenta_entrada_traslado_id_fkey" FOREIGN KEY ("cuenta_entrada_traslado_id") REFERENCES "cuenta_contable"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "almacen_cuenta_salida_traslado_id_fkey" FOREIGN KEY ("cuenta_salida_traslado_id") REFERENCES "cuenta_contable"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "almacen_cuenta_entrada_ajuste_id_fkey" FOREIGN KEY ("cuenta_entrada_ajuste_id") REFERENCES "cuenta_contable"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "almacen_cuenta_salida_ajuste_id_fkey" FOREIGN KEY ("cuenta_salida_ajuste_id") REFERENCES "cuenta_contable"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "almacen_cuenta_entrada_proceso_id_fkey" FOREIGN KEY ("cuenta_entrada_proceso_id") REFERENCES "cuenta_contable"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "almacen_cuenta_salida_proceso_id_fkey" FOREIGN KEY ("cuenta_salida_proceso_id") REFERENCES "cuenta_contable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Cliente y proveedor: la clasificación y la actividad económica pasan de texto libre a catálogo (aún no había datos cargados); cuenta contable y auxiliar del tercero.
ALTER TABLE "cliente" DROP COLUMN "clasificacion", DROP COLUMN "actividad_economica";
ALTER TABLE "proveedor" DROP COLUMN "clasificacion", DROP COLUMN "actividad_economica";
ALTER TABLE "cliente" ADD COLUMN "clasificacion_id" UUID, ADD COLUMN "actividad_economica_id" UUID, ADD COLUMN "cuenta_contable_id" UUID, ADD COLUMN "auxiliar_contable_id" UUID;
ALTER TABLE "proveedor" ADD COLUMN "clasificacion_id" UUID, ADD COLUMN "actividad_economica_id" UUID, ADD COLUMN "cuenta_contable_id" UUID, ADD COLUMN "auxiliar_contable_id" UUID;
ALTER TABLE "cliente"
  ADD CONSTRAINT "cliente_clasificacion_id_fkey" FOREIGN KEY ("clasificacion_id") REFERENCES "clasificacion_cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "cliente_actividad_economica_id_fkey" FOREIGN KEY ("actividad_economica_id") REFERENCES "actividad_economica"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "cliente_cuenta_contable_id_fkey" FOREIGN KEY ("cuenta_contable_id") REFERENCES "cuenta_contable"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "cliente_auxiliar_contable_id_fkey" FOREIGN KEY ("auxiliar_contable_id") REFERENCES "auxiliar_contable"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "proveedor"
  ADD CONSTRAINT "proveedor_clasificacion_id_fkey" FOREIGN KEY ("clasificacion_id") REFERENCES "clasificacion_proveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "proveedor_actividad_economica_id_fkey" FOREIGN KEY ("actividad_economica_id") REFERENCES "actividad_economica"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "proveedor_cuenta_contable_id_fkey" FOREIGN KEY ("cuenta_contable_id") REFERENCES "cuenta_contable"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "proveedor_auxiliar_contable_id_fkey" FOREIGN KEY ("auxiliar_contable_id") REFERENCES "auxiliar_contable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Producto: división.
ALTER TABLE "producto" ADD COLUMN "division_id" UUID;
ALTER TABLE "producto" ADD CONSTRAINT "producto_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "division"("id") ON DELETE SET NULL ON UPDATE CASCADE;
