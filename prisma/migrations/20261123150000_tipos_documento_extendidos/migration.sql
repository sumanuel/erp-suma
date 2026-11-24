-- Más tipos con correlativo propio, como en el original (admtipdoccli: REI; admtipdocpro: RIVA, RISL, NREC, ORC).
INSERT INTO "tipo_documento" ("codigo", "nombre", "ultimo_numero") VALUES
  ('RECIBO_COBRO', 'Recibo de ingreso (cobros)', COALESCE((SELECT MAX("numero") FROM "recibo_cobro"), 0)),
  ('RECEPCION', 'Nota de recepción de mercancía', COALESCE((SELECT MAX("numero") FROM "recepcion"), 0)),
  ('RETENCION_IVA', 'Comprobante de retención de IVA', COALESCE((SELECT MAX("numero") FROM "retencion" WHERE "tipo" = 'IVA' AND "sentido" = 'PRACTICADA'), 0)),
  ('RETENCION_ISLR', 'Comprobante de retención de ISLR', COALESCE((SELECT MAX("numero") FROM "retencion" WHERE "tipo" = 'ISLR' AND "sentido" = 'PRACTICADA'), 0))
ON CONFLICT ("codigo") DO NOTHING;

-- Las órdenes de importación comparten el correlativo de las órdenes de compra (en el original ambas usan el tipo ORC).
UPDATE "tipo_documento" SET "ultimo_numero" = GREATEST("ultimo_numero", COALESCE((SELECT MAX("numero") FROM "importacion"), 0)) WHERE "codigo" = 'ORDEN_COMPRA';
