import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Tarjeta } from "@/components/ui";
import { REPORTES } from "@/lib/reportes/registro";

export default function IndiceReportes() {
  const grupos = [...new Set(REPORTES.map((r) => r.grupo))];
  return (
    <div className="flex flex-col gap-6">
      {grupos.map((g) => (
        <section key={g} className="flex flex-col gap-3">
          <h2 className="text-[15px] font-semibold">{g}</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {REPORTES.filter((r) => r.grupo === g).map((r) => (
              <Link key={r.id} href={`/reportes/${r.id}`} className="group">
                <Tarjeta className="flex h-full items-start justify-between gap-3 p-4 transition group-hover:border-marca">
                  <span><span className="block font-semibold">{r.titulo}</span><span className="mt-1 block text-[13px] text-gris-500">{r.descripcion}</span></span>
                  <ChevronRight className="mt-0.5 size-4 shrink-0 text-gris-500" aria-hidden />
                </Tarjeta>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
