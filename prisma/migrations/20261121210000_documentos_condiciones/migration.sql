-- Pedidos, cotizaciones y facturas con las condiciones del sistema anterior: vendedor, condición de pago, transporte, entrega y descuentos globales.

ALTER TABLE "pedido_venta"
  ADD COLUMN "vendedor_id" UUID,
  ADD COLUMN "condicion_pago_id" UUID,
  ADD COLUMN "transporte_id" UUID,
  ADD COLUMN "direccion_entrega" TEXT,
  ADD COLUMN "descuento_global_1" DECIMAL(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN "descuento_global_2" DECIMAL(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN "descuento_global_3" DECIMAL(7,4) NOT NULL DEFAULT 0;
ALTER TABLE "pedido_venta"
  ADD CONSTRAINT "pedido_venta_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "vendedor"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "pedido_venta_condicion_pago_id_fkey" FOREIGN KEY ("condicion_pago_id") REFERENCES "condicion_pago"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "pedido_venta_transporte_id_fkey" FOREIGN KEY ("transporte_id") REFERENCES "transporte"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "pedido_venta_descuentos_globales_validos" CHECK ("descuento_global_1" BETWEEN 0 AND 100 AND "descuento_global_2" BETWEEN 0 AND 100 AND "descuento_global_3" BETWEEN 0 AND 100);
CREATE INDEX "pedido_venta_vendedor_id_idx" ON "pedido_venta"("vendedor_id");

ALTER TABLE "cotizacion"
  ADD COLUMN "vendedor_id" UUID,
  ADD COLUMN "condicion_pago_id" UUID,
  ADD COLUMN "transporte_id" UUID,
  ADD COLUMN "direccion_entrega" TEXT,
  ADD COLUMN "descuento_global_1" DECIMAL(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN "descuento_global_2" DECIMAL(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN "descuento_global_3" DECIMAL(7,4) NOT NULL DEFAULT 0;
ALTER TABLE "cotizacion"
  ADD CONSTRAINT "cotizacion_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "vendedor"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "cotizacion_condicion_pago_id_fkey" FOREIGN KEY ("condicion_pago_id") REFERENCES "condicion_pago"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "cotizacion_transporte_id_fkey" FOREIGN KEY ("transporte_id") REFERENCES "transporte"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "cotizacion_descuentos_globales_validos" CHECK ("descuento_global_1" BETWEEN 0 AND 100 AND "descuento_global_2" BETWEEN 0 AND 100 AND "descuento_global_3" BETWEEN 0 AND 100);
CREATE INDEX "cotizacion_vendedor_id_idx" ON "cotizacion"("vendedor_id");

ALTER TABLE "factura"
  ADD COLUMN "vendedor_id" UUID,
  ADD COLUMN "condicion_pago_id" UUID,
  ADD COLUMN "transporte_id" UUID,
  ADD COLUMN "direccion_entrega" TEXT,
  ADD COLUMN "descuento_global_1" DECIMAL(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN "descuento_global_2" DECIMAL(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN "descuento_global_3" DECIMAL(7,4) NOT NULL DEFAULT 0;
ALTER TABLE "factura"
  ADD CONSTRAINT "factura_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "vendedor"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "factura_condicion_pago_id_fkey" FOREIGN KEY ("condicion_pago_id") REFERENCES "condicion_pago"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "factura_transporte_id_fkey" FOREIGN KEY ("transporte_id") REFERENCES "transporte"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "factura_descuentos_globales_validos" CHECK ("descuento_global_1" BETWEEN 0 AND 100 AND "descuento_global_2" BETWEEN 0 AND 100 AND "descuento_global_3" BETWEEN 0 AND 100);
CREATE INDEX "factura_vendedor_id_idx" ON "factura"("vendedor_id");

ALTER TABLE "pedido_venta_linea" ADD COLUMN "descuento_linea" DECIMAL(7,4), ADD CONSTRAINT "pedido_venta_linea_descuento_linea_valido" CHECK ("descuento_linea" IS NULL OR "descuento_linea" BETWEEN 0 AND 100);
ALTER TABLE "cotizacion_linea" ADD COLUMN "descuento_linea" DECIMAL(7,4), ADD CONSTRAINT "cotizacion_linea_descuento_linea_valido" CHECK ("descuento_linea" IS NULL OR "descuento_linea" BETWEEN 0 AND 100);
ALTER TABLE "factura_linea" ADD COLUMN "descuento_linea" DECIMAL(7,4), ADD CONSTRAINT "factura_linea_descuento_linea_valido" CHECK ("descuento_linea" IS NULL OR "descuento_linea" BETWEEN 0 AND 100);
