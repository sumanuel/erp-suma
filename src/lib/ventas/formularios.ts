import "server-only";
import type { Db } from "@/lib/tenant";
import type { CondicionesInicial, DatosVentaForm } from "@/components/ventas/condiciones-venta";

// Datos que necesitan los formularios de cotización, pedido y factura para proponer las condiciones del cliente elegido.

const t = (n: unknown) => String(Number(n ?? 0));

export async function datosVentaForm(db: Db, incluirClienteId?: string): Promise<{ datos: DatosVentaForm; clientes: { valor: string; etiqueta: string }[] }> {
  const [clientes, vendedores, condiciones, transportes] = await Promise.all([
    db.cliente.findMany({
      where: incluirClienteId ? { OR: [{ activo: true }, { id: incluirClienteId }] } : { activo: true },
      orderBy: { razonSocial: "asc" },
      select: { id: true, razonSocial: true, documento: true, listaPrecio: true, vendedorId: true, condicionPagoId: true, condicionPago: { select: { dias: true } }, transporteId: true, direccionEnvio: true, direccion: true, descuento1: true, descuento2: true, descuento3: true },
    }),
    db.vendedor.findMany({ where: { activo: true, esVendedor: true }, orderBy: { nombre: "asc" }, select: { id: true, codigo: true, nombre: true } }),
    db.condicionPago.findMany({ where: { activo: true }, orderBy: { dias: "asc" }, select: { id: true, nombre: true, dias: true } }),
    db.transporte.findMany({ where: { activo: true }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true } }),
  ]);
  return {
    clientes: clientes.map((c) => ({ valor: c.id, etiqueta: `${c.razonSocial} (${c.documento})` })),
    datos: {
      clientes: Object.fromEntries(clientes.map((c) => [c.id, {
        lista: c.listaPrecio, vendedorId: c.vendedorId ?? "", condicionPagoId: c.condicionPagoId ?? "", diasCondicion: c.condicionPago?.dias ?? 0, transporteId: c.transporteId ?? "",
        direccionEnvio: c.direccionEnvio ?? c.direccion ?? "", descuentos: [t(c.descuento1), t(c.descuento2), t(c.descuento3)] as [string, string, string],
      }])),
      vendedores: vendedores.map((v) => ({ valor: v.id, etiqueta: `${v.nombre} (${v.codigo})` })),
      condiciones: condiciones.map((c) => ({ valor: c.id, etiqueta: c.nombre, dias: c.dias })),
      transportes: transportes.map((x) => ({ valor: x.id, etiqueta: x.nombre })),
    },
  };
}

/** Condiciones guardadas en un documento, como las espera el formulario. */
export const condicionesDe = (x: { vendedorId: string | null; condicionPagoId: string | null; transporteId: string | null; direccionEntrega: string | null; descuentoGlobal1: unknown; descuentoGlobal2: unknown; descuentoGlobal3: unknown }): CondicionesInicial => ({
  vendedorId: x.vendedorId ?? "", condicionPagoId: x.condicionPagoId ?? "", transporteId: x.transporteId ?? "", direccionEntrega: x.direccionEntrega ?? "",
  descuentos: [t(x.descuentoGlobal1), t(x.descuentoGlobal2), t(x.descuentoGlobal3)],
});
