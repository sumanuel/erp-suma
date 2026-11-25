"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

// F9 (guardar o aceptar) y F10 (salir o cancelar) en las pantallas que no son un documento con líneas (esas usan `useTeclasDocumento`).
// Cada pantalla solo marca sus botones:
//   data-guardar            botón principal; F9 lo pulsa y, con tecla o con clic, se pide confirmación.
//   data-guardar="propio"   igual, pero la pantalla ya hace su propia pregunta.
//   data-salir              enlace «Cancelar» o «Volver»; F10 lo pulsa y se pide confirmación. Sin él, F10 vuelve al inicio del módulo.

const visible = (el: Element) => el.getClientRects().length > 0;

/** El texto del botón sin la etiqueta de la tecla. */
const rotulo = (el: Element) => el.textContent?.trim() ?? "Guardar";

export function AtajosPantalla() {
  const router = useRouter();
  const ruta = usePathname();
  const actual = useRef(ruta);
  useEffect(() => { actual.current = ruta; });

  useEffect(() => {
    function alTeclear(e: KeyboardEvent) {
      if ((e.key !== "F9" && e.key !== "F10") || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey || e.defaultPrevented) return;
      const botones = [...document.querySelectorAll<HTMLButtonElement>("[data-guardar]")].filter(visible);
      const salir = [...document.querySelectorAll<HTMLElement>("[data-salir]")].find(visible);
      // Una pantalla sin nada que guardar ni cancelar deja las teclas como estaban.
      if (!botones.length && !salir) return;
      e.preventDefault();
      if (e.repeat || document.querySelector('[role="dialog"]')) return;
      if (e.key === "F9") {
        // Con varios formularios en la pantalla manda el que tiene el cursor; sin cursor en ninguno no se adivina.
        const formulario = document.activeElement?.closest("form");
        const elegido = botones.find((b) => formulario && b.form === formulario) ?? (botones.length === 1 ? botones[0] : undefined);
        elegido?.click();
      } else if (salir) {
        salir.click();
      } else if (confirm("¿Salir de esta pantalla? Lo que no hayas guardado se pierde.")) {
        const modulo = `/${actual.current.split("/")[1] ?? ""}`;
        router.push(modulo === actual.current ? "/" : modulo);
      }
    }

    // La pregunta va en la fase de captura de la ventana: si la respuesta es no, el clic no llega al formulario ni al enlace.
    function alPulsar(e: MouseEvent) {
      const el = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-guardar], [data-salir]") : null;
      if (!el) return;
      let pregunta: string;
      if (el.hasAttribute("data-salir")) pregunta = "¿Salir de esta pantalla? Lo que no hayas guardado se pierde.";
      else {
        if (el.getAttribute("data-guardar") === "propio") return;
        const formulario = el instanceof HTMLButtonElement ? el.form : null;
        // Si falta un dato obligatorio, primero lo señala el navegador.
        if (formulario && !formulario.noValidate && !formulario.checkValidity()) return;
        pregunta = `¿Confirmas «${rotulo(el)}»?`;
      }
      if (!confirm(pregunta)) {
        e.preventDefault();
        e.stopPropagation();
      }
    }

    window.addEventListener("keydown", alTeclear);
    window.addEventListener("click", alPulsar, true);
    return () => {
      window.removeEventListener("keydown", alTeclear);
      window.removeEventListener("click", alPulsar, true);
    };
  }, [router]);

  return null;
}
