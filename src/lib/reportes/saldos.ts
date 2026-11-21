import "server-only";
import type { Db } from "@/lib/tenant";
import { TRAMOS, diasMora, tramoDeMora, type TramoId } from "@/lib/cxc/estados";
import { hoyCaracas } from "@/lib/tasas";
import { redondear2 } from "./ayudas";
import type { Columna, Fila, Resultado } from "./tipos";

// Antigüedad de saldos de cuentas por cobrar y por pagar (USD), medida contra el vencimiento de cada factura al día de hoy.
type Abierta = { tercero: string; documento: string; numero: string; fecha: Date; vence: Date; saldo: number };

function armar(abiertas: Abierta[], vista: string, etiquetaTercero: string): Resultado {
  const hoy = hoyCaracas();
  const vacio = (): Record<TramoId, number> => ({ porVencer: 0, d1_30: 0, d31_60: 0, d61_90: 0, d91: 0 });
  if (vista === "detalle") {
    const filas: Fila[] = abiertas
      .map((a) => ({ tercero: a.tercero, numero: a.numero, documento: a.documento, fecha: a.fecha, vence: a.vence, mora: Math.max(diasMora(hoy, a.vence), 0), saldo: redondear2(a.saldo) }))
      .sort((x, y) => (x.tercero as string).localeCompare(y.tercero as string) || (x.vence as Date).getTime() - (y.vence as Date).getTime());
    return {
      columnas: [
        { clave: "tercero", titulo: etiquetaTercero, tipo: "texto" }, { clave: "numero", titulo: "Interno", tipo: "texto" }, { clave: "documento", titulo: "Documento", tipo: "texto" },
        { clave: "fecha", titulo: "Fecha", tipo: "fecha" }, { clave: "vence", titulo: "Vence", tipo: "fecha" }, { clave: "mora", titulo: "Días de mora", tipo: "entero" }, { clave: "saldo", titulo: "Saldo USD", tipo: "moneda" },
      ],
      filas, totales: { saldo: redondear2(filas.reduce((s, f) => s + (f.saldo as number), 0)) },
    };
  }
  const m = new Map<string, { nombre: string; t: Record<TramoId, number> }>();
  for (const a of abiertas) {
    const x = m.get(a.tercero) ?? { nombre: a.tercero, t: vacio() };
    x.t[tramoDeMora(diasMora(hoy, a.vence))] += a.saldo;
    m.set(a.tercero, x);
  }
  const filas: Fila[] = [...m.values()]
    .map((x) => ({ tercero: x.nombre, ...Object.fromEntries(TRAMOS.map((t) => [t.id, redondear2(x.t[t.id])])), total: redondear2(Object.values(x.t).reduce((s, n) => s + n, 0)) }) as Fila)
    .sort((a, b) => (b.total as number) - (a.total as number));
  const columnas: Columna[] = [{ clave: "tercero", titulo: etiquetaTercero, tipo: "texto" }, ...TRAMOS.map((t) => ({ clave: t.id, titulo: `${t.etiqueta} USD`, tipo: "moneda" as const })), { clave: "total", titulo: "Total USD", tipo: "moneda" }];
  const totales = Object.fromEntries([...TRAMOS.map((t) => t.id), "total"].map((k) => [k, redondear2(filas.reduce((s, f) => s + (f[k] as number), 0))]));
  return { columnas, filas, totales };
}

export async function reporteAntiguedadCxc(db: Db, v: Record<string, string>): Promise<Resultado> {
  const r = await db.factura.findMany({ where: { estado: "EMITIDA", saldo: { gt: 0 } }, include: { cliente: { select: { razonSocial: true } } } });
  return armar(r.map((f) => ({ tercero: f.cliente.razonSocial, documento: f.pedidoId ? "Pedido" : "Directa", numero: `FAC-${String(f.numero).padStart(6, "0")}`, fecha: f.fecha, vence: f.fechaVencimiento, saldo: Number(f.saldo) })), v.vista, "Cliente");
}

export async function reporteAntiguedadCxp(db: Db, v: Record<string, string>): Promise<Resultado> {
  const r = await db.facturaCompra.findMany({ where: { estado: "REGISTRADA", saldo: { gt: 0 } }, include: { proveedor: { select: { razonSocial: true } } } });
  return armar(r.map((f) => ({ tercero: f.proveedor.razonSocial, documento: f.documento, numero: `FC-${String(f.numero).padStart(6, "0")}`, fecha: f.fecha, vence: f.fechaVencimiento, saldo: Number(f.saldo) })), v.vista, "Proveedor");
}
