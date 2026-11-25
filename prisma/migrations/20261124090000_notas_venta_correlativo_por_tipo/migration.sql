-- Las notas de crédito y de débito de venta llevan correlativos separados, como en el original (tipos DEV y NDE).
-- El número pasa a ser único por tipo; los números ya emitidos no cambian.
DROP INDEX "nota_venta_numero_key";
CREATE UNIQUE INDEX "nota_venta_tipo_numero_key" ON "nota_venta"("tipo", "numero");

INSERT INTO "tipo_documento" ("codigo", "nombre", "ultimo_numero") VALUES
  ('NOTA_CREDITO', 'Nota de crédito de venta', COALESCE((SELECT MAX("numero") FROM "nota_venta" WHERE "tipo" = 'CREDITO'), 0)),
  ('NOTA_DEBITO', 'Nota de débito de venta', COALESCE((SELECT MAX("numero") FROM "nota_venta" WHERE "tipo" = 'DEBITO'), 0))
ON CONFLICT ("codigo") DO NOTHING;

DELETE FROM "tipo_documento" WHERE "codigo" = 'NOTA_VENTA';
