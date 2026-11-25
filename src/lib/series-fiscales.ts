import "server-only";
import type { Db } from "@/lib/tenant";

/** Series fiscales activas de un tipo de documento (FACTURA, NOTA_CREDITO o NOTA_DEBITO), para llenar la impresora al registrar los datos fiscales. */
export async function seriesDe(db: Db, documento: "FACTURA" | "NOTA_CREDITO" | "NOTA_DEBITO") {
  const r = await db.serieFiscal.findMany({ where: { activo: true, documento }, orderBy: { serie: "asc" }, select: { id: true, serie: true, serial: true, impresora: true } });
  return r.map((s) => ({ id: s.id, etiqueta: s.impresora ? `${s.serie} · ${s.impresora}` : s.serie, serial: s.serial ?? "", modelo: s.impresora ?? "" }));
}
