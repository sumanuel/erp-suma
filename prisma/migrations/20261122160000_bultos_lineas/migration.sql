-- Bultos de un pedido (original: lbxBultos): a qué bulto va cada línea (lista de empaque).
ALTER TABLE pedido_venta_linea ADD COLUMN IF NOT EXISTS bulto int CHECK (bulto IS NULL OR (bulto >= 1 AND bulto <= 9999));
