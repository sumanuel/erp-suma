import { requerirSesion } from "@/lib/dal";
import { tasaVigente } from "@/lib/tasas";
import { Etiquetas } from "./etiquetas";

/** Pantalla «Etiquetas» del módulo Productos: etiquetas de góndola con precio en USD y Bs. y código de barras. */
export async function PaginaEtiquetas() {
  const { db } = await requerirSesion();
  const [tasa, listas] = await Promise.all([
    tasaVigente(db, "USD"),
    db.productoPrecio.findMany({ distinct: ["lista"], select: { lista: true }, orderBy: { lista: "asc" } }),
  ]);
  const nombres = [...new Set(["A", ...listas.map((l) => l.lista)])].sort();
  return <Etiquetas tasa={tasa?.valor ?? null} listas={nombres} />;
}
