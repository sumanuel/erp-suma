import { NextResponse, type NextRequest } from "next/server";
import { NOMBRE_COOKIE, firmarToken, opcionesCookie, verificarToken } from "@/lib/token";
import { COOKIE_PLATAFORMA, firmarTokenPlataforma, opcionesCookiePlataforma, verificarTokenPlataforma } from "@/lib/plataforma/token";
import { slugDeHost } from "@/lib/host";

// Chequeo optimista con la cookie; la validación real contra la base la hacen src/lib/dal.ts y src/lib/plataforma/dal.ts.
const LIBRES = new Set(["/salir", "/api/salud"]);
const SEGUNDOS_ENTRE_RENOVACIONES = 60;

async function panelProveedor(req: NextRequest) {
  const ruta = req.nextUrl.pathname;
  const token = req.cookies.get(COOKIE_PLATAFORMA)?.value;
  const sesion = token ? await verificarTokenPlataforma(token) : null;
  if (!sesion) {
    if (ruta === "/plataforma/ingresar") return NextResponse.next();
    return NextResponse.redirect(new URL("/plataforma/ingresar", req.nextUrl));
  }
  if (ruta === "/plataforma/ingresar") return NextResponse.redirect(new URL("/plataforma", req.nextUrl));
  const respuesta = NextResponse.next();
  if (!req.headers.has("next-router-prefetch") && Date.now() / 1000 - sesion.emitidoEn > SEGUNDOS_ENTRE_RENOVACIONES) {
    respuesta.cookies.set(COOKIE_PLATAFORMA, await firmarTokenPlataforma(sesion), opcionesCookiePlataforma());
  }
  return respuesta;
}

export async function proxy(req: NextRequest) {
  const ruta = req.nextUrl.pathname;
  if (ruta === "/plataforma" || ruta.startsWith("/plataforma/")) return panelProveedor(req);
  if (LIBRES.has(ruta)) return NextResponse.next();
  const token = req.cookies.get(NOMBRE_COOKIE)?.value;
  let sesion = token ? await verificarToken(token) : null;

  // Aislamiento por subdominio: una sesión de acme no vale en beta.<dominio>.
  const slugHost = slugDeHost(req.headers.get("host"));
  if (sesion && slugHost && sesion.clienteSlug !== slugHost) sesion = null;

  if (!sesion) {
    if (ruta === "/ingresar") return NextResponse.next();
    const destino = new URL("/ingresar", req.nextUrl);
    if (ruta !== "/") destino.searchParams.set("volver", ruta + req.nextUrl.search);
    if (token) destino.searchParams.set("motivo", "vencida");
    const respuesta = NextResponse.redirect(destino);
    if (token) respuesta.cookies.delete(NOMBRE_COOKIE);
    return respuesta;
  }
  if (ruta === "/ingresar") return NextResponse.redirect(new URL("/", req.nextUrl));
  if (sesion.debeCambiar && ruta !== "/cambiar-contrasena") return NextResponse.redirect(new URL("/cambiar-contrasena", req.nextUrl));

  const respuesta = NextResponse.next();
  if (!req.headers.has("next-router-prefetch") && Date.now() / 1000 - sesion.emitidoEn > SEGUNDOS_ENTRE_RENOVACIONES) {
    respuesta.cookies.set(NOMBRE_COOKIE, await firmarToken(sesion), opcionesCookie());
  }
  return respuesta;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico|webp)$).*)"] };
