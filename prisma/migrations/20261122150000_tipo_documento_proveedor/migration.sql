-- Tipo de documento del proveedor (original: admtipdocpro / pagaré): factura, pagaré u otro documento por pagar.
ALTER TABLE factura_compra ADD COLUMN IF NOT EXISTS tipo_documento text NOT NULL DEFAULT 'FACTURA' CHECK (tipo_documento IN ('FACTURA','PAGARE','OTRO'));
