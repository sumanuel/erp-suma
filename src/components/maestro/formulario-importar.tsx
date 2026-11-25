"use client";

import Link from "next/link";
import { Download, FileSpreadsheet } from "lucide-react";
import { useState, useTransition } from "react";
import { Aviso, Tarjeta, clasesBoton, claseControl } from "@/components/ui";
import { descargarPlantilla, procesarImportacion } from "./acciones-importar";
import type { ResultadoImportacion } from "@/lib/maestros/importacion";

/** Carga masiva: se descarga la plantilla, se llena, se valida y, si todo está bien, se importa. */
export function FormularioImportar({ id, ruta, plural }: { id: string; ruta: string; plural: string }) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function datos() {
    const f = new FormData();
    if (archivo) f.set("archivo", archivo);
    return f;
  }
  const correr = (confirmar: boolean) => {
    setError(null);
    iniciar(async () => {
      try {
        setResultado(await procesarImportacion(id, confirmar, datos()));
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo procesar el archivo.");
      }
    });
  };
  const plantilla = () =>
    iniciar(async () => {
      const p = await descargarPlantilla(id);
      const bytes = Uint8Array.from(atob(p.base64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = p.nombre;
      a.click();
      URL.revokeObjectURL(url);
    });

  const buena = resultado && !resultado.error && resultado.filas.length === 0;
  return (
    <div className="flex flex-col gap-6">
      <Tarjeta className="p-6">
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="text-base font-semibold">1. Descarga la plantilla</h3>
            <p className="mt-1 text-[13.5px] text-gris-600">Trae una hoja «Datos» con los títulos de las columnas y una hoja «Instrucciones» con lo que lleva cada una. Las columnas con asterisco son obligatorias.</p>
            <button type="button" onClick={plantilla} disabled={pendiente} className={`${clasesBoton("secundario")} mt-3`}><Download className="size-4" aria-hidden />Descargar plantilla</button>
          </div>
          <div>
            <h3 className="text-base font-semibold">2. Sube el archivo lleno</h3>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <input
                type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label="Archivo de Excel"
                onChange={(e) => { setArchivo(e.target.files?.[0] ?? null); setResultado(null); setError(null); }} className={`${claseControl} max-w-md`}
              />
              <button type="button" onClick={() => correr(false)} disabled={pendiente || !archivo} className={clasesBoton("secundario")}><FileSpreadsheet className="size-4" aria-hidden />{pendiente ? "Procesando…" : "Revisar archivo"}</button>
            </div>
            <p className="mt-2 text-[12.5px] text-gris-500">Solo .xlsx, hasta 5 MB y 3.000 filas. Revisar no guarda nada.</p>
          </div>
        </div>
      </Tarjeta>

      {error ? <Aviso tono="error">{error}</Aviso> : null}
      {resultado?.error ? <Aviso tono="error">{resultado.error}</Aviso> : null}
      {resultado && !resultado.error ? (
        <Tarjeta className="p-6">
          {resultado.confirmada ? (
            <Aviso tono="exito">Listo: se importaron {resultado.validas} {plural}. <Link href={ruta} className="font-semibold underline">Ver el listado</Link></Aviso>
          ) : buena ? (
            <div className="flex flex-col gap-3">
              <Aviso tono="exito">El archivo está bien: {resultado.validas} {plural} listos para importar.</Aviso>
              <div><button data-guardar="propio" type="button" onClick={() => confirm(`¿Importar ${resultado.validas} ${plural}?`) && correr(true)} disabled={pendiente} className={clasesBoton("primario")}>Importar {resultado.validas} {plural}</button></div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <Aviso tono="error">Hay {resultado.filas.length} fila{resultado.filas.length === 1 ? "" : "s"} con problemas de {resultado.total}. No se importó nada: corrige el archivo y vuelve a revisarlo.</Aviso>
              <table className="w-full max-w-4xl text-left text-[13.5px]">
                <thead><tr className="border-b border-linea text-[12.5px] text-gris-600"><th className="w-20 py-2 font-medium">Fila</th><th className="py-2 font-medium">Problema</th></tr></thead>
                <tbody>
                  {resultado.filas.map((f) => <tr key={f.fila} className="border-b border-linea last:border-0 align-top"><td className="py-2 tabular-nums">{f.fila}</td><td className="py-2">{f.mensajes.join(" · ")}</td></tr>)}
                </tbody>
              </table>
              {resultado.filas.length >= 200 ? <p className="text-[12.5px] text-gris-500">Se muestran los primeros 200 problemas.</p> : null}
            </div>
          )}
          {resultado.ignoradas.length > 0 ? <p className="mt-3 text-[12.5px] text-gris-500">Columnas que no se reconocieron y se ignoraron: {resultado.ignoradas.join(", ")}.</p> : null}
        </Tarjeta>
      ) : null}
    </div>
  );
}
