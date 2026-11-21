"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { poolControl, clientePorSlug, registrarAprovisionamiento } from "@/lib/nucleo/control";
import { INTENTOS_MAXIMOS, MINUTOS_BLOQUEO, verificar } from "@/lib/nucleo/contrasenas";
import { cerrarSesionPlataforma, crearSesionPlataforma, requerirPlataforma } from "@/lib/plataforma/dal";
import { MODULOS } from "@/lib/modulos";

export type Estado = { error?: string; ok?: string };
const GENERICO = "Correo o contraseña incorrectos.";
const Datos = z.object({ email: z.string().trim().toLowerCase().email().max(200), contrasena: z.string().min(1).max(200) });

export async function ingresarPlataforma(_: Estado, form: FormData): Promise<Estado> {
  const d = Datos.safeParse(Object.fromEntries(form));
  if (!d.success) return { error: GENERICO };
  const r = await poolControl().query("SELECT * FROM administrador_plataforma WHERE email = $1", [d.data.email]);
  const a = r.rows[0];
  if (a?.bloqueado_hasta && new Date(a.bloqueado_hasta) > new Date()) {
    await verificar(d.data.contrasena, null);
    return { error: GENERICO };
  }
  const correcta = await verificar(d.data.contrasena, a?.hash_contrasena ?? null);
  if (!a || !a.activo || !correcta) {
    if (a) {
      const intentos = a.intentos_fallidos + 1;
      const bloquear = intentos >= INTENTOS_MAXIMOS;
      await poolControl().query(
        "UPDATE administrador_plataforma SET intentos_fallidos = $2, bloqueado_hasta = $3 WHERE id = $1",
        [a.id, bloquear ? 0 : intentos, bloquear ? new Date(Date.now() + MINUTOS_BLOQUEO * 60_000) : null],
      );
    }
    return { error: GENERICO };
  }
  await poolControl().query("UPDATE administrador_plataforma SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = $1", [a.id]);
  await crearSesionPlataforma(a.id);
  redirect("/plataforma");
}

export async function salirPlataforma() {
  await cerrarSesionPlataforma();
  redirect("/plataforma/ingresar");
}

export async function cambiarEstadoCliente(slug: string, estado: "activo" | "suspendido") {
  const admin = await requerirPlataforma();
  const c = await clientePorSlug(slug);
  if (!c) return;
  await poolControl().query("UPDATE cliente SET estado = $2, actualizado_en = now() WHERE id = $1", [c.id, estado]);
  await registrarAprovisionamiento(c.id, slug, estado === "activo" ? "reactivar" : "suspender", true, `por ${admin.email}`);
  revalidatePath("/plataforma", "layout");
}

export async function guardarModulos(slug: string, _: Estado, form: FormData): Promise<Estado> {
  const admin = await requerirPlataforma();
  const c = await clientePorSlug(slug);
  if (!c) return { error: "El cliente no existe." };
  const activos = new Set(form.getAll("modulo").map(String));
  // Solo se guardan los apagados: un módulo nuevo del catálogo queda encendido por defecto.
  const modulos: Record<string, boolean> = {};
  for (const m of MODULOS) if (!activos.has(m.id)) modulos[m.id] = false;
  if (modulos.seguridad === false) return { error: "Usuarios y perfiles no se puede apagar: el cliente quedaría sin administración." };
  await poolControl().query("UPDATE cliente SET modulos = $2::jsonb, actualizado_en = now() WHERE id = $1", [c.id, JSON.stringify(modulos)]);
  await registrarAprovisionamiento(c.id, slug, "modulos", true, `por ${admin.email}: apagados ${Object.keys(modulos).join(", ") || "ninguno"}`);
  revalidatePath("/plataforma", "layout");
  return { ok: "Módulos guardados. Se aplican al cliente en menos de 30 segundos." };
}
