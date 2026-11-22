import { z } from "zod";

// Encabezado comercial que mandan los formularios de cotización, pedido y factura. El servidor lo vuelve a validar contra la base.
const idOpcional = z.string().uuid().nullable();
export const EncabezadoVentaZ = z.object({
  vendedorId: idOpcional,
  condicionPagoId: idOpcional,
  transporteId: idOpcional,
  direccionEntrega: z.string().trim().max(300).nullable().transform((v) => v || null),
  descuentos: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]),
});
