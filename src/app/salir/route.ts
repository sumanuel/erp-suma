import { NextResponse, type NextRequest } from "next/server";
import { NOMBRE_COOKIE } from "@/lib/token";

export async function GET(req: NextRequest) {
  const r = NextResponse.redirect(new URL("/ingresar", req.nextUrl));
  r.cookies.delete(NOMBRE_COOKIE);
  return r;
}
