import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Tarjeta } from "@/components/ui";
import { requerirPermiso } from "@/lib/dal";
import { REPORTES_GERENCIALES } from "@/lib/reportes/gerencial-registro";

// Índice del módulo Gerencial, agrupado como se usa: consultas, artículos, movimientos, ventas y compras.
const CONSULTAS = [
  { href: "/gerencial/articulo", titulo: "Consulta general de artículos", descripcion: "Existencia, costos, precios, proveedores, ventas y movimientos de un producto." },
  { href: "/gerencial/articulo?vista=gerentes", titulo: "Consulta gerentes", descripcion: "Vista resumida del producto: existencia, precio, oferta, últimas fechas y movimientos." },
  { href: "/gerencial/cliente", titulo: "Consulta de clientes", descripcion: "Ficha, documentos pendientes e historial de un cliente." },
  { href: "/gerencial/proveedor", titulo: "Consulta de proveedores", descripcion: "Ficha, documentos por pagar e historial de registros y pagos." },
];
const GRUPOS: [string, string[]][] = [
  ["Artículos", ["articulos-agotados", "articulos-negativos", "articulos-sin-vender", "precios-cambiados", "ofertas"]],
  ["Movimientos", ["movimiento-facturacion", "movimiento-producto", "movimientos-clientes", "movimiento-items", "productos-por-vendedor"]],
  ["Ventas y compras", ["ventas-por-vendedor", "compras-por-proveedor", "compras-sugeridas"]],
];

export default async function IndiceGerencial() {
  await requerirPermiso("reportes", "ver");
  const secciones = [
    { nombre: "Consultas", items: CONSULTAS },
    ...GRUPOS.map(([nombre, ids]) => ({ nombre, items: ids.map((id) => REPORTES_GERENCIALES.find((r) => r.id === id)!).map((r) => ({ href: `/reportes/${r.id}`, titulo: r.titulo, descripcion: r.descripcion })) })),
  ];
  return (
    <div className="flex flex-col gap-6">
      {secciones.map((s) => (
        <section key={s.nombre} className="flex flex-col gap-3">
          <h2 className="text-[15px] font-semibold">{s.nombre}</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {s.items.map((r) => (
              <Link key={r.href} href={r.href} className="group">
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
