import "server-only";
import type { Actor, Tx } from "@/lib/inventario/movimientos";
import { numeroFactura } from "@/lib/facturacion/estados";
import { numeroCobro } from "@/lib/cxc/estados";
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
  const f = await tx.factura.findUniqueOrThrow({ where: { id: facturaId }, include: { lineas: true, cliente: { select: { razonSocial: true } } } });
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
      { concepto: "CXC", debe: totalBs }, { concepto: "VENTAS", haber: ventasBs }, { concepto: "IVA_DEBITO", haber: ivaBs },
      { concepto: "COSTO_VENTAS", debe: costoBs }, { concepto: "INVENTARIO", haber: costoBs },
    ],
  });
}
export const revertirFactura = (tx: Tx, actor: Actor, numero: number) => revertir(tx, actor, "FACTURA", "ANULACION_FACTURA", numeroFactura(numero), `Anulación de factura ${numeroFactura(numero)}`);

// ---------- Cobros ----------
export async function contabilizarCobro(tx: Tx, actor: Actor, cobroId: string) {
  const c = await tx.cobro.findUniqueOrThrow({ where: { id: cobroId }, include: { aplicaciones: { include: { factura: { select: { tasaUsd: true } } } }, cuenta: true, cliente: { select: { razonSocial: true } } } });
  if (!c.cuenta) return; // cobros anteriores a Tesorería: sin cuenta, no hay dónde contabilizarlos
  if (!c.cuenta.cuentaContableId) {
    if (!(await configuracion(tx)).automatica) return;
    throw new ContaError(`La cuenta de tesorería ${c.cuenta.codigo} no tiene cuenta contable asignada (Contabilidad → Configuración).`);
  }
  const recibido = await bolivaresDelPago(tx, c.moneda, Number(c.montoMoneda), c.fecha);
  const cxc = redondear2(c.aplicaciones.reduce((s, a) => s + bs(Number(a.montoUsd), Number(a.factura.tasaUsd)), 0));
  const dif = redondear2(recibido - cxc);
  const ref = numeroCobro(c.numero);
  await publicar(tx, actor, {
    origen: "COBRO", referencia: ref, fecha: c.fecha, descripcion: `Cobro ${ref} · ${c.cliente.razonSocial}`,
    lineas: [{ cuentaId: c.cuenta.cuentaContableId, debe: recibido }, { concepto: "CXC", haber: cxc }, { concepto: "DIFERENCIAL_CAMBIARIO", haber: dif > 0 ? dif : 0, debe: dif < 0 ? -dif : 0 }],
  });
}
export const revertirCobro = (tx: Tx, actor: Actor, numero: number) => revertir(tx, actor, "COBRO", "ANULACION_COBRO", numeroCobro(numero), `Anulación de cobro ${numeroCobro(numero)}`);

// ---------- Compras ----------
export async function contabilizarFacturaCompra(tx: Tx, actor: Actor, id: string) {
  const f = await tx.facturaCompra.findUniqueOrThrow({ where: { id }, include: { proveedor: { select: { razonSocial: true } } } });
  const tasa = Number(f.tasaUsd);
  const baseBs = bs(Number(f.subtotal), tasa);
  const totalBs = bs(Number(f.total), tasa);
  const ref = numeroFacturaCompra(f.numero);
  await publicar(tx, actor, {
    origen: "FACTURA_COMPRA", referencia: ref, fecha: f.fecha, descripcion: `Factura de proveedor ${ref} (${f.documento}) · ${f.proveedor.razonSocial}`,
    lineas: [{ concepto: "COMPRAS", debe: baseBs }, { concepto: "IVA_CREDITO", debe: redondear2(totalBs - baseBs) }, { concepto: "CXP", haber: totalBs }],
  });
}
export const revertirFacturaCompra = (tx: Tx, actor: Actor, numero: number) => revertir(tx, actor, "FACTURA_COMPRA", "ANULACION_FACTURA_COMPRA", numeroFacturaCompra(numero), `Anulación de factura de proveedor ${numeroFacturaCompra(numero)}`);

// ---------- Pagos ----------
export async function contabilizarPago(tx: Tx, actor: Actor, pagoId: string) {
  const p = await tx.pagoProveedor.findUniqueOrThrow({ where: { id: pagoId }, include: { aplicaciones: { include: { factura: { select: { tasaUsd: true } } } }, cuenta: true, proveedor: { select: { razonSocial: true } } } });
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
    lineas: [{ concepto: "CXP", debe: cxp }, { cuentaId: p.cuenta.cuentaContableId, haber: pagado }, { concepto: "DIFERENCIAL_CAMBIARIO", haber: dif > 0 ? dif : 0, debe: dif < 0 ? -dif : 0 }],
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
  const n = await tx.notaVenta.findUniqueOrThrow({ where: { id }, include: { lineas: true, cliente: { select: { razonSocial: true } }, factura: { select: { numero: true } } } });
  const tasa = Number(n.tasaUsd);
  const baseBs = bs(Number(n.subtotal), tasa);
  const totalBs = bs(Number(n.total), tasa);
  const ivaBs = redondear2(totalBs - baseBs);
  const ref = numeroNotaVenta(n.tipo, n.numero);
  const nombre = n.tipo === "CREDITO" ? "Nota de crédito" : "Nota de débito";
  const descripcion = `${nombre} ${ref} sobre ${numeroFactura(n.factura.numero)} · ${n.cliente.razonSocial}`;
  if (n.tipo === "CREDITO") {
    const costoBs = bs(n.lineas.reduce((s, l) => s + Number(l.cantidad) * Number(l.costoUnitario), 0), tasa);
    await publicar(tx, actor, { origen: "NOTA_VENTA", referencia: ref, fecha: n.fecha, descripcion, lineas: [{ concepto: "VENTAS", debe: baseBs }, { concepto: "IVA_DEBITO", debe: ivaBs }, { concepto: "CXC", haber: totalBs }, { concepto: "INVENTARIO", debe: costoBs }, { concepto: "COSTO_VENTAS", haber: costoBs }] });
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
