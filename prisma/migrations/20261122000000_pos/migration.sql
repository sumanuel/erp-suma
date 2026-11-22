-- Punto de venta: turnos de caja, ventas de mostrador y sus pagos; y el vuelto entre cajas de distinta moneda en el libro de tesorería.

CREATE TABLE "turno_caja" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "numero" SERIAL NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'ABIERTO',
    "usuario_id" UUID NOT NULL,
    "usuario_nombre" TEXT NOT NULL,
    "almacen_id" UUID NOT NULL,
    "caja_ves_id" UUID NOT NULL,
    "caja_usd_id" UUID NOT NULL,
    "fondo_ves" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "fondo_usd" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "abierto_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cerrado_en" TIMESTAMPTZ(6),
    "contado_ves" DECIMAL(18,2),
    "contado_usd" DECIMAL(18,2),
    "esperado_ves" DECIMAL(18,2),
    "esperado_usd" DECIMAL(18,2),
    "observaciones" TEXT,
    CONSTRAINT "turno_caja_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "venta_pos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "numero" SERIAL NOT NULL,
    "turno_id" UUID NOT NULL,
    "factura_id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "vuelto_moneda" TEXT,
    "vuelto_monto" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "venta_pos_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "venta_pos_pago" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "venta_id" UUID NOT NULL,
    "cobro_id" UUID NOT NULL,
    "forma_pago" TEXT NOT NULL,
    "moneda" TEXT NOT NULL,
    "cuenta_id" UUID NOT NULL,
    "recibido" DECIMAL(18,2) NOT NULL,
    "aplicado" DECIMAL(18,2) NOT NULL,
    "referencia" TEXT,
    CONSTRAINT "venta_pos_pago_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "turno_caja_numero_key" ON "turno_caja"("numero");
CREATE INDEX "turno_caja_usuario_id_abierto_en_idx" ON "turno_caja"("usuario_id", "abierto_en" DESC);
-- Un usuario no puede tener dos turnos abiertos a la vez.
CREATE UNIQUE INDEX "turno_caja_un_abierto_por_usuario" ON "turno_caja"("usuario_id") WHERE "estado" = 'ABIERTO';
CREATE UNIQUE INDEX "venta_pos_numero_key" ON "venta_pos"("numero");
CREATE UNIQUE INDEX "venta_pos_factura_id_key" ON "venta_pos"("factura_id");
CREATE INDEX "venta_pos_turno_id_creado_en_idx" ON "venta_pos"("turno_id", "creado_en" DESC);
CREATE UNIQUE INDEX "venta_pos_pago_cobro_id_key" ON "venta_pos_pago"("cobro_id");
CREATE INDEX "venta_pos_pago_venta_id_idx" ON "venta_pos_pago"("venta_id");

ALTER TABLE "turno_caja"
  ADD CONSTRAINT "turno_caja_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "turno_caja_almacen_id_fkey" FOREIGN KEY ("almacen_id") REFERENCES "almacen"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "turno_caja_caja_ves_id_fkey" FOREIGN KEY ("caja_ves_id") REFERENCES "cuenta_tesoreria"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "turno_caja_caja_usd_id_fkey" FOREIGN KEY ("caja_usd_id") REFERENCES "cuenta_tesoreria"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "turno_caja_estado_valido" CHECK ("estado" IN ('ABIERTO','CERRADO')),
  ADD CONSTRAINT "turno_caja_cierre_coherente" CHECK (("estado" = 'CERRADO') = ("cerrado_en" IS NOT NULL)),
  ADD CONSTRAINT "turno_caja_fondos_validos" CHECK ("fondo_ves" >= 0 AND "fondo_usd" >= 0 AND ("contado_ves" IS NULL OR "contado_ves" >= 0) AND ("contado_usd" IS NULL OR "contado_usd" >= 0)),
  ADD CONSTRAINT "turno_caja_cajas_distintas" CHECK ("caja_ves_id" <> "caja_usd_id");
ALTER TABLE "venta_pos"
  ADD CONSTRAINT "venta_pos_turno_id_fkey" FOREIGN KEY ("turno_id") REFERENCES "turno_caja"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "venta_pos_factura_id_fkey" FOREIGN KEY ("factura_id") REFERENCES "factura"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "venta_pos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "venta_pos_vuelto_valido" CHECK ("vuelto_monto" >= 0 AND (("vuelto_monto" = 0) OR "vuelto_moneda" IN ('USD','VES')));
ALTER TABLE "venta_pos_pago"
  ADD CONSTRAINT "venta_pos_pago_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "venta_pos"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "venta_pos_pago_cobro_id_fkey" FOREIGN KEY ("cobro_id") REFERENCES "cobro"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "venta_pos_pago_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "cuenta_tesoreria"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "venta_pos_pago_moneda_valida" CHECK ("moneda" IN ('USD','VES')),
  ADD CONSTRAINT "venta_pos_pago_montos_validos" CHECK ("recibido" > 0 AND "aplicado" > 0 AND "aplicado" <= "recibido");

-- El libro de tesorería admite el vuelto entre cajas de distinta moneda (entra a una, sale de otra).
ALTER TABLE "movimiento_tesoreria" DROP CONSTRAINT "movimiento_tesoreria_tipo_valido";
ALTER TABLE "movimiento_tesoreria" ADD CONSTRAINT "movimiento_tesoreria_tipo_valido" CHECK ("tipo" IN ('SALDO_INICIAL','COBRO','PAGO','ANULACION_COBRO','ANULACION_PAGO','INGRESO','EGRESO','TRANSFERENCIA_ENTRADA','TRANSFERENCIA_SALIDA','ENTERO_IMPUESTO','ANULACION_ENTERO','VUELTO_ENTRADA','VUELTO_SALIDA'));
ALTER TABLE "movimiento_tesoreria" DROP CONSTRAINT "movimiento_tesoreria_signo_coherente";
ALTER TABLE "movimiento_tesoreria" ADD CONSTRAINT "movimiento_tesoreria_signo_coherente" CHECK (
  ("tipo" IN ('COBRO','ANULACION_PAGO','INGRESO','TRANSFERENCIA_ENTRADA','ANULACION_ENTERO','VUELTO_ENTRADA') AND "monto" > 0)
  OR ("tipo" IN ('PAGO','ANULACION_COBRO','EGRESO','TRANSFERENCIA_SALIDA','ENTERO_IMPUESTO','VUELTO_SALIDA') AND "monto" < 0)
  OR "tipo" = 'SALDO_INICIAL'
);
