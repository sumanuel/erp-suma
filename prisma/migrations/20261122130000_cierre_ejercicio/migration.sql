-- Cierre del ejercicio contable (original: frmComprobanteCierre): el asiento de cierre lleva los ingresos, costos y gastos del año a la cuenta de resultados.
CREATE TABLE IF NOT EXISTS ejercicio_contable (
  anio int PRIMARY KEY CHECK (anio BETWEEN 2000 AND 2100),
  fecha_cierre date NOT NULL,
  asiento_id uuid NOT NULL REFERENCES asiento(id),
  resultado_bs numeric(18,2) NOT NULL,
  cerrado_por_id uuid,
  cerrado_por_nombre text,
  cerrado_en timestamptz NOT NULL DEFAULT now()
);

-- Cuentas y conceptos nuevos para los clientes que ya existen (anticipos de clientes y resultado del ejercicio).
INSERT INTO cuenta_contable (codigo, nombre, tipo, padre_id, nivel, posteable)
SELECT '2.1.05', 'Anticipos de clientes', 'PASIVO', (SELECT id FROM cuenta_contable WHERE codigo = '2.1'), 3, true
WHERE EXISTS (SELECT 1 FROM cuenta_contable WHERE codigo = '2.1') AND NOT EXISTS (SELECT 1 FROM cuenta_contable WHERE codigo = '2.1.05');
INSERT INTO cuenta_concepto (concepto, cuenta_id) SELECT 'ANTICIPO_CLIENTES', id FROM cuenta_contable WHERE codigo = '2.1.05' ON CONFLICT (concepto) DO NOTHING;
INSERT INTO cuenta_concepto (concepto, cuenta_id) SELECT 'RESULTADO_EJERCICIO', id FROM cuenta_contable WHERE codigo = '3.1.02' ON CONFLICT (concepto) DO NOTHING;
