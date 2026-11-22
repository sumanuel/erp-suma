-- Anticipos de clientes (saldo a favor): lo que un cobro recibe de más (o sin facturas) queda como anticipo y luego se aplica a facturas (original: ingresarAnticipoSalcli, documento «ANT»).
ALTER TABLE cobro
  ADD COLUMN IF NOT EXISTS anticipo_usd numeric(18,4) NOT NULL DEFAULT 0 CHECK (anticipo_usd >= 0),
  ADD COLUMN IF NOT EXISTS anticipo_bs numeric(18,2) NOT NULL DEFAULT 0 CHECK (anticipo_bs >= 0),
  ADD COLUMN IF NOT EXISTS anticipo_saldo_usd numeric(18,4) NOT NULL DEFAULT 0 CHECK (anticipo_saldo_usd >= 0);
ALTER TABLE cobro ADD CONSTRAINT cobro_anticipo_valido CHECK (anticipo_saldo_usd <= anticipo_usd);
ALTER TABLE cobro DROP CONSTRAINT IF EXISTS cobro_montos_validos;
ALTER TABLE cobro ADD CONSTRAINT cobro_montos_validos CHECK (monto_usd >= 0 AND monto_usd + anticipo_usd > 0 AND monto_moneda > 0 AND ((moneda = 'VES') = (tasa_usd IS NOT NULL)));

CREATE TABLE IF NOT EXISTS anticipo_aplicacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero serial UNIQUE,
  cobro_id uuid NOT NULL REFERENCES cobro(id),
  factura_id uuid NOT NULL REFERENCES factura(id),
  fecha date NOT NULL,
  monto_usd numeric(18,4) NOT NULL CHECK (monto_usd > 0),
  estado text NOT NULL DEFAULT 'ACTIVA' CHECK (estado IN ('ACTIVA','ANULADA')),
  creado_por_id uuid,
  creado_por_nombre text,
  creado_en timestamptz NOT NULL DEFAULT now(),
  anulado_en timestamptz,
  anulado_por_nombre text,
  motivo_anulacion text
);
CREATE INDEX IF NOT EXISTS anticipo_aplicacion_cobro_idx ON anticipo_aplicacion(cobro_id);
CREATE INDEX IF NOT EXISTS anticipo_aplicacion_factura_idx ON anticipo_aplicacion(factura_id);
