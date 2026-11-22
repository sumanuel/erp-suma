import Link from "next/link";
import { notFound } from "next/navigation";
import { Etiqueta, Tarjeta } from "@/components/ui";
import { requerirPermiso, tienePermiso } from "@/lib/dal";
import { numeroFactura } from "@/lib/facturacion/estados";
import { ESTADOS_TURNO, FORMAS_PAGO_POS, numeroTurno, numeroVentaPos, type EstadoTurno } from "@/lib/pos/estados";
import { resumenTurno } from "@/lib/pos/servicio";
import { formatoFechaHora } from "../../../facturacion/formato";
import { FormularioCierre } from "./formulario-cierre";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const m = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function DetalleTurno({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const ctx = await requerirPermiso("pos", "ver");
  const r = await resumenTurno(ctx.db, id);
  if (!r) notFound();
  const { turno: t } = r;
  const supervisa = tienePermiso(ctx, "pos", "editar");
  if (t.usuarioId !== ctx.usuario.id && !supervisa) notFound();
  const e = ESTADOS_TURNO[t.estado as EstadoTurno];
  const puedeCerrar = t.estado === "ABIERTO" && (t.usuarioId === ctx.usuario.id || supervisa) && tienePermiso(ctx, "pos", "crear");
  const dato = (titulo: string, valor: string) => <div><dt className="text-gris-500">{titulo}</dt><dd className="font-medium">{valor}</dd></div>;
  return (
    <div className="flex flex-col gap-6">
      <Tarjeta className="p-6">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-semibold">{numeroTurno(t.numero)}</h2>
          <Etiqueta tono={e.tono}>{e.etiqueta}</Etiqueta>
          <Link href="/pos" className="ml-auto text-sm font-medium text-marca-fuerte hover:underline">Volver a vender</Link>
        </div>
        <dl className="mt-4 grid gap-4 text-[13.5px] sm:grid-cols-2 xl:grid-cols-4">
          {dato("Cajero", t.usuarioNombre)}
          {dato("Abierto", formatoFechaHora(t.abiertoEn))}
          {dato("Cerrado", formatoFechaHora(t.cerradoEn))}
          {dato("Ventas", `${t.ventas.length} · ${m(r.totalUsd)} USD`)}
          {dato("Fondo inicial", `${m(Number(t.fondoVes))} Bs. · ${m(Number(t.fondoUsd))} USD`)}
          {dato("Vueltos entregados", `${m(r.vueltos.VES)} Bs. · ${m(r.vueltos.USD)} USD`)}
          {dato(t.estado === "ABIERTO" ? "Debe haber ahora en caja" : "Debía haber al cerrar", `${m(r.esperado.ves)} Bs. · ${m(r.esperado.usd)} USD`)}
          {t.estado === "CERRADO" ? dato("Contado", `${m(Number(t.contadoVes))} Bs. · ${m(Number(t.contadoUsd))} USD`) : null}
        </dl>
        {t.estado === "CERRADO" ? (
          <p className="mt-4 text-[13.5px]">
            Diferencia: <span className={Math.abs(Number(t.contadoVes) - Number(t.esperadoVes)) < 0.005 ? "" : "font-semibold text-error"}>{m(Number(t.contadoVes) - Number(t.esperadoVes))} Bs.</span> ·{" "}
            <span className={Math.abs(Number(t.contadoUsd) - Number(t.esperadoUsd)) < 0.005 ? "" : "font-semibold text-error"}>{m(Number(t.contadoUsd) - Number(t.esperadoUsd))} USD</span>
            {t.observaciones ? <> · {t.observaciones}</> : null}
          </p>
        ) : null}
      </Tarjeta>

      {puedeCerrar ? <FormularioCierre turnoId={t.id} /> : null}

      <Tarjeta>
        <h3 className="px-4 pt-4 text-[13px] font-semibold uppercase tracking-wide text-gris-600">Cobrado por forma de pago</h3>
        <table className="mt-2 w-full text-left text-[13.5px]">
          <tbody>
            {r.cobrado.length === 0 ? <tr><td className="px-4 py-6 text-center text-gris-500">Sin cobros todavía.</td></tr> : r.cobrado.map((c) => (
              <tr key={`${c.forma}${c.moneda}`} className="border-t border-linea">
                <td className="px-4 py-2.5">{FORMAS_PAGO_POS[c.forma as keyof typeof FORMAS_PAGO_POS] ?? c.forma}</td>
                <td className="px-4 py-2.5">{c.moneda === "USD" ? "Dólares" : "Bolívares"}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{m(c.monto)} {c.moneda === "USD" ? "USD" : "Bs."}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Tarjeta>

      <Tarjeta>
        <h3 className="px-4 pt-4 text-[13px] font-semibold uppercase tracking-wide text-gris-600">Ventas del turno</h3>
        <table className="mt-2 w-full text-left text-[13.5px]">
          <thead><tr className="border-y border-linea text-[12.5px] text-gris-600"><th className="px-4 py-2.5 font-medium">Venta</th><th className="px-4 py-2.5 font-medium">Factura</th><th className="px-4 py-2.5 font-medium">Hora</th><th className="px-4 py-2.5 text-right font-medium">Total USD</th><th className="px-4 py-2.5 text-right font-medium">Vuelto</th></tr></thead>
          <tbody>
            {t.ventas.length === 0 ? <tr><td colSpan={5} className="px-4 py-6 text-center text-gris-500">Sin ventas todavía.</td></tr> : t.ventas.map((v) => {
              const f = r.facturas.get(v.facturaId);
              return (
                <tr key={v.id} className="border-b border-linea last:border-0 hover:bg-hover">
                  <td className="px-4 py-2.5"><Link href={`/pos/ventas/${v.id}`} className="font-semibold text-marca-fuerte hover:underline">{numeroVentaPos(v.numero)}</Link></td>
                  <td className="px-4 py-2.5">{f ? numeroFactura(f.numero) : "—"}{f?.estado === "ANULADA" ? " (anulada)" : ""}</td>
                  <td className="px-4 py-2.5">{formatoFechaHora(v.creadoEn)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{f ? m(Number(f.total)) : "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{Number(v.vueltoMonto) > 0 ? `${m(Number(v.vueltoMonto))} ${v.vueltoMoneda === "USD" ? "USD" : "Bs."}` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Tarjeta>
    </div>
  );
}
