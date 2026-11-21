import { Etiqueta, Tarjeta, claseControl, clasesBoton, formatearFechaHora, type Tono } from "@/components/ui";
import { requerirPermiso } from "@/lib/dal";
import { MODULOS } from "@/lib/modulos";
import { POR_PAGINA, Paginacion } from "./paginacion";

const TONO: Record<string, Tono> = { crear: "exito", editar: "marca", eliminar: "error", otro: "neutro" };
const TEXTO: Record<string, string> = { crear: "Alta", editar: "Cambio", eliminar: "Baja", otro: "Otro" };
const valor = (v: unknown) => (v === null || v === undefined ? "—" : typeof v === "string" ? v : Array.isArray(v) ? v.join(", ") || "—" : JSON.stringify(v));

export default async function Cambios({ searchParams }: { searchParams: Promise<{ modulo?: string; accion?: string; pagina?: string }> }) {
  const { db } = await requerirPermiso("auditoria");
  const q = await searchParams;
  const modulo = MODULOS.some((m) => m.id === q.modulo) ? q.modulo! : "";
  const accion = ["crear", "editar", "eliminar", "otro"].includes(q.accion ?? "") ? q.accion! : "";
  const pagina = Math.max(1, Number(q.pagina) || 1);
  const where = { ...(modulo ? { modulo } : {}), ...(accion ? { accion } : {}) };
  const [total, filas] = await Promise.all([
    db.auditoriaCambio.count({ where }),
    db.auditoriaCambio.findMany({ where, orderBy: { id: "desc" }, skip: (pagina - 1) * POR_PAGINA, take: POR_PAGINA }),
  ]);
  return (
    <Tarjeta>
      <form className="flex flex-wrap items-center gap-3 p-4">
        <select name="modulo" defaultValue={modulo} aria-label="Módulo" className={`${claseControl} w-auto pr-9`}>
          <option value="">Todos los módulos</option>
          {MODULOS.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
        </select>
        <select name="accion" defaultValue={accion} aria-label="Acción" className={`${claseControl} w-auto pr-9`}>
          <option value="">Todas las acciones</option>
          {Object.entries(TEXTO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className={clasesBoton("secundario")}>Filtrar</button>
      </form>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13.5px]">
          <thead>
            <tr className="border-y border-linea text-[12.5px] text-gris-600">
              <th className="px-4 py-3 font-medium">Fecha</th><th className="px-3 py-3 font-medium">Usuario</th><th className="px-3 py-3 font-medium">Acción</th>
              <th className="px-3 py-3 font-medium">Registro</th><th className="px-4 py-3 font-medium">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-gris-500">No hay cambios registrados.</td></tr>
            ) : filas.map((f) => {
              const antes = (f.antes ?? {}) as Record<string, unknown>;
              const despues = (f.despues ?? {}) as Record<string, unknown>;
              const campos = [...new Set([...Object.keys(antes), ...Object.keys(despues)])];
              return (
                <tr key={f.id.toString()} className="border-b border-linea align-top last:border-0">
                  <td className="whitespace-nowrap px-4 py-3 text-gris-600">{formatearFechaHora(f.creadoEn)}</td>
                  <td className="px-3 py-3">{f.usuarioNombre ?? "—"}</td>
                  <td className="px-3 py-3"><Etiqueta tono={TONO[f.accion] ?? "neutro"}>{TEXTO[f.accion] ?? f.accion}</Etiqueta></td>
                  <td className="px-3 py-3"><span className="font-semibold">{f.descripcion ?? f.entidadId}</span><span className="block text-[12.5px] text-gris-500">{MODULOS.find((m) => m.id === f.modulo)?.nombre ?? f.modulo} · {f.entidad}</span></td>
                  <td className="px-4 py-3">
                    {campos.length === 0 ? <span className="text-gris-500">—</span> : (
                      <details>
                        <summary className="cursor-pointer text-marca-texto">{campos.length} {campos.length === 1 ? "campo" : "campos"}</summary>
                        <dl className="mt-2 flex flex-col gap-1 text-[12.5px]">
                          {campos.map((c) => (
                            <div key={c} className="flex flex-wrap gap-x-2"><dt className="font-medium">{c}:</dt>
                              <dd className="text-gris-600">{f.accion === "crear" ? valor(despues[c]) : f.accion === "eliminar" ? valor(antes[c]) : `${valor(antes[c])} → ${valor(despues[c])}`}</dd></div>
                          ))}
                        </dl>
                      </details>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Paginacion pagina={pagina} total={total} ruta="/auditoria" params={{ ...(modulo ? { modulo } : {}), ...(accion ? { accion } : {}) }} />
    </Tarjeta>
  );
}
