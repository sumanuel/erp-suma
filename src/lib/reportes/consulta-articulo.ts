import "server-only";
import type { Db } from "@/lib/tenant";
import { hoyCaracas } from "@/lib/tasas";
import { disponibles } from "@/lib/pedidos/servicio";
import { ultimasCompras, ultimasVentas } from "./gerencial-articulos";
import { PRIMER_VENDEDOR_FILIAL } from "./gerencial-movimientos";
import { lineasDeVenta } from "./movimientos-venta";
import { diaCaracas, redondear2 } from "./ayudas";

// «Consulta general de artículos» y «Consulta gerentes» (original: ConsultaGeneral): todo lo de un producto en una pantalla.

export async function consultaArticulo(db: Db, codigo: string, hoy: Date = hoyCaracas()) {
  const p = await db.producto.findUnique({
    where: { codigo },
    include: {
      categoria: { select: { nombre: true } }, subcategoria: { select: { nombre: true } }, marca: { select: { nombre: true } }, arancel: true, alicuotaIva: { select: { nombre: true } },
      precios: { where: { activo: true }, include: { presentacion: { include: { unidadMedida: { select: { nombre: true } } } } }, orderBy: [{ lista: "asc" }] },
      proveedores: { include: { proveedor: { select: { id: true, razonSocial: true, documento: true, pais: { select: { nombre: true } } } } }, orderBy: { creadoEn: "asc" } },
      existencias: { include: { almacen: { select: { codigo: true, nombre: true } } } },
      promociones: { where: { activo: true, desde: { lte: hoy }, hasta: { gte: hoy } } },
    },
  });
  if (!p) return null;
  const a = hoy.getUTCFullYear(), m = hoy.getUTCMonth();
  const desde = new Date(Math.min(Date.UTC(a, 0, 1), Date.UTC(a, m - 12, 1)));
  const [libre, ventas, compras, ajuste, movimientos, lineas, porRecibir, recepciones, vendedores] = await Promise.all([
    disponibles(db, [codigo]),
    ultimasVentas(db), ultimasCompras(db),
    db.movimientoInventario.findFirst({ where: { productoCodigo: codigo, tipo: { startsWith: "AJUSTE" }, OR: [{ documento: null }, { NOT: ["FAC-", "NC-", "ND-", "IMP-"].map((p) => ({ documento: { startsWith: p } })) }] }, orderBy: { fecha: "desc" } }),
    db.movimientoInventario.findMany({ where: { productoCodigo: codigo }, include: { almacen: { select: { codigo: true } } }, orderBy: { id: "desc" }, take: 50 }),
    lineasDeVenta(db, desde, hoy, { productoCodigo: codigo }),
    db.ordenCompraLinea.findMany({ where: { productoCodigo: codigo, orden: { estado: { in: ["EMITIDA", "RECIBIDA_PARCIAL"] } } }, select: { cantidad: true, cantidadRecibida: true } }),
    db.recepcionLinea.findMany({ where: { productoCodigo: codigo }, include: { recepcion: { include: { orden: { include: { proveedor: { select: { razonSocial: true } } } } } } }, orderBy: { recepcion: { fecha: "desc" } }, take: 20 }),
    db.vendedor.findMany({ select: { id: true, codigo: true } }),
  ]);
  const existencia = p.existencias.reduce((s, x) => s + Number(x.cantidad), 0);
  const disponible = libre.get(codigo) ?? 0;
  const signo = (t: string) => (t === "DEV" ? -1 : 1);
  // Promedio de unidades vendidas por mes en los meses completos anteriores.
  const promedios = [1, 3, 6, 12].map((n) => {
    const ini = new Date(Date.UTC(a, m - n, 1)), fin = new Date(Date.UTC(a, m, 0));
    return { meses: n, unidades: redondear2(lineas.filter((l) => l.fecha >= ini && l.fecha <= fin).reduce((s, l) => s + signo(l.tipo) * l.cantidad, 0) / n) };
  });
  const filial = new Set(vendedores.filter((v) => Number.parseInt(v.codigo, 10) >= PRIMER_VENDEDOR_FILIAL).map((v) => v.id));
  const delAnio = lineas.filter((l) => l.fecha.getUTCFullYear() === a);
  const porMes = Array.from({ length: m + 1 }, (_x, k) => {
    const del = delAnio.filter((l) => l.fecha.getUTCMonth() === k);
    const suma = (f: (l: (typeof del)[number]) => number) => redondear2(del.reduce((s, l) => s + signo(l.tipo) * f(l), 0));
    const monto = suma((l) => l.monto), costo = suma((l) => l.costo);
    return { mes: k + 1, cantidad: suma((l) => l.cantidad), filial: suma((l) => (l.vendedorId && filial.has(l.vendedorId) ? l.cantidad : 0)), monto, costo, utilidad: redondear2(monto - costo) };
  });
  return {
    p, existencia, disponible, reservado: redondear2(existencia - disponible),
    porRecibir: porRecibir.reduce((s, x) => s + Math.max(0, Number(x.cantidad) - Number(x.cantidadRecibida)), 0),
    ultimaVenta: ventas.get(codigo)?.fecha ?? null, ultimaCompra: compras.get(codigo) ?? null, ultimoAjuste: ajuste ? { ...ajuste, fecha: diaCaracas(ajuste.fecha) } : null,
    movimientos: movimientos.map((x) => ({ ...x, fecha: diaCaracas(x.fecha) })), promedios, porMes,
    ventas: [...lineas].sort((x, y) => y.fecha.getTime() - x.fecha.getTime()).slice(0, 50),
    recepciones: recepciones.map((x) => ({ ...x, recepcion: { ...x.recepcion, fecha: diaCaracas(x.recepcion.fecha) } })),
  };
}
