"use client";

import { useActionState, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Aviso, claseControl, claseSoloLectura, clasesBoton } from "@/components/ui";
import type { CampoForm, EstadoForm, Valores } from "@/lib/formularios";
import { bloquesDe, resumenBloque, type Bloque } from "@/lib/secciones-ficha";

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
  const intento = estado.intento ?? 0;
  // Lo que se abrió o cerró se guarda fuera del formulario: este se rehace tras cada intento de guardar.
  const [plegado, setPlegado] = useState<Plegado>({});

  return (
    // La clave rehace los campos no controlados con lo último que se envió (React los vacía al terminar la acción).
    <form action={enviar} key={intento} className="flex flex-col gap-5" noValidate>
      {estado.error ? <Aviso tono="error">{estado.error}</Aviso> : null}
      <Rejilla campos={campos} actuales={actuales} errores={errores} soloLectura={soloLectura} editando={editando} plegado={plegado} onPlegar={(titulo, abierta) => setPlegado((x) => ({ ...x, [titulo]: { abierta, intento } }))} intento={intento} />
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

type Plegado = Record<string, { abierta: boolean; intento: number }>;

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
 * Los campos del formulario, por secciones: la primera está siempre a la vista y las demás arrancan cerradas (sus campos se envían igual).
 * Un selector con `dependeDe` solo muestra las opciones cuyo `padre` es lo elegido en el otro (país → estado → municipio → parroquia);
 * al cambiar el de arriba se vacía el de abajo.
 */
function Rejilla({ campos, actuales, errores, soloLectura, editando, plegado, onPlegar, intento }: { campos: CampoForm[]; actuales: Valores; errores: Record<string, string>; soloLectura: boolean; editando: boolean; plegado: Plegado; onPlegar: (titulo: string, abierta: boolean) => void; intento: number }) {
  const [elegido, setElegido] = useState<Record<string, string>>(() =>
    Object.fromEntries(campos.filter((c) => c.tipo === "seleccion").map((c) => [c.nombre, String(actuales[c.nombre] ?? "")])),
  );
  const [inicial] = useState(elegido);
  const esPadre = new Set(campos.map((c) => c.dependeDe).filter(Boolean));
  const dibujar = (c: CampoForm) => {
        const id = `campo-${c.nombre}`;
        const error = errores[c.nombre];
        const bloqueado = soloLectura || (c.soloCrear && editando);
        const detalle = error || c.ayuda ? `${id}-detalle` : undefined;
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
            <div key={c.nombre} className={`flex items-start gap-2.5 pt-1 ${columnas[c.ancho ?? 1]}`}>
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
          <div key={c.nombre} className={`flex flex-col gap-1.5 ${columnas[c.ancho ?? 1]}`}>
            {etiqueta}
            {c.tipo === "seleccion" ? (
              <select
                key={claveSelect}
                {...comun}
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
        );
  };

  return (
    <div className="flex flex-col gap-4">
      {bloquesDe(campos).map((bloque, n) => (
        <Seccion
          key={bloque.titulo ?? "basicos"} bloque={bloque} fija={n === 0} valores={actuales} editando={editando}
          errores={bloque.campos.filter((c) => errores[c.nombre]).length}
          pedido={bloque.titulo ? plegado[bloque.titulo] : undefined} intento={intento}
          onPlegar={(abierta) => bloque.titulo && onPlegar(bloque.titulo, abierta)}
        >
          {bloque.campos.map(dibujar)}
        </Seccion>
      ))}
    </div>
  );
}

function Seccion({ bloque, fija, valores, editando, errores, pedido, intento, onPlegar, children }: {
  bloque: Bloque; fija: boolean; valores: Valores; editando: boolean; errores: number;
  pedido?: { abierta: boolean; intento: number }; intento: number; onPlegar: (abierta: boolean) => void; children: ReactNode;
}) {
  const [resumen, setResumen] = useState(() => resumenBloque(bloque.campos, valores));
  const rejilla = "grid gap-x-5 gap-y-4 sm:grid-cols-2 xl:grid-cols-3";
  const rotulo = "text-[13px] font-semibold uppercase tracking-wide text-gris-600";
  if (fija) {
    return (
      <section className="flex flex-col gap-4">
        {bloque.titulo ? <h3 className={`border-b border-linea pb-1.5 ${rotulo}`}>{bloque.titulo}</h3> : null}
        <div className={rejilla}>{children}</div>
      </section>
    );
  }
  // Con errores se abre sola; si después se cierra, se respeta hasta el siguiente intento de guardar.
  const abierta = errores > 0 ? (pedido && pedido.intento === intento ? pedido.abierta : true) : (pedido?.abierta ?? false);
  const idCampos = `seccion-${(bloque.titulo ?? "").replace(/\W+/g, "-")}`;

  /** Al cerrar se cuenta lo que quedó escrito, para que el rótulo no mienta. */
  function alternar(contenedor: HTMLElement | null) {
    if (abierta && contenedor) {
      const ahora: Valores = {};
      for (const c of bloque.campos) {
        const el = contenedor.querySelector<HTMLInputElement>(`[name="${c.nombre}"]`);
        ahora[c.nombre] = el ? (el.type === "checkbox" ? el.checked : el.value) : (valores[c.nombre] ?? "");
      }
      setResumen(resumenBloque(bloque.campos, ahora));
    }
    onPlegar(!abierta);
  }

  const marca = "rounded-full px-2.5 py-0.5 text-[12px] font-medium normal-case tracking-normal";
  return (
    <section className="rounded-[10px] border border-linea">
      <h3>
        <button type="button" aria-expanded={abierta} aria-controls={idCampos} onClick={(e) => alternar(e.currentTarget.closest("section"))} className="flex w-full flex-wrap items-center gap-2 px-3.5 py-3 text-left hover:bg-hover">
          <ChevronDown className={`size-4 text-gris-500 transition-transform ${abierta ? "" : "-rotate-90"}`} aria-hidden />
          <span className={rotulo}>{bloque.titulo}</span>
          {errores > 0 ? <span className={`${marca} bg-error-suave text-error`}>{errores === 1 ? "1 dato por corregir" : `${errores} datos por corregir`}</span> : null}
          {!abierta && errores === 0 && resumen.faltan > 0 ? <span className={`${marca} bg-aviso-suave text-tinta`}>Tiene datos obligatorios</span> : null}
          {!abierta && errores === 0 && editando && resumen.conDatos > 0 ? <span className={`${marca} bg-neutro-suave text-gris-700`}>{resumen.conDatos === 1 ? "1 con datos" : `${resumen.conDatos} con datos`}</span> : null}
        </button>
      </h3>
      {/* Oculta, no desmontada: lo que hay dentro se envía igual al guardar. */}
      <div id={idCampos} hidden={!abierta} className="border-t border-linea p-3.5">
        <div className={rejilla}>{children}</div>
      </div>
    </section>
  );
}
