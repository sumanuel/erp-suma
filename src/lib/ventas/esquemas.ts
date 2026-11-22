import { z } from "zod";

// Encabezado comercial que mandan los formularios de cotización, pedido y factura. El servidor lo vuelve a validar contra la base.
const idOpcional = z.string().uuid().nullable();
export const EncabezadoVentaZ = z.object({
  vendedorId: idOpcional,
  condicionPagoId: idOpcional,
  transporteId: idOpcional,
  direccionEntrega: z.string().trim().max(300).nullable().transform((v) => v || null),
  descuentos: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]),
  origenVentaId: idOpcional.optional(),
  bultos: z.number().int().min(0).max(1_000_000).nullable().optional(),
  kilos: z.number().finite().min(0).max(1e9).nullable().optional(),
  /// [días 1, % 1, días 2, % 2]
  prontoPago: z.tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()]).nullable().optional(),
});
