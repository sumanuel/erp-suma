import "server-only";
import type { Db } from "@/lib/tenant";
import { registrarCambio } from "@/lib/auditoria";
import { MovimientoRechazado, type Actor } from "@/lib/inventario/movimientos";
import { PedidoError } from "@/lib/pedidos/servicio";
import { auditarEmision, emitirFacturaDePedidoEnTx, emitirFacturaEnTx, FacturaError, type DatosFactura, type ResultadoFactura } from "./servicio";
import { CobroError, cobrarEnTx } from "@/lib/cxc/servicio";
import { FORMAS_PAGO, numeroRecibo } from "@/lib/cxc/estados";
import { ContaError } from "@/lib/contabilidad/servicio";
import { intercambioVuelto, TesoreriaRechazada } from "@/lib/tesoreria/movimientos";
import { VentaError } from "@/lib/ventas/condiciones";
import { repartirPagos, type PagoContado } from "@/lib/ventas/reparto-pagos";
import { siguienteNumero } from "@/lib/numeracion";
import { numeroFactura } from "./estados";

// Factura de contado cobrada en el momento (original: panel «Cancelar factura» del formulario de facturación). Todo es UNA transacción: la
// factura (inventario y asiento), un recibo de ingreso con un cobro por cada forma de pago y el vuelto. Si algo falla no queda nada.

export type PagoFactura = PagoContado & { cuentaId: string; referencia?: string | null };
export type CobroFactura = {
  pagos: PagoFactura[];
  /// Moneda del vuelto (por omisión, la del pago en efectivo que lo generó) y la caja de donde sale si es la otra moneda.
  monedaVuelto?: "USD" | "VES";
  cajaVueltoId?: string | null;
};
export type DocumentoAFacturar =
  | { pedidoId: null; datos: DatosFactura }
  | { pedidoId: string; almacenId: string; observaciones: string | null; aprobacion?: DatosFactura["aprobacion"] };
export type VueltoFactura = { moneda: string; monto: number } | null;

const decimales = (n: number) => (String(n).split(".")[1] ?? "").length;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export async function facturarYCobrar(db: Db, actor: Actor, doc: DocumentoAFacturar, cobro: CobroFactura): Promise<ResultadoFactura<{ id: string; numero: number; reciboNumero: number; vuelto: VueltoFactura }>> {
  try {
    const { pagos } = cobro;
    if (pagos.length === 0) throw new FacturaError("Indica cómo paga el cliente.");
    if (pagos.length > 10) throw new FacturaError("Máximo 10 formas de pago por factura.");
    for (const p of pagos) {
      if (!(p.formaPago in FORMAS_PAGO)) throw new FacturaError("Forma de pago inválida.");
      if (p.moneda !== "USD" && p.moneda !== "VES") throw new FacturaError("Moneda de pago inválida.");
      if (!(p.recibido > 0) || decimales(p.recibido) > 2 || p.recibido > 1e12) throw new FacturaError("Cada pago debe ser un monto mayor que 0 con máximo 2 decimales.");
      if (!p.cuentaId) throw new FacturaError("Elige la caja o cuenta que recibe cada pago.");
      if (p.formaPago === "CHEQUE" && !p.referencia?.trim()) throw new FacturaError("Indica el número del cheque.");
    }

    const r = await db.$transaction(async (tx) => {
      const fac = doc.pedidoId === null
        ? await emitirFacturaEnTx(tx, actor, { ...doc.datos, diasCredito: 0 })
        : await emitirFacturaDePedidoEnTx(tx, actor, doc.pedidoId, doc.almacenId, doc.observaciones, 0, doc.aprobacion);
      const f = await tx.factura.findUniqueOrThrow({ where: { id: fac.id }, select: { total: true, totalBs: true, tasaUsd: true, clienteId: true } });
      const tasa = Number(f.tasaUsd);
      const plan = repartirPagos(Number(f.total), Number(f.totalBs), tasa, pagos, (x) => FORMAS_PAGO[x as keyof typeof FORMAS_PAGO]);
      if ("error" in plan) throw new FacturaError(plan.error);
      const documento = numeroFactura(fac.numero);

      const ultimo = plan.reparto[plan.reparto.length - 1];
      let vuelto: VueltoFactura = null;
      if (ultimo.exceso > 0) {
        const moneda = cobro.monedaVuelto ?? (ultimo.p.moneda as "USD" | "VES");
        vuelto = { moneda, monto: moneda === ultimo.p.moneda ? ultimo.exceso : r2(ultimo.p.moneda === "USD" ? ultimo.exceso * tasa : ultimo.exceso / tasa) };
        if (!(vuelto.monto > 0)) throw new FacturaError("El vuelto es demasiado pequeño para cambiarlo de moneda.");
        if (moneda !== ultimo.p.moneda && !cobro.cajaVueltoId) throw new FacturaError("Elige la caja de donde sale el vuelto.");
      }

      const recibo = await tx.reciboCobro.create({
        data: { numero: await siguienteNumero(tx, "RECIBO_COBRO"), clienteId: f.clienteId, fecha: fac.fecha, cobradorId: null, observaciones: `Contado ${documento}${vuelto ? ` · vuelto ${vuelto.monto} ${vuelto.moneda}` : ""}`, creadoPorId: actor.id, creadoPorNombre: actor.nombre },
        select: { id: true, numero: true },
      });
      for (const x of plan.reparto) {
        const referencia = x.p.referencia?.trim().slice(0, 60) || null;
        await cobrarEnTx(
          tx, actor,
          { clienteId: f.clienteId, formaPago: x.p.formaPago, moneda: x.p.moneda, cuentaId: x.p.cuentaId, referencia, numeroCheque: x.p.formaPago === "CHEQUE" ? referencia : null, observaciones: `Contado ${documento}`, aplicaciones: [{ facturaId: fac.id, montoUsd: x.montoUsd }], reciboId: recibo.id },
          [{ facturaId: fac.id, montoUsd: x.montoUsd }],
          { montoMoneda: x.montoMoneda },
        );
      }
      // El vuelto en la misma moneda ya quedó fuera del cobro; en la otra, entra el excedente a una caja y sale de la otra.
      if (vuelto && vuelto.moneda !== ultimo.p.moneda) {
        await intercambioVuelto(tx, actor, { recibeId: ultimo.p.cuentaId, montoRecibe: ultimo.exceso, entregaId: cobro.cajaVueltoId!, montoEntrega: vuelto.monto, documento });
      }
      return { fac, reciboNumero: recibo.numero, vuelto, pagos: plan.reparto.length };
    });
    await auditarEmision(db, actor, r.fac, doc.pedidoId);
    await registrarCambio(db, actor, { modulo: "cxc", entidad: "recibo_cobro", entidadId: r.fac.id, descripcion: numeroRecibo(r.reciboNumero), accion: "crear", despues: { factura: numeroFactura(r.fac.numero), pagos: r.pagos, vuelto: r.vuelto ? `${r.vuelto.monto} ${r.vuelto.moneda}` : null } });
    return { ok: true, id: r.fac.id, numero: r.fac.numero, reciboNumero: r.reciboNumero, vuelto: r.vuelto };
  } catch (e) {
    if (e instanceof FacturaError || e instanceof PedidoError || e instanceof VentaError || e instanceof CobroError || e instanceof TesoreriaRechazada || e instanceof ContaError) return { ok: false, error: e.message };
    if (e instanceof MovimientoRechazado) return { ok: false, error: Object.values(e.errores)[0] ?? "No se pudo mover el inventario." };
    throw e;
  }
}
