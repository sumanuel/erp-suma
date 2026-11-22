-- Importaciones (original: frmImportaciones / frmProductosImportacion / frmOtrosGastos): expediente de una compra del exterior con sus productos (FOB), gastos y la liquidación del costo.
CREATE TABLE IF NOT EXISTS importacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero serial UNIQUE,
  proveedor_id uuid NOT NULL REFERENCES proveedor(id),
  documento text NOT NULL,
  fecha date NOT NULL,
  almacen_id uuid NOT NULL REFERENCES almacen(id),
  moneda text NOT NULL DEFAULT 'USD',
  cambio_usd numeric(18,8) NOT NULL DEFAULT 1 CHECK (cambio_usd > 0),
  factor_cif numeric(18,10) NOT NULL DEFAULT 1 CHECK (factor_cif > 0),
  factor_otros numeric(18,10) NOT NULL DEFAULT 0 CHECK (factor_otros >= 0),
  estado text NOT NULL DEFAULT 'BORRADOR' CHECK (estado IN ('BORRADOR','PROCESADA','ANULADA')),
  observaciones text,
  fob_usd numeric(18,4) NOT NULL DEFAULT 0,
  cif_usd numeric(18,4) NOT NULL DEFAULT 0,
  gastos_usd numeric(18,4) NOT NULL DEFAULT 0,
  aranceles_usd numeric(18,4) NOT NULL DEFAULT 0,
  total_usd numeric(18,4) NOT NULL DEFAULT 0,
  creado_por_id uuid,
  creado_por_nombre text,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  procesada_en timestamptz,
  procesada_por_nombre text,
  anulada_en timestamptz,
  anulada_por_nombre text,
  motivo_anulacion text
);
CREATE INDEX IF NOT EXISTS importacion_estado_idx ON importacion(estado, fecha DESC);
CREATE INDEX IF NOT EXISTS importacion_proveedor_idx ON importacion(proveedor_id);

CREATE TABLE IF NOT EXISTS importacion_linea (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  importacion_id uuid NOT NULL REFERENCES importacion(id) ON DELETE CASCADE,
  linea int NOT NULL,
  producto_codigo text NOT NULL REFERENCES producto(codigo),
  cantidad numeric(18,4) NOT NULL CHECK (cantidad > 0),
  fob_unitario numeric(18,8) NOT NULL CHECK (fob_unitario >= 0),
  arancel_pct numeric(7,4) NOT NULL DEFAULT 0 CHECK (arancel_pct >= 0 AND arancel_pct <= 1000),
  fob_usd numeric(18,4) NOT NULL DEFAULT 0,
  cif_usd numeric(18,4) NOT NULL DEFAULT 0,
  gasto_usd numeric(18,4) NOT NULL DEFAULT 0,
  arancel_usd numeric(18,4) NOT NULL DEFAULT 0,
  total_usd numeric(18,4) NOT NULL DEFAULT 0,
  costo_unitario_usd numeric(18,8) NOT NULL DEFAULT 0,
  UNIQUE (importacion_id, linea),
  UNIQUE (importacion_id, producto_codigo)
);

CREATE TABLE IF NOT EXISTS importacion_gasto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  importacion_id uuid NOT NULL REFERENCES importacion(id) ON DELETE CASCADE,
  descripcion text NOT NULL,
  monto_usd numeric(18,4) NOT NULL CHECK (monto_usd > 0),
  proveedor_id uuid REFERENCES proveedor(id),
  fecha date
);
CREATE INDEX IF NOT EXISTS importacion_gasto_imp_idx ON importacion_gasto(importacion_id);
