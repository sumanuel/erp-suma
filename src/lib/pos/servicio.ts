import "server-only";
import type { Db } from "@/lib/tenant";
import { registrarCambio } from "@/lib/auditoria";
import { MovimientoRechazado, type Actor } from "@/lib/inventario/movimientos";
import { PedidoError, type LineaPedido } from "@/lib/pedidos/servicio";
import { auditarEmision, emitirFacturaEnTx, FacturaError } from "@/lib/facturacion/servicio";
import { CobroError, cobrarEnTx } from "@/lib/cxc/servicio";
import { ContaError } from "@/lib/contabilidad/servicio";
import { intercambioVuelto, TesoreriaRechazada } from "@/lib/tesoreria/movimientos";
import { VentaError, type EncabezadoVenta } from "@/lib/ventas/condiciones";
import { repartirPagos } from "@/lib/ventas/reparto-pagos";
import { esViolacionUnica } from "@/lib/formularios";
import { FORMAS_PAGO_POS, numeroTurno, numeroVentaPos } from "./estados";

// Punto de venta. Una venta es UNA transacción: factura de contado (con su inventario y su asiento), un cobro por cada forma de pago, el vuelto y el
// registro de la venta. Si cualquier paso falla no queda nada. El efectivo entra a las cajas del turno; el resto, a la cuenta que elija el cajero.

export class PosError extends Error {}
export type ResultadoPos<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function ejecutar<T>(trabajo: () => Promise<ResultadoPos<T>>): Promise<ResultadoPos<T>> {
  try {
    return await trabajo();
  } catch (e) {
    if (e instanceof PosError || e instanceof FacturaError || e instanceof CobroError || e instanceof TesoreriaRechazada || e instanceof ContaError || e instanceof VentaError || e instanceof PedidoError) return { ok: false, error: e.message };
    if (e instanceof MovimientoRechazado) return { ok: false, error: Object.values(e.errores)[0] ?? "No se pudo mover el inventario." };
    throw e;
  }
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const r4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;
const decimales = (n: number) => (String(n).split(".")[1] ?? "").length;
const montoValido = (n: number) => Number.isFinite(n) && n >= 0 && decimales(n) <= 2 && n <= 1e12;

// ---------- Turnos ----------

export type DatosApertura = { almacenId: string; cajaVesId: string; cajaUsdId: string; fondoVes: number; fondoUsd: number };

export async function abrirTurno(db: Db, actor: Actor, d: DatosApertura): Promise<ResultadoPos<{ id: string; numero: number }>> {
  return ejecutar(async () => {
    if (!montoValido(d.fondoVes) || !montoValido(d.fondoUsd)) throw new PosError("El fondo inicial debe ser un monto válido (máximo 2 decimales).");
    try {
      const t = await db.$transaction(async (tx) => {
        const [alm, ves, usd] = await Promise.all([
          tx.almacen.findUnique({ where: { id: d.almacenId }, select: { activo: true } }),
          tx.cuentaTesoreria.findUnique({ where: { id: d.cajaVesId }, select: { tipo: true, moneda: true, activo: true, codigo: true } }),
          tx.cuentaTesoreria.findUnique({ where: { id: d.cajaUsdId }, select: { tipo: true, moneda: true, activo: true, codigo: true } }),
        ]);
        if (!alm?.activo) throw new PosError("El almacén no existe o está inactivo.");
        if (!ves?.activo || ves.tipo !== "CAJA" || ves.moneda !== "VES") throw new PosError("La caja en bolívares debe ser una caja activa en Bs.");
        if (!usd?.activo || usd.tipo !== "CAJA" || usd.moneda !== "USD") throw new PosError("La caja en dólares debe ser una caja activa en USD.");
        return tx.turnoCaja.create({
          data: { usuarioId: actor.id, usuarioNombre: actor.nombre, almacenId: d.almacenId, cajaVesId: d.cajaVesId, cajaUsdId: d.cajaUsdId, fondoVes: d.fondoVes, fondoUsd: d.fondoUsd },
          select: { id: true, numero: true },
        });
      });
      await registrarCambio(db, actor, { modulo: "pos", entidad: "turno_caja", entidadId: t.id, descripcion: numeroTurno(t.numero), accion: "crear", despues: { fondoVes: d.fondoVes, fondoUsd: d.fondoUsd } });
      return { ok: true, id: t.id, numero: t.numero };
    } catch (e) {
      if (esViolacionUnica(e)) throw new PosError("Ya tienes un turno abierto: ciérralo antes de abrir otro.");
      throw e;
    }
  });
}

/** Lo que debería haber en cada caja: el fondo más todo lo que ese cajero movió en ellas desde que abrió el turno (cobros, vueltos, anulaciones…). */
export async function esperadoTurno(db: Db, t: { usuarioId: string; abiertoEn: Date; cajaVesId: string; cajaUsdId: string; fondoVes: unknown; fondoUsd: unknown }) {
  const suma = async (cuentaId: string) => {
    const x = await db.movimientoTesoreria.aggregate({ where: { cuentaId, usuarioId: t.usuarioId, fecha: { gte: t.abiertoEn } }, _sum: { monto: true } });
    return Number(x._sum.monto ?? 0);
  };
  const [ves, usd] = await Promise.all([suma(t.cajaVesId), suma(t.cajaUsdId)]);
  return { ves: r2(Number(t.fondoVes) + ves), usd: r2(Number(t.fondoUsd) + usd) };
}

export async function cerrarTurno(db: Db, actor: Actor, id: string, d: { contadoVes: number; contadoUsd: number; observaciones: string | null }, puedeCerrarAjenos = false): Promise<ResultadoPos<{ esperadoVes: number; esperadoUsd: number; diferenciaVes: number; diferenciaUsd: number }>> {
  return ejecutar(async () => {
    if (!montoValido(d.contadoVes) || !montoValido(d.contadoUsd)) throw new PosError("Escribe lo contado en cada moneda (monto válido, máximo 2 decimales).");
    const t = await db.turnoCaja.findUnique({ where: { id } });
    if (!t) throw new PosError("El turno no existe.");
    if (t.estado !== "ABIERTO") throw new PosError("El turno ya está cerrado.");
    if (t.usuarioId !== actor.id && !puedeCerrarAjenos) throw new PosError("Solo quien abrió el turno (o un supervisor) puede cerrarlo.");
    const esperado = await esperadoTurno(db, t);
    // Se cierra solo si sigue abierto: dos cierres simultáneos no pueden pisarse.
    const u = await db.turnoCaja.updateMany({
      where: { id, estado: "ABIERTO" },
      data: { estado: "CERRADO", cerradoEn: new Date(), contadoVes: d.contadoVes, contadoUsd: d.contadoUsd, esperadoVes: esperado.ves, esperadoUsd: esperado.usd, observaciones: d.observaciones?.trim().slice(0, 500) || null },
    });
    if (u.count === 0) throw new PosError("El turno ya fue cerrado. Recarga la página.");
    const dif = { diferenciaVes: r2(d.contadoVes - esperado.ves), diferenciaUsd: r2(d.contadoUsd - esperado.usd) };
    await registrarCambio(db, actor, { modulo: "pos", entidad: "turno_caja", entidadId: id, descripcion: numeroTurno(t.numero), accion: "otro", despues: { estado: "CERRADO", ...dif, esperadoVes: esperado.ves, esperadoUsd: esperado.usd } });
    return { ok: true, esperadoVes: esperado.ves, esperadoUsd: esperado.usd, ...dif };
  });
}

// ---------- Ventas ----------

export type PagoPos = {
  formaPago: string;
  moneda: string;
  /// Lo que entregó el cliente, en la moneda del pago.
  recibido: number;
  /// Cuenta que recibe (obligatoria salvo en efectivo: entra a la caja del turno).
  cuentaId?: string | null;
  referencia?: string | null;
};
export type DatosVentaPos = {
  turnoId: string;
  /// Sin cliente se factura a «Consumidor final».
  clienteId?: string | null;
  lineas: LineaPedido[];
  pagos: PagoPos[];
  /// Moneda en que se entrega el vuelto (por omisión, la del pago en efectivo que lo generó).
  monedaVuelto?: "USD" | "VES";
  encabezado?: EncabezadoVenta;
  /// El cajero no tiene el permiso «cambiar precio»: cada línea debe llevar el precio de la lista del cliente.
  sinCambiarPrecio?: boolean;
};

/** El cliente genérico del mostrador. */
async function clienteContado(tx: Parameters<Parameters<Db["$transaction"]>[0]>[0]) {
  const c = await tx.cliente.upsert({ where: { documento: "CONTADO" }, update: {}, create: { documento: "CONTADO", razonSocial: "Consumidor final", tipo: "Privado" }, select: { id: true } });
  return c.id;
}

export async function registrarVentaPos(db: Db, actor: Actor, d: DatosVentaPos): Promise<ResultadoPos<{ id: string; numero: number; facturaId: string; facturaNumero: number; totalUsd: number; totalBs: number; vueltoMoneda: string | null; vueltoMonto: number }>> {
  return ejecutar(async () => {
    if (d.pagos.length === 0) throw new PosError("Indica cómo paga el cliente.");
    if (d.pagos.length > 10) throw new PosError("Máximo 10 formas de pago por venta.");
    for (const p of d.pagos) {
      if (!(p.formaPago in FORMAS_PAGO_POS)) throw new PosError("Forma de pago inválida.");
      if (p.moneda !== "USD" && p.moneda !== "VES") throw new PosError("Moneda de pago inválida.");
      if (!(p.recibido > 0) || !montoValido(p.recibido)) throw new PosError("Cada pago debe ser un monto mayor que 0 (máximo 2 decimales).");
    }

    const r = await db.$transaction(async (tx) => {
      const turno = await tx.turnoCaja.findUnique({ where: { id: d.turnoId } });
      if (!turno || turno.estado !== "ABIERTO") throw new PosError("El turno no está abierto.");
      if (turno.usuarioId !== actor.id) throw new PosError("Ese turno es de otro cajero.");

      const clienteId = d.clienteId || (await clienteContado(tx));
      const fac = await emitirFacturaEnTx(tx, actor, { clienteId, almacenId: turno.almacenId, observaciones: "Venta de mostrador (POS)", diasCredito: 0, lineas: d.lineas, encabezado: d.encabezado, sinCambiarPrecio: d.sinCambiarPrecio });
      const f = await tx.factura.findUniqueOrThrow({ where: { id: fac.id }, select: { total: true, totalBs: true, tasaUsd: true } });
      const total = Number(f.total), tasa = Number(f.tasaUsd), totalBs = Number(f.totalBs);

      const plan = repartirPagos(total, totalBs, tasa, d.pagos, (x) => FORMAS_PAGO_POS[x as keyof typeof FORMAS_PAGO_POS]);
      if ("error" in plan) throw new PosError(plan.error);
      // El efectivo entra a las cajas del turno; el resto, a la cuenta que eligió el cajero.
      const reparto = plan.reparto.map((x) => {
        if (x.p.formaPago === "EFECTIVO") return { ...x, cuentaId: x.p.moneda === "VES" ? turno.cajaVesId : turno.cajaUsdId };
        if (!x.p.cuentaId) throw new PosError(`Elige la cuenta que recibe el pago por ${FORMAS_PAGO_POS[x.p.formaPago as keyof typeof FORMAS_PAGO_POS]}.`);
        return { ...x, cuentaId: x.p.cuentaId };
      });

      const venta = await tx.ventaPos.create({ data: { turnoId: turno.id, facturaId: fac.id, clienteId }, select: { id: true, numero: true } });
      const documento = numeroVentaPos(venta.numero);

      for (const x of reparto) {
        const c = await cobrarEnTx(
          tx, actor,
          { clienteId, formaPago: x.p.formaPago, moneda: x.p.moneda, cuentaId: x.cuentaId, referencia: x.p.referencia?.trim().slice(0, 60) || null, observaciones: `Venta ${documento}`, aplicaciones: [{ facturaId: fac.id, montoUsd: x.montoUsd }] },
          [{ facturaId: fac.id, montoUsd: x.montoUsd }],
          { montoMoneda: x.montoMoneda },
        );
        await tx.ventaPosPago.create({ data: { ventaId: venta.id, cobroId: c.id, formaPago: x.p.formaPago, moneda: x.p.moneda, cuentaId: x.cuentaId, recibido: x.p.recibido, aplicado: x.montoMoneda, referencia: x.p.referencia?.trim().slice(0, 60) || null } });
      }

      // Vuelto: en la moneda del pago (el cobro ya quedó neto) o en la otra (se cambia entre las dos cajas del turno).
      let vueltoMoneda: string | null = null, vueltoMonto = 0;
      const ultimo = reparto[reparto.length - 1];
      if (ultimo.exceso > 0) {
        vueltoMoneda = d.monedaVuelto ?? ultimo.p.moneda;
        if (vueltoMoneda === ultimo.p.moneda) vueltoMonto = ultimo.exceso;
        else {
          vueltoMonto = r2(ultimo.p.moneda === "USD" ? ultimo.exceso * tasa : ultimo.exceso / tasa);
          if (!(vueltoMonto > 0)) throw new PosError("El vuelto es demasiado pequeño para cambiarlo de moneda.");
          await intercambioVuelto(tx, actor, {
            recibeId: ultimo.cuentaId, montoRecibe: ultimo.exceso, entregaId: vueltoMoneda === "VES" ? turno.cajaVesId : turno.cajaUsdId, montoEntrega: vueltoMonto, documento,
          });
        }
        await tx.ventaPos.update({ where: { id: venta.id }, data: { vueltoMoneda, vueltoMonto } });
      }
      return { id: venta.id, numero: venta.numero, fac, total, totalBs, vueltoMoneda, vueltoMonto };
    });
    await auditarEmision(db, actor, r.fac, null);
    await registrarCambio(db, actor, { modulo: "pos", entidad: "venta_pos", entidadId: r.id, descripcion: numeroVentaPos(r.numero), accion: "crear", despues: { facturaId: r.fac.id, totalUsd: r.total, pagos: d.pagos.length, vuelto: r.vueltoMonto ? `${r.vueltoMonto} ${r.vueltoMoneda}` : null } });
    return { ok: true, id: r.id, numero: r.numero, facturaId: r.fac.id, facturaNumero: r.fac.numero, totalUsd: r.total, totalBs: r.totalBs, vueltoMoneda: r.vueltoMoneda, vueltoMonto: r.vueltoMonto };
  });
}

// ---------- Consulta ----------

/** Resumen de un turno para la pantalla y el cierre: ventas, cobrado por forma de pago y moneda, vueltos y lo que debería haber en cada caja. */
export async function resumenTurno(db: Db, id: string) {
  const t = await db.turnoCaja.findUnique({ where: { id }, include: { ventas: { include: { pagos: true }, orderBy: { creadoEn: "desc" } } } });
  if (!t) return null;
  const facturas = await db.factura.findMany({ where: { id: { in: t.ventas.map((v) => v.facturaId) } }, select: { id: true, numero: true, total: true, totalBs: true, subtotal: true, iva: true, estado: true } });
  const notas = await db.notaVenta.findMany({ where: { facturaId: { in: facturas.map((f) => f.id) }, estado: "ACTIVA" }, select: { tipo: true, total: true } });
  const porFactura = new Map(facturas.map((f) => [f.id, f]));
  const cobrado = new Map<string, number>();
  const vueltos = { VES: 0, USD: 0 };
  let totalUsd = 0, subtotalUsd = 0, ivaUsd = 0, anuladas = 0;
  for (const v of t.ventas) {
    const f = porFactura.get(v.facturaId);
    if (f?.estado === "EMITIDA") {
      totalUsd += Number(f.total);
      subtotalUsd += Number(f.subtotal);
      ivaUsd += Number(f.iva);
    } else if (f?.estado === "ANULADA") anuladas += 1;
    if (v.vueltoMoneda) vueltos[v.vueltoMoneda as "VES" | "USD"] += Number(v.vueltoMonto);
    for (const p of v.pagos) cobrado.set(`${p.formaPago}|${p.moneda}`, r2((cobrado.get(`${p.formaPago}|${p.moneda}`) ?? 0) + Number(p.aplicado)));
  }
  const esperado = t.estado === "ABIERTO" ? await esperadoTurno(db, t) : { ves: Number(t.esperadoVes), usd: Number(t.esperadoUsd) };
  return { turno: t, facturas: porFactura, cobrado: [...cobrado].map(([k, monto]) => ({ forma: k.split("|")[0], moneda: k.split("|")[1], monto })), vueltos, totalUsd: r4(totalUsd), esperado,
    // Datos del reporte X/Z (original: cierreCaja): base, IVA, facturas anuladas y devoluciones (notas de crédito) sobre las facturas del turno.
    subtotalUsd: r4(subtotalUsd), ivaUsd: r4(ivaUsd), anuladas, devolucionesUsd: r4(notas.filter((n) => n.tipo === "CREDITO").reduce((s, n) => s + Number(n.total), 0)), debitosUsd: r4(notas.filter((n) => n.tipo === "DEBITO").reduce((s, n) => s + Number(n.total), 0)) };
}
