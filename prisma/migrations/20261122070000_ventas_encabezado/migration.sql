-- Documentos de venta: origen de venta, bultos y kilos, pronto pago, y el permiso especial «cambiar precio».

CREATE TABLE "origen_venta" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "codigo" TEXT NOT NULL, "nombre" TEXT NOT NULL, "observaciones" TEXT,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "origen_venta_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "origen_venta_codigo_key" ON "origen_venta"("codigo");

-- Pronto pago de la condición de pago: si el cliente paga dentro de N días, se le da un porcentaje de descuento (hay dos escalones).
ALTER TABLE "condicion_pago"
  ADD COLUMN "pronto_pago_dias_1" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "pronto_pago_pct_1" DECIMAL(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN "pronto_pago_dias_2" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "pronto_pago_pct_2" DECIMAL(7,4) NOT NULL DEFAULT 0,
  ADD CONSTRAINT "condicion_pago_pronto_pago_valido" CHECK (
    "pronto_pago_dias_1" >= 0 AND "pronto_pago_dias_2" >= 0 AND "pronto_pago_pct_1" BETWEEN 0 AND 100 AND "pronto_pago_pct_2" BETWEEN 0 AND 100
    AND (("pronto_pago_pct_1" = 0) = ("pronto_pago_dias_1" = 0)) AND (("pronto_pago_pct_2" = 0) = ("pronto_pago_dias_2" = 0))
    AND ("pronto_pago_dias_2" = 0 OR "pronto_pago_dias_2" > "pronto_pago_dias_1")
  );

-- Los mismos datos en cada documento de venta (se copian de la condición de pago al crearlo y se pueden cambiar).
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['cotizacion', 'pedido_venta', 'factura'] LOOP
    EXECUTE format($f$
      ALTER TABLE %1$I
        ADD COLUMN "origen_venta_id" UUID, ADD COLUMN "bultos" INTEGER, ADD COLUMN "kilos" DECIMAL(18,3),
        ADD COLUMN "pronto_pago_dias_1" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "pronto_pago_pct_1" DECIMAL(7,4) NOT NULL DEFAULT 0,
        ADD COLUMN "pronto_pago_dias_2" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "pronto_pago_pct_2" DECIMAL(7,4) NOT NULL DEFAULT 0,
        ADD CONSTRAINT %2$I FOREIGN KEY ("origen_venta_id") REFERENCES "origen_venta"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        ADD CONSTRAINT %3$I CHECK (("bultos" IS NULL OR "bultos" >= 0) AND ("kilos" IS NULL OR "kilos" >= 0)),
        ADD CONSTRAINT %4$I CHECK (
          "pronto_pago_dias_1" >= 0 AND "pronto_pago_dias_2" >= 0 AND "pronto_pago_pct_1" BETWEEN 0 AND 100 AND "pronto_pago_pct_2" BETWEEN 0 AND 100
          AND (("pronto_pago_pct_1" = 0) = ("pronto_pago_dias_1" = 0)) AND (("pronto_pago_pct_2" = 0) = ("pronto_pago_dias_2" = 0))
          AND ("pronto_pago_dias_2" = 0 OR "pronto_pago_dias_2" > "pronto_pago_dias_1")
        )$f$, t, t || '_origen_venta_fkey', t || '_bultos_kilos_validos', t || '_pronto_pago_valido');
    EXECUTE format('CREATE INDEX %I ON %I ("origen_venta_id")', t || '_origen_venta_idx', t);
  END LOOP;
END $$;

-- Permiso especial «cambiar precio» (antes todos los que vendían podían): se conserva para los perfiles que ya podían crear documentos de venta.
INSERT INTO "perfil_permiso" ("perfil_id", "permiso")
SELECT DISTINCT "perfil_id", 'ventas.cambiar_precio' FROM "perfil_permiso"
WHERE "permiso" IN ('cotizaciones.crear', 'pedidos.crear', 'facturacion.crear', 'pos.crear')
ON CONFLICT DO NOTHING;
