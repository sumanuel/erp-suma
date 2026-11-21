import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";
import { tienePermiso } from "../src/lib/permisos";
import { ACCIONES, MODULOS, permiso, todosLosPermisos } from "../src/lib/modulos";

// Parte 1: auditoría del código. Toda acción del servidor y toda página del área privada debe exigir permiso o sesión ANTES de tocar datos.
// Parte 2: la lógica de permisos con perfiles reales (administrador, limitado, sin permisos, módulo apagado para el cliente).

const RAIZ = join(process.cwd(), "src", "app");
function archivos(dir: string, acepta: (n: string) => boolean, salida: string[] = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) archivos(p, acepta, salida);
    else if (acepta(n)) salida.push(p);
  }
  return salida;
}
const rel = (p: string) => relative(process.cwd(), p).replaceAll("\\", "/");
const EXIGE = /requerirPermisoAccion\(|requerirPermiso\(|requerirSesion\(|requerirPlataforma\w*\(/;

/** Cuerpos de las funciones de un archivo; `exportada` distingue las acciones públicas de los ayudantes locales. */
function funciones(src: string) {
  const re = /(export\s+)?(?:async\s+)?function\s+(\w+)|(export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\(/g;
  const marcas = [...src.matchAll(re)].map((m) => ({ nombre: m[2] ?? m[4], exportada: Boolean(m[1] ?? m[3]), ini: m.index! }));
  return marcas.map((m, i) => ({ nombre: m.nombre, exportada: m.exportada, cuerpo: src.slice(m.ini, marcas[i + 1]?.ini ?? src.length) }));
}

/** Acciones exportadas, con la verificación resuelta si la hace la acción o un ayudante local al que delega. */
function acciones(src: string) {
  const todas = funciones(src);
  const seguros = new Set(todas.filter((f) => !f.exportada && EXIGE.test(f.cuerpo)).map((f) => f.nombre));
  return todas.filter((f) => f.exportada).map((f) => ({ ...f, protegida: EXIGE.test(f.cuerpo) || [...seguros].some((s) => new RegExp(`\\b${s}\\(`).test(f.cuerpo)) }));
}

/** Una página se considera protegida si lo exige ella o un componente local de @/components que importa. */
function paginaProtegida(ruta: string) {
  const src = readFileSync(ruta, "utf8");
  if (EXIGE.test(src)) return true;
  for (const m of src.matchAll(/from\s+"@\/components\/([\w/-]+)"/g)) {
    const f = join(process.cwd(), "src", "components", `${m[1]}.tsx`);
    try {
      if (EXIGE.test(readFileSync(f, "utf8"))) return true;
    } catch {}
  }
  return false;
}

// Páginas sin datos que no necesitan permiso propio (el layout del módulo ya lo exige y no consultan nada).
const SIN_DATOS = new Set(["src/app/(app)/seguridad/page.tsx", "src/app/(app)/sin-acceso/page.tsx", "src/app/(app)/reportes/page.tsx"]);

describe("Auditoría de acciones y páginas", () => {
  const privadas = archivos(join(RAIZ, "(app)"), (n) => n === "acciones.ts");

  it("hay acciones que auditar", () => assert.ok(privadas.length >= 8));

  for (const f of privadas) {
    it(`cada acción exportada de ${rel(f)} exige permiso o sesión`, () => {
      const sin = acciones(readFileSync(f, "utf8")).filter((x) => !x.protegida).map((x) => x.nombre);
      assert.deepEqual(sin, [], `Acciones sin verificación de permiso: ${sin.join(", ")}`);
    });
  }

  it("las acciones de escritura piden un permiso distinto de 'ver'", () => {
    const flojas: string[] = [];
    for (const f of privadas) {
      for (const x of acciones(readFileSync(f, "utf8"))) {
        if (/^(buscar|listar|obtener|consultar|cargar)/i.test(x.nombre)) continue;
        const usos = [...x.cuerpo.matchAll(/requerirPermisoAccion\(\s*"[^"]+"\s*,\s*"(\w+)"/g)].map((m) => m[1]);
        if (usos.length > 0 && usos.every((a) => a === "ver")) flojas.push(`${rel(f)}:${x.nombre}`);
      }
    }
    assert.deepEqual(flojas, []);
  });

  it("toda página y ruta del área privada exige permiso o sesión", () => {
    const sin = archivos(join(RAIZ, "(app)"), (n) => n === "page.tsx" || n === "route.ts" || n === "imprimir.tsx")
      .filter((f) => !readFileSync(f, "utf8").startsWith("\"use client\"") && !SIN_DATOS.has(rel(f)) && !paginaProtegida(f))
      .map(rel);
    assert.deepEqual(sin, [], `Páginas sin protección: ${sin.join(", ")}`);
  });

  it("los módulos que usa el código existen en el catálogo de permisos", () => {
    const ids = new Set<string>(MODULOS.map((m) => m.id));
    const usados = new Set<string>();
    for (const f of archivos(join(process.cwd(), "src"), (n) => /\.tsx?$/.test(n))) {
      for (const m of readFileSync(f, "utf8").matchAll(/requerirPermiso(?:Accion)?\(\s*"([a-z_]+)"/g)) usados.add(m[1]);
    }
    const desconocidos = [...usados].filter((m) => !ids.has(m));
    assert.deepEqual(desconocidos, [], `Módulos no declarados en MODULOS: ${desconocidos.join(", ")}`);
  });
});

describe("Lógica de permisos", () => {
  const usuario = (esAdministrador: boolean, permisos: string[]) => ({ id: "u", email: "u@x", nombre: "U", perfil: "P", esAdministrador, permisos: new Set(permisos), debeCambiarContrasena: false });
  const cliente = (modulos: Record<string, boolean> = {}) => ({ modulos }) as never;
  const ctx = (u: ReturnType<typeof usuario>, modulos?: Record<string, boolean>) => ({ usuario: u, cliente: cliente(modulos) });

  it("el administrador pasa todo; un perfil sin permisos no pasa nada", () => {
    const admin = ctx(usuario(true, []));
    const nadie = ctx(usuario(false, []));
    for (const m of MODULOS) for (const a of ACCIONES) {
      assert.equal(tienePermiso(admin, m.id, a), true, `${m.id}.${a}`);
      assert.equal(tienePermiso(nadie, m.id, a), false, `${m.id}.${a}`);
    }
  });

  it("un perfil limitado solo tiene exactamente lo que se le dio", () => {
    const vendedor = ctx(usuario(false, [permiso("facturacion", "ver"), permiso("facturacion", "crear")]));
    assert.equal(tienePermiso(vendedor, "facturacion", "ver"), true);
    assert.equal(tienePermiso(vendedor, "facturacion", "crear"), true);
    for (const a of ["editar", "eliminar", "exportar"] as const) assert.equal(tienePermiso(vendedor, "facturacion", a), false);
    for (const m of MODULOS.filter((x) => x.id !== "facturacion")) for (const a of ACCIONES) assert.equal(tienePermiso(vendedor, m.id, a), false, `${m.id}.${a}`);
  });

  it("tener 'crear' no da 'ver' de otro módulo ni se confunden módulos con prefijo parecido", () => {
    const u = ctx(usuario(false, [permiso("cxc", "ver")]));
    assert.equal(tienePermiso(u, "cxp", "ver"), false);
    assert.equal(tienePermiso(u, "cx", "ver"), false);
  });

  it("un módulo apagado para el cliente no se ve ni siendo administrador", () => {
    const admin = ctx(usuario(true, []), { contabilidad: false });
    assert.equal(tienePermiso(admin, "contabilidad", "ver"), false);
    assert.equal(tienePermiso(admin, "tesoreria", "ver"), true);
  });

  it("el administrador de un cliente nuevo recibe todos los permisos del catálogo", () => {
    assert.equal(new Set(todosLosPermisos()).size, MODULOS.length * ACCIONES.length);
  });
});
