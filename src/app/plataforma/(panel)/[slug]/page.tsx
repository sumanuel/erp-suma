import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Etiqueta, EncabezadoPagina, Tarjeta, formatearFechaHora } from "@/components/ui";
import { clientePorSlug, poolControl } from "@/lib/nucleo/control";
import { abrirDb } from "@/lib/tenant";
import { requerirPlataforma } from "@/lib/plataforma/dal";
import { BotonEstado } from "./boton-estado";
import { FormularioModulos } from "./formulario-modulos";

export default async function DetalleCliente({ params }: { params: Promise<{ slug: string }> }) {
  await requerirPlataforma();
  const { slug } = await params;
  const c = await clientePorSlug(slug);
  if (!c) notFound();

  // Uso del cliente: se consulta su propia base con el rol de la aplicación. Si está suspendido o no responde, se informa sin romper la pantalla.
  let uso: { usuarios: number; activos: number; ultimoIngreso: Date | null } | null = null;
  if (c.estado === "activo") {
    try {
      const db = await abrirDb(c);
      const [usuarios, activos, ultimo] = await Promise.all([
        db.usuario.count(), db.usuario.count({ where: { activo: true } }),
        db.registroIngreso.findFirst({ where: { exito: true }, orderBy: { creadoEn: "desc" }, select: { creadoEn: true } }),
      ]);
      uso = { usuarios, activos, ultimoIngreso: ultimo?.creadoEn ?? null };
    } catch { /* se muestra "sin datos" */ }
  }
  const registro = await poolControl().query(
    "SELECT accion, exito, detalle, creado_en FROM registro_aprovisionamiento WHERE slug = $1 ORDER BY creado_en DESC LIMIT 10", [slug],
  );
  const apagados = Object.entries(c.modulos).filter(([, v]) => v === false).map(([k]) => k);

  return (
    <div className="flex flex-col gap-6">
      <Link href="/plataforma" className="flex w-fit items-center gap-1 text-[13px] text-gris-600 hover:text-tinta"><ChevronLeft className="size-4" aria-hidden />Clientes</Link>
      <EncabezadoPagina
        titulo={<>{c.nombre} <Etiqueta tono={c.estado === "activo" ? "exito" : "aviso"}>{c.estado === "activo" ? "Activo" : "Suspendido"}</Etiqueta></>}
        descripcion={<span className="font-mono text-[13px]">{c.slug} · {c.base}</span>}
        acciones={<BotonEstado slug={c.slug} nombre={c.nombre} estado={c.estado} />}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["Usuarios", uso ? `${uso.activos} activos de ${uso.usuarios}` : "Sin datos"],
          ["Último ingreso", uso ? formatearFechaHora(uso.ultimoIngreso) : "Sin datos"],
          ["Esquema", c.versionEsquema ?? "Sin migrar"],
        ].map(([t, v]) => (
          <Tarjeta key={t} className="p-4"><p className="text-[12.5px] text-gris-500">{t}</p><p className="mt-1 truncate font-semibold">{v}</p></Tarjeta>
        ))}
      </div>
      <section className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold">Módulos contratados</h2>
        <Tarjeta><FormularioModulos slug={c.slug} apagados={apagados} /></Tarjeta>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold">Historial de operaciones</h2>
        <Tarjeta>
          {registro.rows.length === 0 ? <p className="p-5 text-gris-500">Sin registros.</p> : (
            <ul className="divide-y divide-linea text-[13.5px]">
              {registro.rows.map((r, i) => (
                <li key={i} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <Etiqueta tono={r.exito ? "exito" : "error"}>{r.accion}</Etiqueta>
                  <span className="text-gris-600">{r.detalle ?? ""}</span>
                  <span className="ml-auto text-gris-500">{formatearFechaHora(r.creado_en)}</span>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
      </section>
    </div>
  );
}
