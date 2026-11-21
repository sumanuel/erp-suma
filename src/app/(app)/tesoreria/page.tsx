import Link from "next/link";
import { Pencil, Plus } from "lucide-react";
import { Etiqueta, Tarjeta, clasesBoton } from "@/components/ui";
import { requerirSesion, tienePermiso } from "@/lib/dal";
import { MONEDAS_CUENTA, TIPOS_CUENTA, formatoMonto } from "@/lib/tesoreria/tipos";

export default async function Cuentas() {
  const ctx = await requerirSesion();
  const cuentas = await ctx.db.cuentaTesoreria.findMany({ orderBy: [{ moneda: "asc" }, { nombre: "asc" }] });
  const totales = { USD: 0, VES: 0 };
  for (const c of cuentas) if (c.activo) totales[c.moneda as "USD" | "VES"] += Number(c.saldo);
  const puedeCrear = tienePermiso(ctx, "tesoreria", "crear");
  const puedeEditar = tienePermiso(ctx, "tesoreria", "editar");
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-2">
        {(["USD", "VES"] as const).map((m) => (
          <Tarjeta key={m} className="p-4"><p className="text-[12.5px] text-gris-500">Total en {MONEDAS_CUENTA[m].etiqueta}</p><p className="mt-1 text-xl font-semibold tabular-nums">{MONEDAS_CUENTA[m].simbolo} {formatoMonto(totales[m])}</p></Tarjeta>
        ))}
      </div>
      <Tarjeta>
        <div className="flex items-center justify-between gap-3 p-4">
          <p className="text-[13px] text-gris-500">{cuentas.length} {cuentas.length === 1 ? "cuenta" : "cuentas"}</p>
          {puedeCrear ? <Link href="/tesoreria/cuentas/nueva" className={clasesBoton("primario")}><Plus className="size-4" aria-hidden />Nueva cuenta</Link> : null}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13.5px]">
            <thead>
              <tr className="border-y border-linea text-[12.5px] text-gris-600">
                <th className="px-4 py-3 font-medium">Código</th><th className="px-3 py-3 font-medium">Cuenta</th><th className="px-3 py-3 font-medium">Tipo</th><th className="px-3 py-3 font-medium">Banco</th>
                <th className="px-3 py-3 font-medium">Estado</th><th className="px-3 py-3 text-right font-medium">Saldo</th><th className="px-4 py-3 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {cuentas.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-gris-500">Todavía no hay cuentas. Crea una caja o una cuenta bancaria para registrar cobros y pagos.</td></tr>
              ) : cuentas.map((c) => (
                <tr key={c.id} className="border-b border-linea last:border-0">
                  <td className="px-4 py-3 font-semibold"><Link href={`/tesoreria/cuentas/${c.id}`} className="hover:underline">{c.codigo}</Link></td>
                  <td className="px-3 py-3">{c.nombre}</td>
                  <td className="px-3 py-3">{TIPOS_CUENTA[c.tipo as keyof typeof TIPOS_CUENTA] ?? c.tipo}</td>
                  <td className="px-3 py-3">{c.banco ?? "—"}</td>
                  <td className="px-3 py-3"><Etiqueta tono={c.activo ? "exito" : "neutro"}>{c.activo ? "Activa" : "Inactiva"}</Etiqueta></td>
                  <td className={`px-3 py-3 text-right tabular-nums ${Number(c.saldo) < 0 ? "text-error" : ""}`}>{MONEDAS_CUENTA[c.moneda as "USD" | "VES"].simbolo} {formatoMonto(Number(c.saldo))}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Link href={`/tesoreria/cuentas/${c.id}`} className={clasesBoton("secundario")}>Libro</Link>
                      {puedeEditar ? <Link href={`/tesoreria/cuentas/${c.id}/editar`} aria-label={`Editar ${c.codigo}`} className="flex size-9 items-center justify-center rounded-[9px] border border-borde-campo hover:bg-hover"><Pencil className="size-4" aria-hidden /></Link> : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>
    </div>
  );
}
