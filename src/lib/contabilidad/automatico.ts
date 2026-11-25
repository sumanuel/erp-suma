import "server-only";
import type { Actor, Tx } from "@/lib/inventario/movimientos";
import { numeroFactura } from "@/lib/facturacion/estados";
import { numeroAplicacionAnticipo, numeroCobro } from "@/lib/cxc/estados";
import { numeroFacturaCompra, numeroPago } from "@/lib/cxp/estados";
import { numeroNotaCompra, numeroNotaVenta } from "@/lib/notas/estados";
import { numeroEntero, numeroRetencion } from "@/lib/retenciones/estados";
import { hoyCaracas, tasaVigente } from "@/lib/tasas";
import type { Db } from "@/lib/tenant";
import { CONCEPTOS, type Concepto } from "./conceptos";
import { ContaError, crearAsientoEnTx } from "./servicio";
import { numeroAsiento } from "./tipos";

// Contabilización automática. Cada documento (factura, cobro, factura de proveedor, pago) genera su asiento DENTRO de su propia transacción: o quedan
// los dos o no queda ninguno, así los libros nunca se separan de los documentos. Todo en bolívares con la tasa congelada en el documento. Una
// anulación no borra nada: genera el asiento inverso (el original queda en el historial). Si la contabilización automática está apagada, no hace nada.
//
// Cualquier problema (cuenta sin configurar, período cerrado, sin tasa) lanza `ContaError`: el servicio que llama lo traduce a un mensaje y revierte todo.

const redondear2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const bs = (usd: number, tasa: number) => redondear2(usd * tasa);

type Linea = { concepto?: Concepto; cuentaId?: string; debe?: number; haber?: number; detalle?: string };
type Documento = { origen: string; referencia: string; fecha: Date; descripcion: string; lineas: Linea[] };

/** Línea con la cuenta propia del tercero o del almacén si la tiene; si no, la del concepto general. */
const cuentaOConcepto = (cuentaId: string | null | undefined, concepto: Concepto): { cuentaId?: string; concepto?: Concepto } => (cuentaId ? { cuentaId } : { concepto });

async function configuracion(tx: Tx) {
  const [cfg, conceptos] = await Promise.all([tx.configContable.findUnique({ where: { id: 1 } }), tx.cuentaConcepto.findMany()]);
  return { automatica: cfg?.automatica ?? false, mapa: new Map(conceptos.map((c) => [c.concepto, c.cuentaId])) };
}

/** La fecha contable es la del documento; si su período ya está cerrado, el asiento va con la fecha de hoy (nunca se toca un período cerrado). */
async function fechaContable(tx: Tx, fecha: Date) {
  const p = await tx.periodoContable.findUnique({ where: { anio_mes: { anio: fecha.getUTCFullYear(), mes: fecha.getUTCMonth() + 1 } } });
  return p?.estado === "CERRADO" ? hoyCaracas() : fecha;
}

async function publicar(tx: Tx, actor: Actor, d: Documento): Promise<void> {
  const { automatica, mapa } = await configuracion(tx);
  if (!automatica) return;
  const lineas = d.lineas
    .map((l) => {
      const cuentaId = l.cuentaId ?? (l.concepto ? mapa.get(l.concepto) : undefined);
      return { l, cuentaId, debe: redondear2(l.debe ?? 0), haber: redondear2(l.haber ?? 0) };
    })
    .filter((x) => x.debe > 0 || x.haber > 0)
    .map((x) => {
      if (!x.cuentaId) throw new ContaError(`Falta configurar la cuenta contable del concepto «${x.l.concepto ? CONCEPTOS[x.l.concepto].etiqueta : "?"}» (Contabilidad → Configuración).`);
      return { cuentaId: x.cuentaId, descripcion: x.l.detalle ?? null, debe: x.debe, haber: x.haber };
    });
  if (lineas.length === 0) return;
  const fecha = await fechaContable(tx, d.fecha);
  await crearAsientoEnTx(tx, actor, { fecha, descripcion: d.descripcion, referencia: d.referencia, lineas }, d.origen);
}

/** Anulación de un documento: asiento inverso del original (mismas cuentas y montos, debe y haber cambiados). Sin asiento original no hay nada que revertir. */
async function revertir(tx: Tx, actor: Actor, original: string, reversa: string, referencia: string, descripcion: string): Promise<void> {
  const a = await tx.asiento.findFirst({ where: { origen: original, referencia, estado: "REGISTRADO" }, include: { lineas: { orderBy: { linea: "asc" } } } });
  if (!a) return;
  const fecha = await fechaContable(tx, hoyCaracas());
  await crearAsientoEnTx(
    tx, actor,
    { fecha, descripcion: `${descripcion} (revierte ${numeroAsiento(a.numero)})`, referencia, lineas: a.lineas.map((l) => ({ cuentaId: l.cuentaId, descripcion: l.descripcion, debe: Number(l.haber), haber: Number(l.debe) })) },
    reversa,
  );
}

// ---------- Ventas ----------
export async function contabilizarFactura(tx: Tx, actor: Actor, facturaId: string) {
  const f = await tx.factura.findUniqueOrThrow({ where: { id: facturaId }, include: { lineas: true, cliente: { select: { razonSocial: true, cuentaContableId: true } }, almacen: { select: { cuentaInventarioId: true } } } });
  const tasa = Number(f.tasaUsd);
  const totalBs = Number(f.totalBs);
  const ventasBs = bs(Number(f.subtotal), tasa);
  const ivaBs = redondear2(totalBs - ventasBs);
  const costoUsd = f.lineas.reduce((s, l) => s + Number(l.cantidad) * Number(l.costoUnitario), 0);
  const costoBs = bs(costoUsd, tasa);
  const ref = numeroFactura(f.numero);
  await publicar(tx, actor, {
    origen: "FACTURA", referencia: ref, fecha: f.fecha, descripcion: `Factura ${ref} · ${f.cliente.razonSocial}`,
    lineas: [
      // La cuenta propia del cliente (si la tiene) y la de inventario del almacén (si la tiene) mandan sobre las generales.
      { ...cuentaOConcepto(f.cliente.cuentaContableId, "CXC"), debe: totalBs }, { concepto: "VENTAS", haber: ventasBs }, { concepto: "IVA_DEBITO", haber: ivaBs },
      { concepto: "COSTO_VENTAS", debe: costoBs }, { ...cuentaOConcepto(f.almacen.cuentaInventarioId, "INVENTARIO"), haber: costoBs },
    ],
  });
}
export const revertirFactura = (tx: Tx, actor: Actor, numero: number) => revertir(tx, actor, "FACTURA", "ANULACION_FACTURA", numeroFactura(numero), `Anulación de factura ${numeroFactura(numero)}`);

// ---------- Cobros ----------
export async function contabilizarCobro(tx: Tx, actor: Actor, cobroId: string) {
  const c = await tx.cobro.findUniqueOrThrow({ where: { id: cobroId }, include: { aplicaciones: { include: { factura: { select: { tasaUsd: true } } } }, cuenta: true, cliente: { select: { razonSocial: true, cuentaContableId: true } } } });
  if (!c.cuenta) return; // cobros anteriores a Tesorería: sin cuenta, no hay dónde contabilizarlos
  if (!c.cuenta.cuentaContableId) {
    if (!(await configuracion(tx)).automatica) return;
    throw new ContaError(`La cuenta de tesorería ${c.cuenta.codigo} no tiene cuenta contable asignada (Contabilidad → Configuración).`);
  }
  const recibido = await bolivaresDelPago(tx, c.moneda, Number(c.montoMoneda), c.fecha);
  const cxc = redondear2(c.aplicaciones.reduce((s, a) => s + bs(Number(a.montoUsd), Number(a.factura.tasaUsd)), 0));
  // Lo recibido de más es un anticipo (pasivo con el cliente); el diferencial cambiario solo mide lo aplicado a facturas.
  const anticipo = Number(c.anticipoBs);
  const dif = redondear2(recibido - anticipo - cxc);
  const ref = numeroCobro(c.numero);
  await publicar(tx, actor, {
    origen: "COBRO", referencia: ref, fecha: c.fecha, descripcion: `Cobro ${ref} · ${c.cliente.razonSocial}`,
    lineas: [{ cuentaId: c.cuenta.cuentaContableId, debe: recibido }, { ...cuentaOConcepto(c.cliente.cuentaContableId, "CXC"), haber: cxc }, { concepto: "ANTICIPO_CLIENTES", haber: anticipo }, { concepto: "DIFERENCIAL_CAMBIARIO", haber: dif > 0 ? dif : 0, debe: dif < 0 ? -dif : 0 }],
  });
}

/** Aplicar un anticipo a una factura: el pasivo con el cliente baja (a lo que valía al recibirlo) y las cuentas por cobrar también (a la tasa de la factura); la diferencia es cambiaria. */
export async function contabilizarAplicacionAnticipo(tx: Tx, actor: Actor, id: string) {
  const a = await tx.anticipoAplicacion.findUniqueOrThrow({ where: { id }, include: { cobro: { include: { cliente: { select: { razonSocial: true } } } }, factura: { select: { tasaUsd: true, numero: true } } } });
  const anticipoUsd = Number(a.cobro.anticipoUsd);
  const delAnticipo = anticipoUsd > 0 ? redondear2((Number(a.cobro.anticipoBs) * Number(a.montoUsd)) / anticipoUsd) : 0;
  const cxc = bs(Number(a.montoUsd), Number(a.factura.tasaUsd));
  const dif = redondear2(delAnticipo - cxc);
  const ref = numeroAplicacionAnticipo(a.numero);
  await publicar(tx, actor, {
    origen: "APLICACION_ANTICIPO", referencia: ref, fecha: a.fecha, descripcion: `Anticipo ${numeroCobro(a.cobro.numero)} aplicado a ${numeroFactura(a.factura.numero)} · ${a.cobro.cliente.razonSocial}`,
    lineas: [{ concepto: "ANTICIPO_CLIENTES", debe: delAnticipo }, { concepto: "CXC", haber: cxc }, { concepto: "DIFERENCIAL_CAMBIARIO", haber: dif > 0 ? dif : 0, debe: dif < 0 ? -dif : 0 }],
  });
}
export const revertirAplicacionAnticipo = (tx: Tx, actor: Actor, numero: number) => revertir(tx, actor, "APLICACION_ANTICIPO", "ANULACION_APLICACION_ANTICIPO", numeroAplicacionAnticipo(numero), `Anulación de aplicación de anticipo ${numeroAplicacionAnticipo(numero)}`);
export const revertirCobro = (tx: Tx, actor: Actor, numero: number) => revertir(tx, actor, "COBRO", "ANULACION_COBRO", numeroCobro(numero), `Anulación de cobro ${numeroCobro(numero)}`);

// ---------- Compras ----------
export async function contabilizarFacturaCompra(tx: Tx, actor: Actor, id: string) {
  const f = await tx.facturaCompra.findUniqueOrThrow({ where: { id }, include: { proveedor: { select: { razonSocial: true, cuentaContableId: true } }, lineas: true } });
  const tasa = Number(f.tasaUsd);
  // Con desglose por alícuota, cada base y cada IVA se pasa a bolívares por separado (así el asiento y el libro de compras coinciden al centavo).
  const baseBs = f.lineas.length ? redondear2(f.lineas.reduce((s, l) => s + bs(Number(l.base), tasa), 0)) : bs(Number(f.subtotal), tasa);
  const ivaBs = f.lineas.length ? redondear2(f.lineas.reduce((s, l) => s + bs(Number(l.iva), tasa), 0)) : redondear2(bs(Number(f.total), tasa) - baseBs);
  const totalBs = f.lineas.length ? redondear2(baseBs + ivaBs) : bs(Number(f.total), tasa);
  const ref = numeroFacturaCompra(f.numero);
  await publicar(tx, actor, {
    origen: "FACTURA_COMPRA", referencia: ref, fecha: f.fechaLibro ?? f.fecha, descripcion: `Factura de proveedor ${ref} (${f.documento}) · ${f.proveedor.razonSocial}`,
    lineas: [f.cuentaGastoId ? { cuentaId: f.cuentaGastoId, debe: baseBs } : { concepto: "COMPRAS", debe: baseBs }, { concepto: "IVA_CREDITO", debe: ivaBs }, { ...cuentaOConcepto(f.proveedor.cuentaContableId, "CXP"), haber: totalBs }],
  });
}
export const revertirFacturaCompra = (tx: Tx, actor: Actor, numero: number) => revertir(tx, actor, "FACTURA_COMPRA", "ANULACION_FACTURA_COMPRA", numeroFacturaCompra(numero), `Anulación de factura de proveedor ${numeroFacturaCompra(numero)}`);

// ---------- Pagos ----------
export async function contabilizarPago(tx: Tx, actor: Actor, pagoId: string) {
  const p = await tx.pagoProveedor.findUniqueOrThrow({ where: { id: pagoId }, include: { aplicaciones: { include: { factura: { select: { tasaUsd: true } } } }, cuenta: true, proveedor: { select: { razonSocial: true, cuentaContableId: true } } } });
  if (!p.cuenta) return;
  if (!p.cuenta.cuentaContableId) {
    if (!(await configuracion(tx)).automatica) return;
    throw new ContaError(`La cuenta de tesorería ${p.cuenta.codigo} no tiene cuenta contable asignada (Contabilidad → Configuración).`);
  }
  const pagado = await bolivaresDelPago(tx, p.moneda, Number(p.montoMoneda), p.fecha);
  const cxp = redondear2(p.aplicaciones.reduce((s, a) => s + bs(Number(a.montoUsd), Number(a.factura.tasaUsd)), 0));
  const dif = redondear2(cxp - pagado);
  const ref = numeroPago(p.numero);
  await publicar(tx, actor, {
    origen: "PAGO", referencia: ref, fecha: p.fecha, descripcion: `Pago ${ref} · ${p.proveedor.razonSocial}`,
    lineas: [{ ...cuentaOConcepto(p.proveedor.cuentaContableId, "CXP"), debe: cxp }, { cuentaId: p.cuenta.cuentaContableId, haber: pagado }, { concepto: "DIFERENCIAL_CAMBIARIO", haber: dif > 0 ? dif : 0, debe: dif < 0 ? -dif : 0 }],
  });
}
export const revertirPago = (tx: Tx, actor: Actor, numero: number) => revertir(tx, actor, "PAGO", "ANULACION_PAGO", numeroPago(numero), `Anulación de pago ${numeroPago(numero)}`);

/** Bolívares de un pago o cobro: si fue en bolívares, el monto; si fue en dólares, el monto por la tasa vigente ese día. */
async function bolivaresDelPago(tx: Tx, moneda: string, monto: number, fecha: Date) {
  if (moneda === "VES") return monto;
  if (!(await configuracion(tx)).automatica) return 0;
  const t = await tasaVigente(tx as unknown as Db, "USD", fecha);
  if (!t) throw new ContaError("No hay tasa del dólar cargada para contabilizar el movimiento en bolívares.");
  return bs(monto, t.valor);
}


// ---------- Notas de crédito y débito ----------
/** Venta: el crédito revierte ventas e IVA contra cuentas por cobrar (y, si devuelve mercancía, el costo contra el inventario); el débito suma ventas e IVA a cuentas por cobrar. */
export async function contabilizarNotaVenta(tx: Tx, actor: Actor, id: string) {
  const n = await tx.notaVenta.findUniqueOrThrow({ where: { id }, include: { lineas: true, reintegros: true, cliente: { select: { razonSocial: true } }, factura: { select: { numero: true } } } });
  const tasa = Number(n.tasaUsd);
  const baseBs = bs(Number(n.subtotal), tasa);
  const totalBs = bs(Number(n.total), tasa);
  const ivaBs = redondear2(totalBs - baseBs);
  const ref = numeroNotaVenta(n.tipo, n.numero);
  const nombre = n.tipo === "CREDITO" ? "Nota de crédito" : "Nota de débito";
  const descripcion = `${nombre} ${ref} sobre ${numeroFactura(n.factura.numero)} · ${n.cliente.razonSocial}`;
  if (n.tipo === "CREDITO") {
    const costoBs = bs(n.lineas.reduce((s, l) => s + Number(l.cantidad) * Number(l.costoUnitario), 0), tasa);
    const salidas: Linea[] = [];
    const excedente = Number(n.excedente);
    if (excedente > 0 && (await configuracion(tx)).automatica) {
      for (const r of n.reintegros) {
        const cuenta = await tx.cuentaTesoreria.findUniqueOrThrow({ where: { id: r.cuentaId }, select: { codigo: true, cuentaContableId: true } });
        if (!cuenta.cuentaContableId) throw new ContaError(`La cuenta de tesorería ${cuenta.codigo} no tiene cuenta contable asignada (Contabilidad → Configuración).`);
        salidas.push({ cuentaId: cuenta.cuentaContableId, haber: await bolivaresDelPago(tx, r.moneda, Number(r.monto), n.fecha) });
      }
      if (Number(n.saldoFavor) > 0) salidas.push({ concepto: "ANTICIPO_CLIENTES", haber: bs(Number(n.saldoFavor), tasa) });
    }
    const cxcBs = excedente > 0 ? bs(Number(n.total) - excedente, tasa) : totalBs;
    // Lo que no cuadre entre la nota (a la tasa de la factura) y el dinero entregado (a la de hoy) es diferencial cambiario.
    const dif = excedente > 0 ? redondear2(totalBs - cxcBs - salidas.reduce((s, l) => s + (l.haber ?? 0), 0)) : 0;
    await publicar(tx, actor, { origen: "NOTA_VENTA", referencia: ref, fecha: n.fecha, descripcion, lineas: [{ concepto: "VENTAS", debe: baseBs }, { concepto: "IVA_DEBITO", debe: ivaBs }, { concepto: "CXC", haber: cxcBs }, ...salidas, { concepto: "DIFERENCIAL_CAMBIARIO", haber: dif > 0 ? dif : 0, debe: dif < 0 ? -dif : 0 }, { concepto: "INVENTARIO", debe: costoBs }, { concepto: "COSTO_VENTAS", haber: costoBs }] });
  } else {
    await publicar(tx, actor, { origen: "NOTA_VENTA", referencia: ref, fecha: n.fecha, descripcion, lineas: [{ concepto: "CXC", debe: totalBs }, { concepto: "VENTAS", haber: baseBs }, { concepto: "IVA_DEBITO", haber: ivaBs }] });
  }
}
export const revertirNotaVenta = (tx: Tx, actor: Actor, tipo: string, numero: number) => revertir(tx, actor, "NOTA_VENTA", "ANULACION_NOTA_VENTA", numeroNotaVenta(tipo, numero), `Anulación de ${numeroNotaVenta(tipo, numero)}`);

/** Compra: el crédito del proveedor revierte compras e IVA crédito contra cuentas por pagar; el débito los suma. */
export async function contabilizarNotaCompra(tx: Tx, actor: Actor, id: string) {
  const n = await tx.notaCompra.findUniqueOrThrow({ where: { id }, include: { proveedor: { select: { razonSocial: true } }, factura: { select: { numero: true } } } });
  const tasa = Number(n.tasaUsd);
  const baseBs = bs(Number(n.subtotal), tasa);
  const totalBs = bs(Number(n.total), tasa);
  const ivaBs = redondear2(totalBs - baseBs);
  const ref = numeroNotaCompra(n.tipo, n.numero);
  const descripcion = `${n.tipo === "CREDITO" ? "Nota de crédito" : "Nota de débito"} del proveedor ${ref} (${n.documento}) sobre ${numeroFacturaCompra(n.factura.numero)} · ${n.proveedor.razonSocial}`;
  const lineas: Linea[] = n.tipo === "CREDITO"
    ? [{ concepto: "CXP", debe: totalBs }, { concepto: "COMPRAS", haber: baseBs }, { concepto: "IVA_CREDITO", haber: ivaBs }]
    : [{ concepto: "COMPRAS", debe: baseBs }, { concepto: "IVA_CREDITO", debe: ivaBs }, { concepto: "CXP", haber: totalBs }];
  await publicar(tx, actor, { origen: "NOTA_COMPRA", referencia: ref, fecha: n.fecha, descripcion, lineas });
}
export const revertirNotaCompra = (tx: Tx, actor: Actor, tipo: string, numero: number) => revertir(tx, actor, "NOTA_COMPRA", "ANULACION_NOTA_COMPRA", numeroNotaCompra(tipo, numero), `Anulación de ${numeroNotaCompra(tipo, numero)}`);

// ---------- Retenciones de IVA e ISLR ----------
/** Practicada: baja lo que debemos al proveedor y sube lo que debemos al fisco. Sufrida: baja lo que nos debe el cliente y sube el crédito a nuestro favor. Mismos bolívares que el saldo de la factura. */
export async function contabilizarRetencion(tx: Tx, actor: Actor, id: string) {
  const r = await tx.retencion.findUniqueOrThrow({ where: { id }, include: { proveedor: { select: { razonSocial: true } }, cliente: { select: { razonSocial: true } } } });
  const monto = Number(r.montoBs);
  const ref = numeroRetencion(r.numero);
  const iva = r.tipo === "IVA";
  if (r.sentido === "PRACTICADA") {
    await publicar(tx, actor, { origen: "RETENCION", referencia: ref, fecha: r.fecha, descripcion: `Retención de ${r.tipo} practicada ${ref} (comprobante ${r.comprobante}) · ${r.proveedor?.razonSocial ?? ""}`, lineas: [{ concepto: "CXP", debe: monto }, { concepto: iva ? "RET_IVA_PAGAR" : "RET_ISLR_PAGAR", haber: monto }] });
  } else {
    await publicar(tx, actor, { origen: "RETENCION", referencia: ref, fecha: r.fecha, descripcion: `Retención de ${r.tipo} sufrida ${ref} (comprobante ${r.comprobante}) · ${r.cliente?.razonSocial ?? ""}`, lineas: [{ concepto: iva ? "RET_IVA_SUFRIDA" : "RET_ISLR_SUFRIDA", debe: monto }, { concepto: "CXC", haber: monto }] });
  }
}
export const revertirRetencion = (tx: Tx, actor: Actor, numero: number) => revertir(tx, actor, "RETENCION", "ANULACION_RETENCION", numeroRetencion(numero), `Anulación de retención ${numeroRetencion(numero)}`);

/** Pago al fisco de lo retenido: baja la retención por pagar y sale de la caja o banco de donde se pagó. */
export async function contabilizarEntero(tx: Tx, actor: Actor, id: string) {
  const e = await tx.enteroRetencion.findUniqueOrThrow({ where: { id }, include: { cuenta: true, _count: { select: { retenciones: true } } } });
  if (!e.cuenta.cuentaContableId) {
    if (!(await configuracion(tx)).automatica) return;
    throw new ContaError(`La cuenta de tesorería ${e.cuenta.codigo} no tiene cuenta contable asignada (Contabilidad → Configuración).`);
  }
  const monto = Number(e.montoBs);
  const ref = numeroEntero(e.numero);
  await publicar(tx, actor, {
    origen: "ENTERO_RETENCION", referencia: ref, fecha: e.fecha, descripcion: `Pago de retenciones de ${e.tipo} al fisco ${ref}${e.referencia ? ` · ref. ${e.referencia}` : ""} (${e._count.retenciones} comprobante${e._count.retenciones === 1 ? "" : "s"})`,
    lineas: [{ concepto: e.tipo === "IVA" ? "RET_IVA_PAGAR" : "RET_ISLR_PAGAR", debe: monto }, { cuentaId: e.cuenta.cuentaContableId, haber: monto }],
  });
}
export const revertirEntero = (tx: Tx, actor: Actor, numero: number) => revertir(tx, actor, "ENTERO_RETENCION", "ANULACION_ENTERO_RETENCION", numeroEntero(numero), `Anulación del pago de retenciones ${numeroEntero(numero)}`);

// ---------- Movimientos manuales de tesorería ----------
/** Ingreso, egreso o saldo inicial de una caja o banco: se contabiliza contra la cuenta contable de contrapartida que elija quien lo registra. */
export async function contabilizarMovimientoTesoreria(
  tx: Tx, actor: Actor,
  m: { movimientoId: bigint; cuentaId: string; tipo: "INGRESO" | "EGRESO" | "SALDO_INICIAL"; monto: number; contrapartidaId: string | null; descripcion: string },
) {
  if (!(await configuracion(tx)).automatica) return;
  const cuenta = await tx.cuentaTesoreria.findUniqueOrThrow({ where: { id: m.cuentaId }, select: { codigo: true, moneda: true, cuentaContableId: true } });
  if (!cuenta.cuentaContableId) throw new ContaError(`La cuenta de tesorería ${cuenta.codigo} no tiene cuenta contable asignada (Contabilidad → Configuración).`);
  if (!m.contrapartidaId) throw new ContaError("Elige la cuenta contable de contrapartida del movimiento.");
  if (m.contrapartidaId === cuenta.cuentaContableId) throw new ContaError("La contrapartida no puede ser la misma cuenta contable de la caja o banco.");
  const hoy = hoyCaracas();
  const bolivares = await bolivaresDelPago(tx, cuenta.moneda, m.monto, hoy);
  const entra = m.tipo !== "EGRESO";
  await publicar(tx, actor, {
    origen: "TESORERIA", referencia: `TES-${m.movimientoId}`, fecha: hoy, descripcion: `${m.tipo === "SALDO_INICIAL" ? "Saldo inicial" : m.tipo === "INGRESO" ? "Ingreso" : "Egreso"} en ${cuenta.codigo}: ${m.descripcion}`,
    lineas: entra ? [{ cuentaId: cuenta.cuentaContableId, debe: bolivares }, { cuentaId: m.contrapartidaId, haber: bolivares }] : [{ cuentaId: m.contrapartidaId, debe: bolivares }, { cuentaId: cuenta.cuentaContableId, haber: bolivares }],
  });
}

/** Transferencia entre cajas o bancos (misma moneda): pasa el monto de la cuenta contable de origen a la de destino; si ambas usan la misma cuenta contable no hay asiento. */
export async function contabilizarTransferencia(tx: Tx, actor: Actor, t: { movimientoId: bigint; origenId: string; destinoId: string; monto: number }) {
  if (!(await configuracion(tx)).automatica) return;
  const [o, d] = await Promise.all([
    tx.cuentaTesoreria.findUniqueOrThrow({ where: { id: t.origenId }, select: { codigo: true, moneda: true, cuentaContableId: true } }),
    tx.cuentaTesoreria.findUniqueOrThrow({ where: { id: t.destinoId }, select: { codigo: true, cuentaContableId: true } }),
  ]);
  for (const c of [o, d]) if (!c.cuentaContableId) throw new ContaError(`La cuenta de tesorería ${c.codigo} no tiene cuenta contable asignada (Contabilidad → Configuración).`);
  if (o.cuentaContableId === d.cuentaContableId) return;
  const hoy = hoyCaracas();
  const bolivares = await bolivaresDelPago(tx, o.moneda, t.monto, hoy);
  await publicar(tx, actor, {
    origen: "TESORERIA", referencia: `TES-${t.movimientoId}`, fecha: hoy, descripcion: `Transferencia de ${o.codigo} a ${d.codigo}`,
    lineas: [{ cuentaId: d.cuentaContableId as string, debe: bolivares }, { cuentaId: o.cuentaContableId as string, haber: bolivares }],
  });
}
