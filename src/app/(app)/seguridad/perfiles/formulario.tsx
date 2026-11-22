"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Aviso, Campo, clasesBoton } from "@/components/ui";
import { ACCIONES, MODULOS, PERMISOS_ESPECIALES, permiso } from "@/lib/modulos";
import { guardarPerfil, type EstadoPerfil } from "./acciones";

const TITULOS: Record<(typeof ACCIONES)[number], string> = { ver: "Ver", crear: "Crear", editar: "Editar", eliminar: "Eliminar", exportar: "Exportar" };

export function FormularioPerfil({ id, inicial, textoBoton }: {
  id: string | null; textoBoton: string;
  inicial: { nombre: string; descripcion: string; activo: boolean; esAdministrador: boolean; permisos: string[] };
}) {
  const [estado, accion, pendiente] = useActionState<EstadoPerfil, FormData>(guardarPerfil.bind(null, id), {});
  const [marcados, setMarcados] = useState(() => new Set(inicial.permisos));
  const alternar = (p: string, on: boolean) => setMarcados((a) => { const n = new Set(a); if (on) n.add(p); else n.delete(p); return n; });
  const fila = (modulo: string, on: boolean) => setMarcados((a) => { const n = new Set(a); for (const ac of ACCIONES) { if (on) n.add(permiso(modulo, ac)); else n.delete(permiso(modulo, ac)); } return n; });
  return (
    <form action={accion} className="flex flex-col gap-6 p-6">
      {estado.error ? <Aviso tono="error">{estado.error}</Aviso> : null}
      {inicial.esAdministrador ? <Aviso tono="marca">Este perfil es administrador: tiene acceso total sin importar los permisos marcados.</Aviso> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <Campo etiqueta="Nombre" name="nombre" defaultValue={inicial.nombre} error={estado.errores?.nombre} />
        <Campo etiqueta="Descripción (opcional)" name="descripcion" defaultValue={inicial.descripcion} />
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="activo" defaultChecked={inicial.activo} className="size-4 accent-marca-fuerte" /> Perfil activo</label>
      <div className="overflow-x-auto rounded-[12px] border border-borde">
        <table className="w-full text-left text-[13.5px]">
          <thead>
            <tr className="border-b border-linea bg-fondo text-[12.5px] text-gris-600">
              <th className="px-4 py-3 font-medium">Módulo</th>
              {ACCIONES.map((a) => <th key={a} className="px-3 py-3 text-center font-medium">{TITULOS[a]}</th>)}
              <th className="px-3 py-3 text-center font-medium">Todo</th>
            </tr>
          </thead>
          <tbody>
            {MODULOS.map((m) => {
              const completo = ACCIONES.every((a) => marcados.has(permiso(m.id, a)));
              return (
                <tr key={m.id} className="border-b border-linea last:border-0">
                  <td className="px-4 py-2.5 font-medium">{m.nombre}</td>
                  {ACCIONES.map((a) => {
                    const p = permiso(m.id, a);
                    return (
                      <td key={a} className="px-3 py-2.5 text-center">
                        <input type="checkbox" name="permiso" value={p} checked={marcados.has(p)} onChange={(e) => alternar(p, e.target.checked)} aria-label={`${m.nombre}: ${TITULOS[a]}`} className="size-4 accent-marca-fuerte" />
                      </td>
                    );
                  })}
                  <td className="px-3 py-2.5 text-center">
                    <input type="checkbox" checked={completo} onChange={(e) => fila(m.id, e.target.checked)} aria-label={`${m.nombre}: todo`} className="size-4 accent-marca-fuerte" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="rounded-[12px] border border-borde p-4">
        <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-gris-600">Permisos especiales</h3>
        <div className="flex flex-col gap-2">
          {PERMISOS_ESPECIALES.map((p) => (
            <label key={p.id} className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="permiso" value={p.id} checked={marcados.has(p.id)} onChange={(e) => alternar(p.id, e.target.checked)} className="mt-0.5 size-4 accent-marca-fuerte" />
              <span><span className="font-medium">{p.nombre}</span> <span className="text-gris-500">{p.ayuda}</span></span>
            </label>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pendiente} className={clasesBoton("primario")}>{pendiente ? "Guardando…" : textoBoton}</button>
        <Link href="/seguridad/perfiles" className="px-2 text-sm text-gris-700 hover:text-tinta">Cancelar</Link>
      </div>
    </form>
  );
}
