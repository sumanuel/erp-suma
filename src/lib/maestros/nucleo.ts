import "server-only";
import { redirect } from "next/navigation";
import { requerirPermisoAccion } from "@/lib/dal";
import { registrarCambio, soloCambios } from "@/lib/auditoria";
import { esViolacionDeClave, esViolacionUnica, leerFormulario, type EstadoForm } from "@/lib/formularios";
import type { Maestro } from "./tipos";
import { buscarMaestro } from "./registro";

export function claveDe(m: Maestro, texto: string) {
  return m.clave.numerica ? Number(texto) : texto;
}

export async function camposDe(m: Maestro, db: Parameters<Maestro["delegado"]>[0]) {
  return typeof m.campos === "function" ? m.campos(db) : m.campos;
}

function claveDesdeUrl(m: Maestro, texto: string | null) {
  if (texto === null) return null;
  const c = claveDe(m, texto);
  return typeof c === "number" && !Number.isSafeInteger(c) ? null : c;
}

export async function guardarMaestro(id: string, claveTexto: string | null, previo: EstadoForm, form: FormData): Promise<EstadoForm> {
  const m = buscarMaestro(id);
  if (!m || m.soloConsulta) return { error: "Operación no disponible." };
  const editando = claveTexto !== null;
  if (editando && m.sinEdicion) return { error: "Este registro no se puede editar." };
  const clave = claveDesdeUrl(m, claveTexto);
  if (editando && clave === null) return { error: "Registro no válido." };
  const { db, usuario } = await requerirPermisoAccion(m.modulo, editando ? "editar" : "crear");
  const d = m.delegado(db);
  const f = leerFormulario(await camposDe(m, db), form, editando);
  if (m.preparar) f.datos = m.preparar(f.datos) as typeof f.datos;
  const intento = (previo.intento ?? 0) + 1;
  const fallo = (errores: Record<string, string>): EstadoForm => ({
    errores,
    valores: f.valores,
    error: "Revisa los campos marcados.",
    intento,
  });
  const errores = { ...f.errores, ...((await m.validar?.(db, f.datos, editando)) ?? {}) };
  if (Object.keys(errores).length > 0) return fallo(errores);

  let datos = f.datos as Record<string, unknown>;
  const donde = { [m.clave.campo]: editando ? clave : datos[m.clave.campo] };
  try {
    if (editando) {
      const antes = await d.findUnique({ where: donde });
      if (!antes) return { error: `${m.genero === "el" ? "El" : "La"} ${m.singular} ya no existe.` };
      await d.update({ where: donde, data: datos });
      const cambios = soloCambios(antes, { ...antes, ...datos });
      if (Object.keys(cambios.despues).length > 0) {
        await registrarCambio(db, usuario, { modulo: m.modulo, entidad: m.entidad, entidadId: String(clave), descripcion: m.titulo({ ...antes, ...datos }), accion: "editar", ...cambios });
      }
    } else {
      if (m.completar) datos = await m.completar(db, datos);
      if (!m.clave.autogenerada && (await d.findUnique({ where: donde }))) {
        return fallo({ [m.clave.campo]: `Ya existe ${m.genero === "el" ? "un" : "una"} ${m.singular} con este código.` });
      }
      if (m.crear) {
        const r = await m.crear(db, usuario, datos);
        if (r?.errores && Object.keys(r.errores).length > 0) return fallo(r.errores);
      } else {
        const creado = await d.create({ data: datos });
        await registrarCambio(db, usuario, { modulo: m.modulo, entidad: m.entidad, entidadId: String(creado[m.clave.campo] ?? ""), descripcion: m.titulo(creado), accion: "crear", despues: datos });
      }
    }
  } catch (e) {
    if (esViolacionUnica(e)) return { error: m.mensajeDuplicado ?? "Ya existe un registro con esos datos.", valores: f.valores, intento };
    if (esViolacionDeClave(e)) return { error: "Un dato apunta a un registro que no existe.", valores: f.valores, intento };
    throw e;
  }
  redirect(`${m.ruta}?aviso=${editando ? "editado" : "creado"}`);
}

export async function eliminarMaestro(id: string, claveTexto: string): Promise<{ error?: string }> {
  const m = buscarMaestro(id);
  if (!m || m.soloConsulta || m.sinEliminar) return { error: "Operación no disponible." };
  const clave = claveDesdeUrl(m, claveTexto);
  if (clave === null) return { error: "Registro no válido." };
  const { db, usuario } = await requerirPermisoAccion(m.modulo, "eliminar");
  const d = m.delegado(db);
  const donde = { [m.clave.campo]: clave };
  const antes = await d.findUnique({ where: donde });
  if (antes) {
    const motivo = await m.validarEliminar?.(db, antes);
    if (motivo) return { error: motivo };
    try {
      await d.delete({ where: donde });
    } catch (e) {
      if (esViolacionDeClave(e)) return { error: m.mensajeDependientes ?? "No se puede eliminar: tiene registros que dependen de él." };
      throw e;
    }
    await registrarCambio(db, usuario, { modulo: m.modulo, entidad: m.entidad, entidadId: String(clave), descripcion: m.titulo(antes), accion: "eliminar", antes });
  }
  redirect(`${m.ruta}?aviso=eliminado`);
}
