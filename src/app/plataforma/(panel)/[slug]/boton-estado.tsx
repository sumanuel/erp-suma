"use client";

import { useTransition } from "react";
import { clasesBoton } from "@/components/ui";
import { cambiarEstadoCliente } from "../../acciones";

export function BotonEstado({ slug, nombre, estado }: { slug: string; nombre: string; estado: "activo" | "suspendido" }) {
  const [pendiente, iniciar] = useTransition();
  const suspender = estado === "activo";
  return (
    <button
      type="button"
      disabled={pendiente}
      className={clasesBoton(suspender ? "peligro" : "primario")}
      onClick={() => {
        if (suspender && !confirm(`¿Suspender a ${nombre}? Sus usuarios dejarán de poder operar en menos de 30 segundos.`)) return;
        iniciar(() => cambiarEstadoCliente(slug, suspender ? "suspendido" : "activo"));
      }}
    >
      {pendiente ? "Aplicando…" : suspender ? "Suspender cliente" : "Reactivar cliente"}
    </button>
  );
}
