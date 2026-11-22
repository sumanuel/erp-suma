"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Aviso, Etiqueta, Tarjeta, clasesBoton, claseControl } from "@/components/ui";
import { agregarChequeraCuenta, cambiarChequeraCuenta, eliminarChequeraCuenta } from "../../acciones";

type Fila = { id: string; desde: number; hasta: number; ultimoCheque: number; activa: boolean };
const entero = (s: string) => (s.trim() === "" ? null : Number(s));

/** Talonarios de cheques de la cuenta: rango, último cheque usado y cuál está activa (de ella salen los números al pagar con cheque). */
export function Chequeras({ cuentaId, chequeras, puedeEditar, puedeEliminar }: { cuentaId: string; chequeras: Fila[]; puedeEditar: boolean; puedeEliminar: boolean }) {
  const router = useRouter();
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [ultimo, setUltimo] = useState("");
  const [activa, setActiva] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function agregar() {
    setError(null);
    iniciar(async () => {
      const r = await agregarChequeraCuenta(cuentaId, { desde: Number(desde), hasta: Number(hasta), ultimoCheque: entero(ultimo), activa });
      if (r.error) setError(r.error);
      else { setDesde(""); setHasta(""); setUltimo(""); router.refresh(); }
    });
  }
  function accion(f: () => Promise<string | null>) {
    setError(null);
    iniciar(async () => {
      const e = await f();
      if (e) setError(e);
      else router.refresh();
    });
  }

  return (
    <Tarjeta className="p-6">
      <h3 className="mb-3 text-base font-semibold">Chequeras</h3>
      {error ? <div className="mb-3"><Aviso tono="error">{error}</Aviso></div> : null}
      <table className="w-full text-left text-[13.5px]">
        <thead><tr className="border-y border-linea text-[12.5px] text-gris-600"><th className="px-3 py-2.5 font-medium">Desde</th><th className="px-3 py-2.5 font-medium">Hasta</th><th className="px-3 py-2.5 font-medium">Último usado</th><th className="px-3 py-2.5 font-medium">Disponibles</th><th className="px-3 py-2.5 font-medium">Estado</th><th className="px-3 py-2.5" /></tr></thead>
        <tbody>
          {chequeras.length === 0 ? <tr><td colSpan={6} className="px-3 py-6 text-center text-gris-500">Esta cuenta no tiene chequeras registradas.</td></tr> : chequeras.map((q) => (
            <tr key={q.id} className="border-b border-linea last:border-0">
              <td className="px-3 py-2.5 tabular-nums">{q.desde}</td><td className="px-3 py-2.5 tabular-nums">{q.hasta}</td>
              <td className="px-3 py-2.5 tabular-nums">{q.ultimoCheque >= q.desde ? q.ultimoCheque : "—"}</td>
              <td className="px-3 py-2.5 tabular-nums">{q.hasta - q.ultimoCheque}</td>
              <td className="px-3 py-2.5">{q.activa ? <Etiqueta tono="exito">Activa</Etiqueta> : q.ultimoCheque >= q.hasta ? <Etiqueta tono="neutro">Agotada</Etiqueta> : <Etiqueta tono="neutro">Inactiva</Etiqueta>}</td>
              <td className="px-3 py-2.5 text-right">
                <div className="flex justify-end gap-2">
                  {puedeEditar ? <button type="button" disabled={pendiente} onClick={() => accion(() => cambiarChequeraCuenta(cuentaId, q.id, !q.activa))} className={clasesBoton("secundario", "!px-2.5 !py-1")}>{q.activa ? "Desactivar" : "Activar"}</button> : null}
                  {puedeEliminar && q.ultimoCheque < q.desde ? <button type="button" disabled={pendiente} onClick={() => accion(() => eliminarChequeraCuenta(cuentaId, q.id))} className={clasesBoton("secundario", "!px-2.5 !py-1")}>Eliminar</button> : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {puedeEditar ? (
        <form onSubmit={(e) => { e.preventDefault(); agregar(); }} className="mt-4 grid items-end gap-3 md:grid-cols-5">
          <div className="flex flex-col gap-1.5"><label htmlFor="chDesde" className="text-[13px] font-medium">Desde</label><input id="chDesde" inputMode="numeric" value={desde} onChange={(e) => setDesde(e.target.value)} required className={claseControl} /></div>
          <div className="flex flex-col gap-1.5"><label htmlFor="chHasta" className="text-[13px] font-medium">Hasta</label><input id="chHasta" inputMode="numeric" value={hasta} onChange={(e) => setHasta(e.target.value)} required className={claseControl} /></div>
          <div className="flex flex-col gap-1.5"><label htmlFor="chUltimo" className="text-[13px] font-medium">Último usado <span className="font-normal text-gris-500">(opcional)</span></label><input id="chUltimo" inputMode="numeric" value={ultimo} onChange={(e) => setUltimo(e.target.value)} className={claseControl} /></div>
          <label className="flex items-center gap-2 pb-2.5 text-sm"><input type="checkbox" checked={activa} onChange={(e) => setActiva(e.target.checked)} className="size-4 accent-marca-fuerte" /> Activa</label>
          <button type="submit" disabled={pendiente} className={clasesBoton("primario")}>Agregar chequera</button>
        </form>
      ) : null}
    </Tarjeta>
  );
}
