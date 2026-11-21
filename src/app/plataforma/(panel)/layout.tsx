import type { ReactNode } from "react";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { Marca } from "@/components/marca";
import { requerirPlataforma } from "@/lib/plataforma/dal";
import { salirPlataforma } from "../acciones";

export default async function LayoutPanel({ children }: { children: ReactNode }) {
  const admin = await requerirPlataforma();
  return (
    <div className="min-h-screen">
      <header className="flex min-h-16 items-center justify-between gap-4 border-b border-borde bg-white px-4 sm:px-8">
        <Link href="/plataforma" aria-label="Inicio del panel"><Marca subtitulo="Plataforma" /></Link>
        <div className="flex items-center gap-4 text-[13px] text-gris-600">
          <span className="hidden sm:inline">{admin.nombre} · {admin.email}</span>
          <form action={salirPlataforma}>
            <button className="flex items-center gap-1.5 rounded-[9px] px-2.5 py-2 font-medium text-gris-700 hover:bg-hover"><LogOut className="size-4" aria-hidden />Salir</button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8 sm:py-8">{children}</main>
    </div>
  );
}
