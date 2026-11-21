import { requerirSesion, tienePermiso } from "@/lib/dal";
import { resolverParametros } from "@/lib/reportes/ayudas";
import { aCsv } from "@/lib/reportes/csv";
import { buscarReporte } from "@/lib/reportes/registro";

// Descarga el reporte en CSV con los mismos parámetros y la misma consulta que la pantalla.
export async function GET(req: Request, { params }: { params: Promise<{ reporte: string }> }) {
  const { reporte } = await params;
  const def = buscarReporte(reporte);
  if (!def) return new Response("Reporte inexistente", { status: 404 });
  const ctx = await requerirSesion();
  if (!tienePermiso(ctx, "reportes", "exportar")) return new Response("Sin permiso para exportar", { status: 403 });
  const parametros = await def.parametros(ctx.db);
  const url = new URL(req.url);
  const valores = resolverParametros(parametros, Object.fromEntries(url.searchParams));
  const resultado = await def.consultar(ctx.db, valores);
  const nombre = `reporte-${def.id}-${valores.hasta ?? new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(aCsv(resultado, def.titulo), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${nombre}"`, "Cache-Control": "no-store" },
  });
}
