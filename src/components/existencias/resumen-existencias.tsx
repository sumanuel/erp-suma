import { Etiqueta, Tarjeta } from "@/components/ui";
import type { Db } from "@/lib/tenant";

const num = new Intl.NumberFormat("es-VE", { maximumFractionDigits: 2 });

/** Tarjetas de resumen del inventario: productos con saldo, valor a costo promedio (USD) y productos bajo su mínimo. */
export async function ResumenExistencias({ db }: { db: Db }) {
  const [valor] = await db.$queryRaw<{ productos: bigint; valor: string | null }[]>`
    SELECT count(DISTINCT e.producto_codigo) FILTER (WHERE e.cantidad > 0) AS productos,
           coalesce(sum(e.cantidad * p.costo_promedio), 0)::text AS valor
    FROM existencia e JOIN producto p ON p.codigo = e.producto_codigo`;
  const [bajo] = await db.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM producto p
    WHERE p.activo AND p.existencia_minima > 0
      AND coalesce((SELECT sum(e.cantidad) FROM existencia e WHERE e.producto_codigo = p.codigo), 0) < p.existencia_minima`;
  const alertas = Number(bajo?.n ?? 0);
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Tarjeta className="p-4"><p className="text-[13px] font-medium text-gris-600">Productos con existencia</p><p className="mt-1 text-[26px] font-semibold tracking-[-0.02em]">{Number(valor?.productos ?? 0)}</p></Tarjeta>
      <Tarjeta className="p-4"><p className="text-[13px] font-medium text-gris-600">Valor del inventario (USD)</p><p className="mt-1 text-[26px] font-semibold tracking-[-0.02em]">{num.format(Number(valor?.valor ?? 0))}</p><p className="text-[12.5px] text-gris-500">A costo promedio</p></Tarjeta>
      <Tarjeta className="p-4">
        <div className="flex items-center justify-between gap-2"><p className="text-[13px] font-medium text-gris-600">Bajo su mínimo</p>{alertas > 0 ? <Etiqueta tono="aviso">Revisar</Etiqueta> : <Etiqueta tono="exito">Todo en orden</Etiqueta>}</div>
        <p className="mt-1 text-[26px] font-semibold tracking-[-0.02em]">{alertas}</p><p className="text-[12.5px] text-gris-500">Productos activos con existencia total menor al mínimo</p>
      </Tarjeta>
    </div>
  );
}
