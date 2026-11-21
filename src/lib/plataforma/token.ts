import { SignJWT, jwtVerify } from "jose";

// Sesión del panel del proveedor: cookie y firma propias, 20 min de inactividad, 8 h máximo. No sirve en los clientes ni viceversa.
export const COOKIE_PLATAFORMA = "suma_plataforma";
const MINUTOS = 20;
const HORAS_MAXIMO = 8;

export type SesionPlataforma = { adminId: string; inicio: number; emitidoEn: number };

function clave() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET falta o es muy corta");
  return new TextEncoder().encode(`plataforma:${s}`);
}

export async function firmarTokenPlataforma(s: { adminId: string; inicio: number }) {
  const ahora = Math.floor(Date.now() / 1000);
  return new SignJWT({ adminId: s.adminId, inicio: s.inicio, tipo: "plataforma" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(ahora)
    .setExpirationTime(ahora + MINUTOS * 60)
    .sign(clave());
}

export async function verificarTokenPlataforma(token: string): Promise<SesionPlataforma | null> {
  try {
    const { payload } = await jwtVerify(token, clave(), { algorithms: ["HS256"] });
    const p = payload as Record<string, unknown>;
    if (p.tipo !== "plataforma" || typeof p.adminId !== "string" || typeof p.inicio !== "number" || typeof p.iat !== "number") return null;
    if (Date.now() / 1000 - p.inicio > HORAS_MAXIMO * 3600) return null;
    return { adminId: p.adminId, inicio: p.inicio, emitidoEn: p.iat };
  } catch {
    return null;
  }
}

export const opcionesCookiePlataforma = () => ({
  httpOnly: true, sameSite: "strict" as const, secure: process.env.NODE_ENV === "production", path: "/plataforma", maxAge: MINUTOS * 60,
});
