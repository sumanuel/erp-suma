import { Etiqueta, Tarjeta, formatearFechaHora } from "@/components/ui";
import { requerirPermiso } from "@/lib/dal";
import { POR_PAGINA, Paginacion } from "../paginacion";

const MOTIVOS: Record<string, string> = { ok: "Ingreso correcto", contrasena: "Contraseña incorrecta", usuario_inexistente: "Usuario inexistente", inactivo: "Usuario o perfil inactivo", bloqueado: "Cuenta bloqueada" };

export default async function Ingresos({ searchParams }: { searchParams: Promise<{ pagina?: string }> }) {
  const { db } = await requerirPermiso("auditoria");
  const pagina = Math.max(1, Number((await searchParams).pagina) || 1);
  const [total, filas] = await Promise.all([
    db.registroIngreso.count(),
    db.registroIngreso.findMany({ orderBy: { id: "desc" }, skip: (pagina - 1) * POR_PAGINA, take: POR_PAGINA }),
  ]);
  return (
    <Tarjeta>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13.5px]">
          <thead>
            <tr className="border-b border-linea text-[12.5px] text-gris-600">
              <th className="px-4 py-3 font-medium">Fecha</th><th className="px-3 py-3 font-medium">Correo</th><th className="px-3 py-3 font-medium">Resultado</th><th className="px-3 py-3 font-medium">IP</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-12 text-center text-gris-500">No hay ingresos registrados.</td></tr>
            ) : filas.map((f) => (
              <tr key={f.id.toString()} className="border-b border-linea last:border-0">
                <td className="whitespace-nowrap px-4 py-3 text-gris-600">{formatearFechaHora(f.creadoEn)}</td>
                <td className="px-3 py-3">{f.email}</td>
                <td className="px-3 py-3"><Etiqueta tono={f.exito ? "exito" : "error"}>{MOTIVOS[f.motivo ?? ""] ?? f.motivo ?? (f.exito ? "Correcto" : "Fallido")}</Etiqueta></td>
                <td className="px-3 py-3 text-gris-600">{f.ip ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Paginacion pagina={pagina} total={total} ruta="/auditoria/ingresos" params={{}} />
    </Tarjeta>
  );
}
