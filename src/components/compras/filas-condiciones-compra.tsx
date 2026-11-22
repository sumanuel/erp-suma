import type { Db } from "@/lib/tenant";
import { formatoFecha } from "@/app/(app)/compras/formato";

type Orden = { condicionPagoId: string | null; transporteId: string | null; centroCostoId: string | null; referencia: string | null; moneda: string; valorCambio: unknown; descuentoGlobal1: unknown; descuentoGlobal2: unknown; descuentoGlobal3: unknown };
type Documento = { fechaRecepcion: Date | null; fechaLibro: Date | null; recibidoPor: string | null; planillaImportacion: string | null; condicionPagoId: string | null; transporteId: string | null; centroCostoId: string | null; cuentaGastoId: string | null; lineas: { porcentaje: unknown; base: unknown; iva: unknown }[] };

async function nombres(db: Db, x: { condicionPagoId: string | null; transporteId: string | null; centroCostoId: string | null }) {
  const [c, t, k] = await Promise.all([
    x.condicionPagoId ? db.condicionPago.findUnique({ where: { id: x.condicionPagoId }, select: { nombre: true } }) : null,
    x.transporteId ? db.transporte.findUnique({ where: { id: x.transporteId }, select: { nombre: true } }) : null,
    x.centroCostoId ? db.centroCosto.findUnique({ where: { id: x.centroCostoId }, select: { codigo: true, nombre: true } }) : null,
  ]);
  return { condicion: c?.nombre ?? "—", transporte: t?.nombre ?? "—", centro: k ? `${k.codigo} · ${k.nombre}` : "—" };
}
const dato = (titulo: string, valor: string) => <div><dt className="text-gris-500">{titulo}</dt><dd>{valor}</dd></div>;

/** Filas con las condiciones de una orden de compra, para su detalle. */
export async function FilasCondicionesCompra({ db, doc }: { db: Db; doc: Orden }) {
  const n = await nombres(db, doc);
  const d = [doc.descuentoGlobal1, doc.descuentoGlobal2, doc.descuentoGlobal3].map(Number).filter((x) => x > 0);
  return (
    <>
      {dato("Condición de pago", n.condicion)}
      {dato("Transporte", n.transporte)}
      {dato("Centro de costo", n.centro)}
      {dato("Referencia del proveedor", doc.referencia ?? "—")}
      {dato("Moneda", doc.moneda === "VES" ? `Bolívares (cambio ${Number(doc.valorCambio).toLocaleString("es-VE", { maximumFractionDigits: 8 })})` : "Dólares (USD)")}
      {dato("Descuentos del documento", d.length ? `${d.join(" + ")} %` : "—")}
    </>
  );
}

/** Filas con los datos del documento del proveedor: fechas, recepción, condiciones y desglose por alícuota. */
export async function FilasDocumentoProveedor({ db, f }: { db: Db; f: Documento }) {
  const n = await nombres(db, f);
  const cuenta = f.cuentaGastoId ? await db.cuentaContable.findUnique({ where: { id: f.cuentaGastoId }, select: { codigo: true, nombre: true } }) : null;
  return (
    <>
      {dato("Fecha de recepción", formatoFecha(f.fechaRecepcion))}
      {dato("Fecha del libro de compras", formatoFecha(f.fechaLibro))}
      {dato("Recibido por", f.recibidoPor ?? "—")}
      {dato("Planilla de importación", f.planillaImportacion ?? "—")}
      {dato("Condición de pago", n.condicion)}
      {dato("Transporte", n.transporte)}
      {dato("Centro de costo", n.centro)}
      {dato("Cuenta de la base", cuenta ? `${cuenta.codigo} ${cuenta.nombre}` : "Compras de mercancía")}
      {f.lineas.length ? <div className="sm:col-span-2 xl:col-span-4"><dt className="text-gris-500">Desglose por alícuota (USD)</dt><dd>{f.lineas.map((l) => `${Number(l.porcentaje)} %: base ${Number(l.base).toLocaleString("es-VE", { minimumFractionDigits: 2 })} · IVA ${Number(l.iva).toLocaleString("es-VE", { minimumFractionDigits: 2 })}`).join("  |  ")}</dd></div> : null}
    </>
  );
}
