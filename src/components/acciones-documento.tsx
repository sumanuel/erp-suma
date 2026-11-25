"use client";

import Link from "next/link";
import { useState } from "react";
import { Tecla, useAtajos } from "@/components/atajos";
import { clasesBoton } from "@/components/ui";

// Guardar y cancelar de un documento con líneas, con sus teclas: F5 guarda (y no recarga la página) y F8 cancela.

export function AccionesDocumento({ idGuardar = "guardar-documento", texto, pendiente, volver, huella }: {
  idGuardar?: string; texto: string; pendiente: boolean; volver: string;
  /// Lo capturado, como texto: si cambió desde que se abrió la pantalla, cancelar pregunta antes.
  huella: string;
}) {
  const [alAbrir] = useState(huella);
  // F5 hace lo mismo que el clic en guardar, con las validaciones del formulario.
  useAtajos({ F5: () => document.getElementById(idGuardar)?.click(), F8: () => document.getElementById("cancelar-documento")?.click() });

  return (
    <div className="flex items-center gap-3">
      <button id={idGuardar} type="submit" disabled={pendiente} className={`${clasesBoton("primario")} items-center gap-2`}>{pendiente ? "Guardando…" : texto} <Tecla>F5</Tecla></button>
      <Link id="cancelar-documento" href={volver} onClick={(e) => { if (huella !== alAbrir && !confirm("¿Cancelar? Se pierden los cambios sin guardar.")) e.preventDefault(); }} className="flex items-center gap-1.5 px-2 text-sm text-gris-700 hover:text-tinta">Cancelar <Tecla>F8</Tecla></Link>
    </div>
  );
}
