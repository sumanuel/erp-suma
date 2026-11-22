import Link from "next/link";
import { notFound } from "next/navigation";
import { Etiqueta, Tarjeta, clasesBoton } from "@/components/ui";
import { requerirSesion, tienePermiso } from "@/lib/dal";
import { MONEDAS_CUENTA, TIPOS_CUENTA, TIPOS_MOVIMIENTO_TESORERIA, formatoMonto, type TipoMovimientoTesoreria } from "@/lib/tesoreria/tipos";
import { formatoFechaHora } from "../../formato";
import { CasillaConciliado } from "./conciliar";
import { Chequeras } from "./chequeras";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function LibroCuenta({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pendientes?: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { pendientes } = await searchParams;
  const ctx = await requerirSesion();
  const c = await ctx.db.cuentaTesoreria.findUnique({ where: { id } });
  if (!c) notFound();
  const soloPendientes = pendientes === "1";
  const chequeras = c.tipo === "BANCO" ? await ctx.db.chequera.findMany({ where: { cuentaId: id }, orderBy: { desde: "asc" } }) : [];
  const [movimientos, sinConciliar] = await Promise.all([
    ctx.db.movimientoTesoreria.findMany({ where: { cuentaId: id, ...(soloPendientes ? { conciliado: false } : {}) }, orderBy: { id: "desc" }, take: 300 }),
    ctx.db.movimientoTesoreria.aggregate({ where: { cuentaId: id, conciliado: false }, _sum: { monto: true }, _count: true }),
  ]);
  const m = MONEDAS_CUENTA[c.moneda as "USD" | "VES"];
  const puedeCrear = tienePermiso(ctx, "tesoreria", "crear");
  const puedeEditar = tienePermiso(ctx, "tesoreria", "editar");
  return (
    <div className="flex flex-col gap-6">
      <Tarjeta className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold">{c.codigo} · {c.nombre}</h2>
              <Etiqueta tono={c.activo ? "exito" : "neutro"}>{c.activo ? "Activa" : "Inactiva"}</Etiqueta>
            </div>
            <p className="text-sm text-gris-600">{TIPOS_CUENTA[c.tipo as keyof typeof TIPOS_CUENTA]} · {m.etiqueta}{c.banco ? ` · ${c.banco}` : ""}{c.numeroCuenta ? ` · ${c.numeroCuenta}` : ""}{c.permiteSobregiro ? " · permite sobregiro" : ""}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {puedeCrear && c.activo ? (
              <>
                <Link href={`/tesoreria/movimientos/nuevo?cuenta=${id}&tipo=INGRESO`} className={clasesBoton("secundario")}>Registrar ingreso</Link>
                <Link href={`/tesoreria/movimientos/nuevo?cuenta=${id}&tipo=EGRESO`} className={clasesBoton("secundario")}>Registrar egreso</Link>
              </>
            ) : null}
            {puedeEditar ? <Link href={`/tesoreria/cuentas/${id}/editar`} className={clasesBoton("secundario")}>Editar</Link> : null}
          </div>
        </div>
        <dl className="mt-4 grid gap-3 text-[13.5px] sm:grid-cols-3">
          <div><dt className="text-gris-500">Saldo actual</dt><dd className={`text-xl font-semibold tabular-nums ${Number(c.saldo) < 0 ? "text-error" : ""}`}>{m.simbolo} {formatoMonto(Number(c.saldo))}</dd></div>
          <div><dt className="text-gris-500">Movimientos sin conciliar</dt><dd className="text-lg font-semibold tabular-nums">{sinConciliar._count}</dd></div>
          <div><dt className="text-gris-500">Neto sin conciliar</dt><dd className="text-lg font-semibold tabular-nums">{m.simbolo} {formatoMonto(Number(sinConciliar._sum.monto ?? 0))}</dd></div>
        </dl>
      </Tarjeta>

      {c.tipo === "BANCO" ? (
        <Tarjeta className="p-6">
          <h3 className="mb-3 text-base font-semibold">Datos bancarios</h3>
          <dl className="grid gap-3 text-[13.5px] sm:grid-cols-2 xl:grid-cols-4">
            <div><dt className="text-gris-500">Titular</dt><dd>{c.titular ?? "—"}</dd></div>
            <div><dt className="text-gris-500">Sucursal</dt><dd>{c.sucursal ?? "—"}</dd></div>
            <div><dt className="text-gris-500">Tipo de cuenta</dt><dd>{c.tipoCuentaBancaria === "CORRIENTE" ? "Corriente" : c.tipoCuentaBancaria === "AHORRO" ? "Ahorro" : "—"}</dd></div>
            <div><dt className="text-gris-500">Descripción</dt><dd>{c.descripcion ?? "—"}</dd></div>
            <div><dt className="text-gris-500">Acepta depósitos</dt><dd>{c.aceptaDepositos ? "Sí" : "No"}</dd></div>
            <div><dt className="text-gris-500">Acepta pagos</dt><dd>{c.aceptaPagos ? "Sí" : "No"}</dd></div>
            <div><dt className="text-gris-500">ITF</dt><dd>{Number(c.itfPorcentaje) > 0 ? `${Number(c.itfPorcentaje)} %${c.itfDesde ? ` desde ${c.itfDesde.toISOString().slice(0, 10)}` : ""}${c.itfHasta ? ` hasta ${c.itfHasta.toISOString().slice(0, 10)}` : ""}` : "No aplica"}</dd></div>
            <div><dt className="text-gris-500">Formato de cheque</dt><dd>{c.formatoCheque ?? "—"}</dd></div>
          </dl>
        </Tarjeta>
      ) : null}

      {c.tipo === "BANCO" ? <Chequeras cuentaId={id} chequeras={chequeras.map((q) => ({ id: q.id, desde: q.desde, hasta: q.hasta, ultimoCheque: q.ultimoCheque, activa: q.activa }))} puedeEditar={puedeEditar} puedeEliminar={tienePermiso(ctx, "tesoreria", "eliminar")} /> : null}

      <Tarjeta>
        <div className="flex items-center justify-between gap-3 p-4">
          <h3 className="text-base font-semibold">Libro de movimientos</h3>
          <Link href={soloPendientes ? `/tesoreria/cuentas/${id}` : `/tesoreria/cuentas/${id}?pendientes=1`} className="text-[13px] text-marca-texto hover:underline">{soloPendientes ? "Ver todos" : "Ver solo sin conciliar"}</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13.5px]">
            <thead>
              <tr className="border-y border-linea text-[12.5px] text-gris-600">
                <th className="px-4 py-3 font-medium">Fecha</th><th className="px-3 py-3 font-medium">Tipo</th><th className="px-3 py-3 font-medium">Documento</th><th className="px-3 py-3 font-medium">Concepto</th>
                <th className="px-3 py-3 text-right font-medium">Monto</th><th className="px-3 py-3 text-right font-medium">Saldo</th><th className="px-4 py-3 font-medium">Conciliado</th>
              </tr>
            </thead>
            <tbody>
              {movimientos.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-gris-500">Sin movimientos{soloPendientes ? " pendientes de conciliar" : ""}.</td></tr>
              ) : movimientos.map((x) => (
                <tr key={String(x.id)} className="border-b border-linea last:border-0">
                  <td className="px-4 py-3">{formatoFechaHora(x.fecha)}</td>
                  <td className="px-3 py-3">{TIPOS_MOVIMIENTO_TESORERIA[x.tipo as TipoMovimientoTesoreria]?.etiqueta ?? x.tipo}</td>
                  <td className="px-3 py-3">{x.documento ?? "—"}</td>
                  <td className="px-3 py-3">{x.descripcion ?? "—"}</td>
                  <td className={`px-3 py-3 text-right tabular-nums ${Number(x.monto) < 0 ? "text-error" : ""}`}>{formatoMonto(Number(x.monto))}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatoMonto(Number(x.saldoDespues))}</td>
                  <td className="px-4 py-3"><CasillaConciliado cuentaId={id} movimientoId={String(x.id)} conciliado={x.conciliado} puedeEditar={puedeEditar} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>
    </div>
  );
}
