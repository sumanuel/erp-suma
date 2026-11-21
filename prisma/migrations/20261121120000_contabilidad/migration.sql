-- CreateTable
CREATE TABLE "cuenta_contable" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "padre_id" UUID,
    "nivel" INTEGER NOT NULL DEFAULT 1,
    "posteable" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cuenta_contable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "periodo_contable" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "anio" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'ABIERTO',
    "cerrado_en" TIMESTAMPTZ(6),
    "cerrado_por_nombre" TEXT,

    CONSTRAINT "periodo_contable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asiento" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "numero" SERIAL NOT NULL,
    "fecha" DATE NOT NULL,
    "anio" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "descripcion" TEXT NOT NULL,
    "origen" TEXT NOT NULL DEFAULT 'MANUAL',
    "referencia" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'REGISTRADO',
    "motivo_anulacion" TEXT,
    "anulado_en" TIMESTAMPTZ(6),
    "anulado_por_nombre" TEXT,
    "creado_por_id" UUID,
    "creado_por_nombre" TEXT,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asiento_linea" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "asiento_id" UUID NOT NULL,
    "linea" INTEGER NOT NULL,
    "cuenta_id" UUID NOT NULL,
    "descripcion" TEXT,
    "debe" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "haber" DECIMAL(18,2) NOT NULL DEFAULT 0,

    CONSTRAINT "asiento_linea_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cuenta_contable_codigo_key" ON "cuenta_contable"("codigo");

-- CreateIndex
CREATE INDEX "cuenta_contable_padre_id_idx" ON "cuenta_contable"("padre_id");

-- CreateIndex
CREATE UNIQUE INDEX "periodo_contable_anio_mes_key" ON "periodo_contable"("anio", "mes");

-- CreateIndex
CREATE UNIQUE INDEX "asiento_numero_key" ON "asiento"("numero");

-- CreateIndex
CREATE INDEX "asiento_fecha_idx" ON "asiento"("fecha" DESC);

-- CreateIndex
CREATE INDEX "asiento_anio_mes_idx" ON "asiento"("anio", "mes");

-- CreateIndex
CREATE INDEX "asiento_linea_cuenta_id_idx" ON "asiento_linea"("cuenta_id");

-- CreateIndex
CREATE UNIQUE INDEX "asiento_linea_asiento_id_linea_key" ON "asiento_linea"("asiento_id", "linea");

-- AddForeignKey
ALTER TABLE "cuenta_contable" ADD CONSTRAINT "cuenta_contable_padre_id_fkey" FOREIGN KEY ("padre_id") REFERENCES "cuenta_contable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asiento_linea" ADD CONSTRAINT "asiento_linea_asiento_id_fkey" FOREIGN KEY ("asiento_id") REFERENCES "asiento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asiento_linea" ADD CONSTRAINT "asiento_linea_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "cuenta_contable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- Reglas que Prisma no expresa.
ALTER TABLE "cuenta_contable" ADD CONSTRAINT "cuenta_contable_tipo_valido" CHECK ("tipo" IN ('ACTIVO','PASIVO','PATRIMONIO','INGRESO','COSTO','GASTO'));
ALTER TABLE "cuenta_contable" ADD CONSTRAINT "cuenta_contable_codigo_valido" CHECK ("codigo" ~ '^[0-9]+(\.[0-9]+)*$');
ALTER TABLE "cuenta_contable" ADD CONSTRAINT "cuenta_contable_nivel_valido" CHECK ("nivel" >= 1 AND "nivel" <= 10);
ALTER TABLE "periodo_contable" ADD CONSTRAINT "periodo_contable_mes_valido" CHECK ("mes" BETWEEN 1 AND 12 AND "anio" BETWEEN 2000 AND 2100);
ALTER TABLE "periodo_contable" ADD CONSTRAINT "periodo_contable_estado_valido" CHECK ("estado" IN ('ABIERTO','CERRADO'));
ALTER TABLE "asiento" ADD CONSTRAINT "asiento_estado_valido" CHECK ("estado" IN ('REGISTRADO','ANULADO'));
ALTER TABLE "asiento" ADD CONSTRAINT "asiento_anulacion_coherente" CHECK (("estado" = 'ANULADO') = ("anulado_en" IS NOT NULL));
ALTER TABLE "asiento_linea" ADD CONSTRAINT "asiento_linea_montos_validos" CHECK ("debe" >= 0 AND "haber" >= 0 AND (("debe" > 0) <> ("haber" > 0)));

-- Un asiento debe cuadrar (debe = haber). Se revisa al confirmar la transacción, así se pueden insertar las líneas una por una.
CREATE FUNCTION "asiento_debe_cuadrar"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  id_asiento uuid;
  d numeric;
  h numeric;
BEGIN
  id_asiento := COALESCE(NEW."asiento_id", OLD."asiento_id");
  SELECT COALESCE(SUM("debe"), 0), COALESCE(SUM("haber"), 0) INTO d, h FROM "asiento_linea" WHERE "asiento_id" = id_asiento;
  IF d <> h THEN
    RAISE EXCEPTION 'El asiento % no cuadra: debe % y haber %', id_asiento, d, h USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER "asiento_linea_cuadra" AFTER INSERT OR UPDATE OR DELETE ON "asiento_linea" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "asiento_debe_cuadrar"();
