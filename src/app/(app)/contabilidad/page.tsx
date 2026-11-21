import Link from "next/link";
import { Pencil, Plus } from "lucide-react";
import { Etiqueta, Tarjeta, clasesBoton } from "@/components/ui";
import { requerirSesion, tienePermiso } from "@/lib/dal";
import { TIPOS_CUENTA_CONTABLE, type TipoCuentaContable } from "@/lib/contabilidad/tipos";
import { BotonEliminar } from "../seguridad/boton-eliminar";
import { eliminarCuenta } from "./acciones";

export default async function PlanDeCuentas() {
  const ctx = await requerirSesion();
  const cuentas = await ctx.db.cuentaContable.findMany({ orderBy: { codigo: "asc" }, include: { _count: { select: { hijas: true, lineas: true } } } });
  // El orden alfabético de «1.10» antes que «1.2» no sirve: se ordena por tramos numéricos.
  const clave = (c: string) => c.split(".").map((n) => n.padStart(6, "0")).join(".");
  cuentas.sort((a, b) => clave(a.codigo).localeCompare(clave(b.codigo)));
  const puedeCrear = tienePermiso(ctx, "contabilidad", "crear");
  const puedeEditar = tienePermiso(ctx, "contabilidad", "editar");
  const puedeEliminar = tienePermiso(ctx, "contabilidad", "eliminar");
  return (
    <Tarjeta>
      <div className="flex items-center justify-between gap-3 p-4">
        <p className="text-[13px] text-gris-500">{cuentas.length} {cuentas.length === 1 ? "cuenta" : "cuentas"}</p>
        {puedeCrear ? <Link href="/contabilidad/cuentas/nueva" className={clasesBoton("primario")}><Plus className="size-4" aria-hidden />Nueva cuenta</Link> : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13.5px]">
          <thead>
            <tr className="border-y border-linea text-[12.5px] text-gris-600">
              <th className="px-4 py-3 font-medium">Código</th><th className="px-3 py-3 font-medium">Cuenta</th><th className="px-3 py-3 font-medium">Tipo</th>
              <th className="px-3 py-3 font-medium">Clase</th><th className="px-3 py-3 font-medium">Estado</th><th className="px-4 py-3 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {cuentas.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-gris-500">Todavía no hay plan de cuentas. Crea las cuentas de primer nivel (1 Activo, 2 Pasivo…).</td></tr>
            ) : cuentas.map((c) => (
              <tr key={c.id} className="border-b border-linea last:border-0">
                <td className="px-4 py-2.5 font-semibold tabular-nums">{c.codigo}</td>
                <td className="px-3 py-2.5" style={{ paddingLeft: `${0.75 + (c.nivel - 1) * 1.25}rem` }}><span className={c.posteable ? "" : "font-semibold"}>{c.nombre}</span></td>
                <td className="px-3 py-2.5">{TIPOS_CUENTA_CONTABLE[c.tipo as TipoCuentaContable]?.etiqueta ?? c.tipo}</td>
                <td className="px-3 py-2.5">{c.posteable ? "Movimiento" : "Agrupa"}</td>
                <td className="px-3 py-2.5"><Etiqueta tono={c.activo ? "exito" : "neutro"}>{c.activo ? "Activa" : "Inactiva"}</Etiqueta></td>
                <td className="px-4 py-2">
                  <div className="flex items-center justify-end gap-2">
                    {puedeEditar ? <Link href={`/contabilidad/cuentas/${c.id}/editar`} aria-label={`Editar ${c.codigo}`} className="flex size-9 items-center justify-center rounded-[9px] border border-borde-campo hover:bg-hover"><Pencil className="size-4" aria-hidden /></Link> : null}
                    {puedeEliminar && c._count.hijas === 0 && c._count.lineas === 0 ? <BotonEliminar nombre={`${c.codigo} ${c.nombre}`} accion={eliminarCuenta.bind(null, c.id)} /> : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Tarjeta>
  );
}
