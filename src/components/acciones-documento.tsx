"use client";

import Link from "next/link";
import { useState } from "react";
import { Tecla, useTeclasDocumento } from "@/components/atajos";
import { clasesBoton } from "@/components/ui";

// Guardar y cancelar de un documento con líneas, y las teclas de la pantalla. Guardar y salir piden confirmación, con tecla o con clic.

export function AccionesDocumento({ idGuardar = "guardar-documento", texto, pendiente, volver, huella }: {
  idGuardar?: string; texto: string; pendiente: boolean; volver: string;
  /// Lo capturado, como texto: si cambió desde que se abrió la pantalla, salir avisa que se pierde.
  huella: string;
}) {
  const [alAbrir] = useState(huella);
  // F9 hace lo mismo que el clic en guardar, con las validaciones del formulario.
  const ventana = useTeclasDocumento({
    guardar: () => document.getElementById(idGuardar)?.click(),
    salir: () => document.getElementById("cancelar-documento")?.click(),
  });

  return (
    <div className="flex items-center gap-3">
      {ventana}
      <button
        id={idGuardar} type="submit" disabled={pendiente}
        // Si falta un dato obligatorio, primero lo señala el navegador; con todo completo, se confirma.
        onClick={(e) => { if (e.currentTarget.form?.checkValidity() && !confirm(`¿Confirmas «${texto}»?`)) e.preventDefault(); }}
        className={`${clasesBoton("primario")} items-center gap-2`}>{pendiente ? "Guardando…" : texto} <Tecla>F9</Tecla></button>
      <Link id="cancelar-documento" href={volver} onClick={(e) => { if (!confirm(huella !== alAbrir ? "¿Salir? Se pierden los cambios sin guardar." : "¿Salir de esta pantalla?")) e.preventDefault(); }} className="flex items-center gap-1.5 px-2 text-sm text-gris-700 hover:text-tinta">Cancelar <Tecla>F10</Tecla></Link>
    </div>
  );
}
