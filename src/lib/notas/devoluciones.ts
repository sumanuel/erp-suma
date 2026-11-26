import "server-only";
import type { Db } from "@/lib/tenant";
import { ESTADOS_NOTA } from "./estados";

// Consulta de devoluciones de venta (notas de crédito por devolución de mercancía). Los totales son de TODO lo que cumple el filtro, no solo
// de las filas que se muestran, y las anuladas nunca suman.

export type FiltroDevoluciones = { desde?: Date; hasta?: Date; texto?: string; estado?: string; clienteId?: string };

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const r4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;

export async function listarDevoluciones(db: Db, f: FiltroDevoluciones, limite = 200) {
  const texto = f.texto?.trim().slice(0, 60) ?? "";
  // «NC-5» busca la devolución; «FAC-5», las de esa factura; un número solo, cualquiera de las dos.
  const n = /^(NC|FAC)?-?0*(\d{1,9})$/i.exec(texto);
  const prefijo = n?.[1]?.toUpperCase();
  const porNumero = n ? [...(prefijo !== "FAC" ? [{ numero: Number(n[2]) }] : []), ...(prefijo !== "NC" ? [{ factura: { numero: Number(n[2]) } }] : [])] : [];
  const contiene = { contains: texto, mode: "insensitive" as const };

  const notas = await db.notaVenta.findMany({
    where: {
      tipo: "CREDITO", modo: "DEVOLUCION",
      ...(f.estado && f.estado in ESTADOS_NOTA ? { estado: f.estado } : {}),
      ...(f.clienteId ? { clienteId: f.clienteId } : {}),
      ...(f.desde || f.hasta ? { fecha: { ...(f.desde ? { gte: f.desde } : {}), ...(f.hasta ? { lte: f.hasta } : {}) } } : {}),
      ...(texto ? { OR: [...porNumero, { cliente: { razonSocial: contiene } }, { cliente: { documento: contiene } }, { motivo: contiene }] } : {}),
    },
    include: {
      cliente: { select: { razonSocial: true } },
      factura: { select: { id: true, numero: true, lineas: { select: { cantidad: true } } } },
      lineas: { select: { cantidad: true } },
      reintegros: { select: { moneda: true, monto: true } },
    },
    orderBy: { creadoEn: "desc" },
  });

  const sumar = (xs: { cantidad: unknown }[]) => r4(xs.reduce((s, x) => s + Number(x.cantidad), 0));
  const filas = notas.map((x) => {
    const entregado = (moneda: string) => r2(x.reintegros.filter((p) => p.moneda === moneda).reduce((s, p) => s + Number(p.monto), 0));
    const total = Number(x.total);
    return {
      id: x.id, numero: x.numero, fecha: x.fecha, estado: x.estado, motivo: x.motivo, por: x.creadoPorNombre, cliente: x.cliente.razonSocial,
      facturaId: x.factura.id, facturaNumero: x.factura.numero,
      /// Esta sola devolución trajo todo lo vendido en la factura.
      completa: sumar(x.lineas) >= sumar(x.factura.lineas),
      total, totalBs: r2(total * Number(x.tasaUsd)),
      reintegradoBs: entregado("VES"), reintegradoUsd: entregado("USD"),
      saldoFavor: Number(x.saldoFavor),
      /// Lo que solo bajó la deuda del cliente (no salió dinero ni quedó a favor).
      deDeuda: r4(total - Number(x.excedente)),
    };
  });

  const vigentes = filas.filter((x) => x.estado === "ACTIVA");
  const suma = (k: "total" | "totalBs" | "reintegradoBs" | "reintegradoUsd" | "saldoFavor" | "deDeuda") => r4(vigentes.reduce((s, x) => s + x[k], 0));
  return {
    filas: filas.slice(0, limite),
    encontradas: filas.length,
    totales: { cantidad: vigentes.length, anuladas: filas.length - vigentes.length, total: suma("total"), totalBs: r2(suma("totalBs")), reintegradoBs: r2(suma("reintegradoBs")), reintegradoUsd: r2(suma("reintegradoUsd")), saldoFavor: suma("saldoFavor"), deDeuda: suma("deDeuda") },
  };
}
