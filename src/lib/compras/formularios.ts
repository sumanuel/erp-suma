import "server-only";
import type { Db } from "@/lib/tenant";
import type { CondicionesCompraInicial, DatosCompraForm } from "@/components/compras/condiciones-compra";
import { tasaVigente } from "@/lib/tasas";

const t = (n: unknown) => String(Number(n ?? 0));

/** Catálogos y datos del proveedor que necesita el formulario de la orden de compra para proponer sus condiciones. */
export async function datosCompraForm(db: Db, incluirProveedorId?: string): Promise<{ datos: DatosCompraForm; proveedores: { valor: string; etiqueta: string }[] }> {
  const [proveedores, condiciones, transportes, centros, aranceles, tasa] = await Promise.all([
    db.proveedor.findMany({
      where: incluirProveedorId ? { OR: [{ activo: true }, { id: incluirProveedorId }] } : { activo: true },
      orderBy: { razonSocial: "asc" },
      select: { id: true, razonSocial: true, documento: true, condicionPagoId: true, descuento1: true, descuento2: true, descuento3: true, divisa: true },
    }),
    db.condicionPago.findMany({ where: { activo: true }, orderBy: { dias: "asc" }, select: { id: true, nombre: true } }),
    db.transporte.findMany({ where: { activo: true }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true } }),
    db.centroCosto.findMany({ where: { activo: true }, orderBy: { nombre: "asc" }, select: { id: true, codigo: true, nombre: true } }),
    db.arancel.findMany({ where: { activo: true }, orderBy: { codigo: "asc" }, select: { id: true, codigo: true, descripcion: true, porcentaje: true } }),
    tasaVigente(db, "USD"),
  ]);
  return {
    proveedores: proveedores.map((p) => ({ valor: p.id, etiqueta: `${p.razonSocial} (${p.documento})` })),
    datos: {
      proveedores: Object.fromEntries(proveedores.map((p) => [p.id, { condicionPagoId: p.condicionPagoId ?? "", descuentos: [t(p.descuento1), t(p.descuento2), t(p.descuento3)] as [string, string, string], divisa: (p.divisa === "VES" ? "VES" : "USD") as "USD" | "VES" }])),
      condiciones: condiciones.map((c) => ({ valor: c.id, etiqueta: c.nombre })),
      transportes: transportes.map((x) => ({ valor: x.id, etiqueta: x.nombre })),
      centros: centros.map((c) => ({ valor: c.id, etiqueta: `${c.codigo} · ${c.nombre}` })),
      aranceles: aranceles.map((a) => ({ valor: a.id, etiqueta: `${a.codigo} · ${a.descripcion} (${Number(a.porcentaje)} %)` })),
      tasa: tasa?.valor ?? null,
    },
  };
}

/** Condiciones guardadas en una orden, como las espera el formulario. */
export const condicionesDeOrden = (o: { condicionPagoId: string | null; transporteId: string | null; centroCostoId: string | null; referencia: string | null; moneda: string; valorCambio: unknown; descuentoGlobal1: unknown; descuentoGlobal2: unknown; descuentoGlobal3: unknown }): CondicionesCompraInicial => ({
  condicionPagoId: o.condicionPagoId ?? "", transporteId: o.transporteId ?? "", centroCostoId: o.centroCostoId ?? "", referencia: o.referencia ?? "", moneda: o.moneda === "VES" ? "VES" : "USD",
  valorCambio: o.valorCambio ? String(Number(o.valorCambio)) : "", descuentos: [t(o.descuentoGlobal1), t(o.descuentoGlobal2), t(o.descuentoGlobal3)],
});
