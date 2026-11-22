-- Ubicación física del producto (original: ubicación en la ficha del producto).
ALTER TABLE producto ADD COLUMN IF NOT EXISTS ubicacion_id uuid REFERENCES ubicacion_fisica(id) ON DELETE SET NULL;
