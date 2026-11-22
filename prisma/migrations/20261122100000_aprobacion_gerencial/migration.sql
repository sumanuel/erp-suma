-- Aprobación gerencial como en el original (admaprobgerent + pedido por aprobar): una tabla de reglas y, al cerrar el pedido, el que incumpla una regla activa
-- queda POR_APROBAR hasta que un gerente (permiso ventas.aprobar) lo apruebe o rechace.
CREATE TABLE IF NOT EXISTS regla_aprobacion (
  id smallint PRIMARY KEY,
  descripcion text NOT NULL,
  monto numeric(18,4) NOT NULL DEFAULT 0 CHECK (monto >= 0),
  activa boolean NOT NULL DEFAULT false,
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
INSERT INTO regla_aprobacion (id, descripcion, monto, activa) VALUES
  (1, 'Aprobación gerencial de pedidos (interruptor general)', 0, false),
  (2, 'Condición de pago del cliente (el monto es el código de la condición)', 0, false),
  (3, 'Mora del cliente (facturas vencidas)', 0, false),
  (4, 'Límite de crédito del cliente', 0, false),
  (5, 'Máximo Dtco. a otorgar en Precio (el monto es el % máximo)', 0, false)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE pedido_venta DROP CONSTRAINT IF EXISTS pedido_venta_estado_valido;
ALTER TABLE pedido_venta ADD CONSTRAINT pedido_venta_estado_valido CHECK (estado IN ('BORRADOR','POR_APROBAR','CONFIRMADO','FACTURADO','ANULADO'));
ALTER TABLE pedido_venta
  ADD COLUMN IF NOT EXISTS regla_rechazo_id smallint REFERENCES regla_aprobacion(id),
  ADD COLUMN IF NOT EXISTS aprobacion_estado text CHECK (aprobacion_estado IN ('APROBADO','RECHAZADO')),
  ADD COLUMN IF NOT EXISTS aprobado_por_id uuid,
  ADD COLUMN IF NOT EXISTS aprobado_por_nombre text,
  ADD COLUMN IF NOT EXISTS aprobado_en timestamptz,
  ADD COLUMN IF NOT EXISTS aprobacion_motivo text;

-- Quien podía cambiar precios o aprobar ya tiene el permiso de aprobar pedidos solo si lo tenía antes (no se concede nada nuevo).
