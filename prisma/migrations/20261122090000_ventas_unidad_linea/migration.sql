-- Unidad de venta por línea: la línea sigue en unidades base (cantidad y precio_unitario); `presentacion_id` y `factor` dicen en qué presentación se vendió
-- (cantidad mostrada = cantidad / factor; precio mostrado = precio_unitario * factor). El precio base pasa a 8 decimales para que cajas × precio no pierda centavos.
ALTER TABLE cotizacion_linea ALTER COLUMN precio_unitario TYPE numeric(18,8);
ALTER TABLE pedido_venta_linea ALTER COLUMN precio_unitario TYPE numeric(18,8);
ALTER TABLE factura_linea ALTER COLUMN precio_unitario TYPE numeric(18,8);

ALTER TABLE cotizacion_linea ADD COLUMN IF NOT EXISTS presentacion_id uuid REFERENCES producto_presentacion(id), ADD COLUMN IF NOT EXISTS factor numeric(18,4) NOT NULL DEFAULT 1 CHECK (factor > 0);
ALTER TABLE pedido_venta_linea ADD COLUMN IF NOT EXISTS presentacion_id uuid REFERENCES producto_presentacion(id), ADD COLUMN IF NOT EXISTS factor numeric(18,4) NOT NULL DEFAULT 1 CHECK (factor > 0);
ALTER TABLE factura_linea ADD COLUMN IF NOT EXISTS presentacion_id uuid REFERENCES producto_presentacion(id), ADD COLUMN IF NOT EXISTS factor numeric(18,4) NOT NULL DEFAULT 1 CHECK (factor > 0);
