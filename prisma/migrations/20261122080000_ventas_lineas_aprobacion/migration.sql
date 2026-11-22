-- Líneas de venta: bonificación (promoción «compra N, llévate M»), almacén por línea; factura: aprobación gerencial de excepciones de crédito.

ALTER TABLE "cotizacion_linea" ADD COLUMN "bonificacion" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "pedido_venta_linea" ADD COLUMN "bonificacion" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "almacen_id" UUID,
  ADD CONSTRAINT "pedido_venta_linea_almacen_fkey" FOREIGN KEY ("almacen_id") REFERENCES "almacen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "factura_linea" ADD COLUMN "bonificacion" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "almacen_id" UUID,
  ADD CONSTRAINT "factura_linea_almacen_fkey" FOREIGN KEY ("almacen_id") REFERENCES "almacen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Una bonificación no cuesta: precio 0.
ALTER TABLE "cotizacion_linea" ADD CONSTRAINT "cotizacion_linea_bonificacion_gratis" CHECK (NOT "bonificacion" OR "precio_unitario" = 0);
ALTER TABLE "pedido_venta_linea" ADD CONSTRAINT "pedido_venta_linea_bonificacion_gratis" CHECK (NOT "bonificacion" OR "precio_unitario" = 0);
ALTER TABLE "factura_linea" ADD CONSTRAINT "factura_linea_bonificacion_gratis" CHECK (NOT "bonificacion" OR "precio_unitario" = 0);

-- Aprobación gerencial: quien aprobó una excepción (límite de crédito, morosidad, vencidas) al emitir la factura.
ALTER TABLE "factura" ADD COLUMN "aprobado_por_id" UUID, ADD COLUMN "aprobado_por_nombre" TEXT, ADD COLUMN "aprobacion_motivo" TEXT,
  ADD CONSTRAINT "factura_aprobacion_completa" CHECK (("aprobado_por_nombre" IS NULL) = ("aprobacion_motivo" IS NULL));

-- Permiso especial «aprobación gerencial»: solo el administrador por ahora (se asigna a perfiles desde Seguridad).
