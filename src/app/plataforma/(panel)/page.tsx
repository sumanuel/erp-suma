import Link from "next/link";
import { Etiqueta, EncabezadoPagina, Tarjeta, formatearFechaHora } from "@/components/ui";
import { listarClientes } from "@/lib/nucleo/control";
import { requerirPlataforma } from "@/lib/plataforma/dal";
import { MODULOS } from "@/lib/modulos";
import { readdirSync } from "node:fs";
import { join } from "node:path";

export const metadata = { title: "Plataforma · clientes" };

function ultimaMigracion() {
  try {
    return readdirSync(join(process.cwd(), "prisma", "migrations"), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort().at(-1) ?? null;
  } catch {
    return null;
  }
}

export default async function PanelClientes() {
  await requerirPlataforma();
  const clientes = await listarClientes();
  const ultima = ultimaMigracion();
  const activos = clientes.filter((c) => c.estado === "activo").length;
  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Clientes" descripcion={`${clientes.length} en total · ${activos} activos · ${clientes.length - activos} suspendidos`} />
      <Tarjeta>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-linea text-[12.5px] text-gris-600">
                <th className="px-4 py-3 font-medium">Cliente</th><th className="px-3 py-3 font-medium">Código</th><th className="px-3 py-3 font-medium">Estado</th>
                <th className="px-3 py-3 font-medium">Módulos</th><th className="px-3 py-3 font-medium">Esquema</th><th className="px-3 py-3 font-medium">Base</th>
              </tr>
            </thead>
            <tbody>
              {clientes.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-gris-500">Todavía no hay clientes. Crea uno con <code>npm run cliente:crear</code>.</td></tr>
              ) : clientes.map((c) => {
                const apagados = Object.values(c.modulos).filter((v) => v === false).length;
                return (
                  <tr key={c.id} className="border-b border-linea last:border-0 hover:bg-fondo">
                    <td className="px-4 py-3 font-semibold"><Link href={`/plataforma/${c.slug}`} className="hover:underline">{c.nombre}</Link></td>
                    <td className="px-3 py-3 font-mono text-[12.5px]">{c.slug}</td>
                    <td className="px-3 py-3"><Etiqueta tono={c.estado === "activo" ? "exito" : "aviso"}>{c.estado === "activo" ? "Activo" : "Suspendido"}</Etiqueta></td>
                    <td className="px-3 py-3">{MODULOS.length - apagados} de {MODULOS.length}</td>
                    <td className="px-3 py-3">{c.versionEsquema === ultima ? <Etiqueta tono="exito">Al día</Etiqueta> : <Etiqueta tono="aviso">{c.versionEsquema ? "Atrasado" : "Sin migrar"}</Etiqueta>}</td>
                    <td className="px-3 py-3 font-mono text-[12.5px] text-gris-600">{c.base}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Tarjeta>
      <p className="text-[13px] text-gris-500">Las altas y bajas se hacen por línea de comandos (<code>cliente:crear</code>, <code>cliente:eliminar</code>): la web nunca tiene la contraseña de administrador de PostgreSQL. {formatearFechaHora(new Date())}</p>
    </div>
  );
}
