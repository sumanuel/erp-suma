import Link from "next/link";
import { notFound } from "next/navigation";
import { Tarjeta } from "@/components/ui";
import { requerirPermiso } from "@/lib/dal";
import { numeroFactura } from "@/lib/facturacion/estados";
import { FORMAS_PAGO_POS, numeroTurno, numeroVentaPos } from "@/lib/pos/estados";
import { formatoFechaHora } from "../../../facturacion/formato";
import { BotonImprimir } from "../../../reportes/[reporte]/imprimir";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const m = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Recibo NO fiscal de una venta de mostrador. El comprobante fiscal es la factura (número fiscal y de control los da la impresora fiscal).
export default async function ReciboVenta({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { db } = await requerirPermiso("pos", "ver");
  const v = await db.ventaPos.findUnique({ where: { id }, include: { pagos: true, turno: { select: { id: true, numero: true, usuarioNombre: true } } } });
  if (!v) notFound();
  const [f, cliente] = await Promise.all([
    db.factura.findUniqueOrThrow({ where: { id: v.facturaId }, include: { lineas: { orderBy: { linea: "asc" } } } }),
    db.cliente.findUniqueOrThrow({ where: { id: v.clienteId }, select: { razonSocial: true, documento: true } }),
  ]);
  const empresa = await db.empresa.findUnique({ where: { id: 1 } });
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <div className="flex items-center justify-between print:hidden">
        <Link href={`/pos/turnos/${v.turno.id}`} className="text-sm font-medium text-marca-fuerte hover:underline">← {numeroTurno(v.turno.numero)}</Link>
        <BotonImprimir />
      </div>
      <Tarjeta className="p-6 text-[13px]">
        <div className="text-center">
          <p className="text-[15px] font-semibold">{empresa?.razonSocial ?? "Recibo de venta"}</p>
          {empresa?.rif ? <p className="text-gris-600">RIF {empresa.rif}</p> : null}
          <p className="mt-1 text-gris-600">Recibo no fiscal · {numeroVentaPos(v.numero)}</p>
          <p className="text-gris-600">Factura {numeroFactura(f.numero)} · {formatoFechaHora(v.creadoEn)}</p>
          <p className="text-gris-600">Cajero: {v.turno.usuarioNombre}</p>
        </div>
        <p className="mt-3 border-t border-dashed border-borde pt-3">Cliente: {cliente.razonSocial} ({cliente.documento})</p>
        <table className="mt-3 w-full text-left">
          <thead><tr className="border-y border-dashed border-borde text-[12px] text-gris-600"><th className="py-1.5 font-medium">Descripción</th><th className="py-1.5 text-right font-medium">Cant.</th><th className="py-1.5 text-right font-medium">Total USD</th></tr></thead>
          <tbody>
            {f.lineas.map((l) => (
              <tr key={l.id}>
                <td className="py-1 pr-2">{l.descripcion}<span className="block text-[11.5px] text-gris-500">{m(Number(l.precioUnitario))} USD{Number(l.descuento) > 0 ? ` · desc. ${Number(l.descuento)} %` : ""}{Number(l.ivaPorcentaje) > 0 ? ` · IVA ${Number(l.ivaPorcentaje)} %` : " · exento"}</span></td>
                <td className="py-1 text-right tabular-nums">{Number(l.cantidad).toLocaleString("es-VE", { maximumFractionDigits: 4 })}</td>
                <td className="py-1 text-right tabular-nums">{m(Number(l.total))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="mt-3 flex flex-col gap-1 border-t border-dashed border-borde pt-3">
          <div className="flex justify-between"><dt>Subtotal</dt><dd className="tabular-nums">{m(Number(f.subtotal))} USD</dd></div>
          <div className="flex justify-between"><dt>IVA</dt><dd className="tabular-nums">{m(Number(f.iva))} USD</dd></div>
          <div className="flex justify-between text-[15px] font-semibold"><dt>Total USD</dt><dd className="tabular-nums">{m(Number(f.total))}</dd></div>
          <div className="flex justify-between text-[15px] font-semibold"><dt>Total Bs. (tasa {Number(f.tasaUsd).toLocaleString("es-VE", { maximumFractionDigits: 8 })})</dt><dd className="tabular-nums">{m(Number(f.totalBs))}</dd></div>
        </dl>
        <div className="mt-3 border-t border-dashed border-borde pt-3">
          <p className="font-medium">Pagos</p>
          {v.pagos.map((p) => (
            <div key={p.id} className="flex justify-between"><span>{FORMAS_PAGO_POS[p.formaPago as keyof typeof FORMAS_PAGO_POS] ?? p.formaPago}{p.referencia ? ` · ref. ${p.referencia}` : ""}</span><span className="tabular-nums">{m(Number(p.recibido))} {p.moneda === "USD" ? "USD" : "Bs."}</span></div>
          ))}
          {Number(v.vueltoMonto) > 0 ? <div className="mt-1 flex justify-between font-semibold"><span>Vuelto</span><span className="tabular-nums">{m(Number(v.vueltoMonto))} {v.vueltoMoneda === "USD" ? "USD" : "Bs."}</span></div> : null}
        </div>
        <p className="mt-4 text-center text-[12px] text-gris-500">Gracias por su compra</p>
      </Tarjeta>
    </div>
  );
}
