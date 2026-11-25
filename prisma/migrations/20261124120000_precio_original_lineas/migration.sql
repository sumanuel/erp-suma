-- Precio que proponía el sistema (lista o promoción) por unidad base al hacer la línea, para el listado «Precios cambiados»
-- (original: adminvmov.mov_precio_ini). Las líneas anteriores quedan sin dato.
ALTER TABLE "pedido_venta_linea" ADD COLUMN "precio_original" DECIMAL(18,8);
ALTER TABLE "factura_linea" ADD COLUMN "precio_original" DECIMAL(18,8);
