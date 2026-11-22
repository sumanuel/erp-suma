import type { Db } from "@/lib/tenant";
import { descuentoGlobal } from "@/lib/pedidos/calculos";

type Doc = { vendedorId: string | null; condicionPagoId: string | null; transporteId: string | null; direccionEntrega: string | null; descuentoGlobal1: unknown; descuentoGlobal2: unknown; descuentoGlobal3: unknown };

/** Filas «Vendedor, condición de pago, transporte, entrega y descuentos» para el detalle de una cotización, pedido o factura. */
export async function FilasCondiciones({ db, doc }: { db: Db; doc: Doc }) {
  const [v, c, t] = await Promise.all([
    doc.vendedorId ? db.vendedor.findUnique({ where: { id: doc.vendedorId }, select: { nombre: true } }) : null,
    doc.condicionPagoId ? db.condicionPago.findUnique({ where: { id: doc.condicionPagoId }, select: { nombre: true } }) : null,
    doc.transporteId ? db.transporte.findUnique({ where: { id: doc.transporteId }, select: { nombre: true } }) : null,
  ]);
  const d = [doc.descuentoGlobal1, doc.descuentoGlobal2, doc.descuentoGlobal3].map(Number);
  const global = descuentoGlobal(d);
  return (
    <>
      <div><dt className="text-gris-500">Vendedor</dt><dd>{v?.nombre ?? "—"}</dd></div>
      <div><dt className="text-gris-500">Condición de pago</dt><dd>{c?.nombre ?? "—"}</dd></div>
      <div><dt className="text-gris-500">Transporte</dt><dd>{t?.nombre ?? "—"}</dd></div>
      <div><dt className="text-gris-500">Dirección de entrega</dt><dd>{doc.direccionEntrega ?? "—"}</dd></div>
      <div>
        <dt className="text-gris-500">Descuentos globales</dt>
        <dd>{global > 0 ? `${d.filter((x) => x > 0).join(" + ")} % (combinado ${global.toLocaleString("es-VE", { maximumFractionDigits: 4 })} %)` : "—"}</dd>
      </div>
    </>
  );
}
