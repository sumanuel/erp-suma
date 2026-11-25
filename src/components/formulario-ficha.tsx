"use client";

import { Fragment, useActionState, useState } from "react";
import Link from "next/link";
import { Aviso, claseControl, claseSoloLectura, clasesBoton } from "@/components/ui";
import type { CampoForm, EstadoForm, Valores } from "@/lib/formularios";

const columnas = { 1: "", 2: "sm:col-span-2", 3: "sm:col-span-2 xl:col-span-3" } as const;

export function FormularioFicha({
  campos,
  valores,
  accion,
  cancelar,
  editando,
  soloLectura = false,
}: {
  campos: CampoForm[];
  valores: Valores;
  accion: (estado: EstadoForm, form: FormData) => Promise<EstadoForm>;
  cancelar: string;
  editando: boolean;
  soloLectura?: boolean;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  const actuales = estado.valores ?? valores;
  const errores = estado.errores ?? {};

  return (
    // La clave rehace los campos no controlados con lo último que se envió (React los vacía al terminar la acción).
    <form action={enviar} key={estado.intento ?? 0} className="flex flex-col gap-5" noValidate>
      {estado.error ? <Aviso tono="error">{estado.error}</Aviso> : null}
      <Rejilla campos={campos} actuales={actuales} errores={errores} soloLectura={soloLectura} editando={editando} />
      <div className="flex flex-wrap items-center gap-3 border-t border-linea pt-5">
        {soloLectura ? null : (
          <button data-guardar type="submit" disabled={pendiente} className={clasesBoton("primario")}>
            {pendiente ? "Guardando…" : editando ? "Guardar cambios" : "Crear"}
          </button>
        )}
        <Link data-salir href={cancelar} className="text-sm font-medium text-gris-700 hover:text-tinta">
          {soloLectura ? "Volver" : "Cancelar"}
        </Link>
      </div>
    </form>
  );
}

/** Anota lo elegido y vacía, en cadena, los selectores que dependían de él. */
function cambiarElegido(campos: CampoForm[], antes: Record<string, string>, nombre: string, valor: string) {
  const despues = { ...antes, [nombre]: valor };
  let cambio = true;
  const vaciados = new Set([nombre]);
  while (cambio) {
    cambio = false;
    for (const c of campos) {
      if (c.dependeDe && vaciados.has(c.dependeDe) && !vaciados.has(c.nombre)) {
        despues[c.nombre] = "";
        vaciados.add(c.nombre);
        cambio = true;
      }
    }
  }
  return despues;
}

/**
 * Los campos del formulario. Un campo con `seccion` abre un título nuevo cuando cambia de sección. Un selector con `dependeDe` solo muestra
 * las opciones cuyo `padre` es lo elegido en el otro (país → estado → municipio → parroquia); al cambiar el de arriba se vacía el de abajo.
 */
function Rejilla({ campos, actuales, errores, soloLectura, editando }: { campos: CampoForm[]; actuales: Valores; errores: Record<string, string>; soloLectura: boolean; editando: boolean }) {
  const [elegido, setElegido] = useState<Record<string, string>>(() =>
    Object.fromEntries(campos.filter((c) => c.tipo === "seleccion").map((c) => [c.nombre, String(actuales[c.nombre] ?? "")])),
  );
  const [inicial] = useState(elegido);
  const esPadre = new Set(campos.map((c) => c.dependeDe).filter(Boolean));
  // Título que abre cada campo (solo cuando la sección cambia respecto del campo anterior que tenía una).
  const titulos = campos.map((c, i) => (c.seccion && c.seccion !== campos.slice(0, i).reverse().find((x) => x.seccion)?.seccion ? c.seccion : null));

  return (
    <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
      {campos.map((c, indice) => {
        const id = `campo-${c.nombre}`;
        const error = errores[c.nombre];
        const bloqueado = soloLectura || (c.soloCrear && editando);
        const detalle = error || c.ayuda ? `${id}-detalle` : undefined;
        const titulo = titulos[indice];
        const encabezado = titulo ? (
          <h3 key={`seccion-${titulo}`} className="col-span-full mt-2 border-b border-linea pb-1.5 text-[13px] font-semibold uppercase tracking-wide text-gris-600">
            {titulo}
          </h3>
        ) : null;
        const etiqueta = (
          <label htmlFor={id} className="text-[13px] font-medium">
            {c.etiqueta}
            {c.requerido ? null : <span className="font-normal text-gris-500"> (opcional)</span>}
          </label>
        );
        const pie = error ? (
          <p id={detalle} className="text-[12.5px] text-error">
            {error}
          </p>
        ) : c.ayuda ? (
          <p id={detalle} className="text-[12.5px] text-gris-500">
            {c.ayuda}
          </p>
        ) : null;

        if (c.tipo === "booleano") {
          return (
            <Fragment key={c.nombre}>
            {encabezado}
            <div className={`flex items-start gap-2.5 pt-1 ${columnas[c.ancho ?? 1]}`}>
              <input
                id={id}
                name={c.nombre}
                type="checkbox"
                defaultChecked={actuales[c.nombre] === true}
                disabled={bloqueado}
                aria-describedby={detalle}
                className="mt-0.5 size-4 accent-marca-fuerte"
              />
              <div className="flex flex-col gap-0.5">
                <label htmlFor={id} className="text-[13.5px] font-medium">
                  {c.etiqueta}
                </label>
                {pie}
              </div>
            </div>
            </Fragment>
          );
        }

        const comun = {
          id,
          name: c.nombre,
          disabled: bloqueado,
          "aria-invalid": error ? true : undefined,
          "aria-describedby": detalle,
        } as const;

        let opciones = c.opciones;
        let claveSelect = c.nombre;
        let valorInicial = String(actuales[c.nombre] ?? "");
        if (c.tipo === "seleccion" && c.dependeDe) {
          const padre = elegido[c.dependeDe] ?? "";
          opciones = c.opciones?.filter((o) => o.padre === padre);
          // Al cambiar de padre el selector se rehace y queda vacío; con el padre original conserva lo guardado.
          claveSelect = `${c.nombre}-${padre}`;
          if (padre !== (inicial[c.dependeDe] ?? "")) valorInicial = "";
        }

        return (
          <Fragment key={c.nombre}>
          {encabezado}
          <div className={`flex flex-col gap-1.5 ${columnas[c.ancho ?? 1]}`}>
            {etiqueta}
            {c.tipo === "seleccion" ? (
              <select
                {...comun}
                key={claveSelect}
                defaultValue={valorInicial}
                onChange={esPadre.has(c.nombre) ? (e) => setElegido((x) => cambiarElegido(campos, x, c.nombre, e.target.value)) : undefined}
                className={`${claseControl} pr-9`}
              >
                <option value="">{c.dependeDe && !(elegido[c.dependeDe] ?? "") ? "Primero elige el nivel anterior" : "Elegir…"}</option>
                {opciones?.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.etiqueta}
                  </option>
                ))}
              </select>
            ) : c.tipo === "textoLargo" ? (
              <textarea {...comun} rows={3} defaultValue={String(actuales[c.nombre] ?? "")} className={`${claseControl} ${claseSoloLectura} h-auto py-2`} />
            ) : (
              <input
                {...comun}
                type={c.tipo === "fecha" ? "date" : "text"}
                inputMode={c.tipo === "entero" ? "numeric" : c.tipo === "decimal" ? "decimal" : undefined}
                maxLength={c.max}
                defaultValue={String(actuales[c.nombre] ?? "")}
                className={`${claseControl} ${claseSoloLectura}`}
              />
            )}
            {pie}
          </div>
          </Fragment>
        );
      })}
    </div>
  );
}
