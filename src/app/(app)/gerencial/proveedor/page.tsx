import Link from "next/link";
import { Tarjeta, clasesBoton } from "@/components/ui";
import { Buscador, Datos, Resultados, Tabla } from "@/components/gerencial/piezas";
import { requerirPermiso } from "@/lib/dal";
import { consultaProveedor } from "@/lib/reportes/consulta-terceros";
import { textoCelda } from "@/lib/reportes/tipos";

const m = (n: number) => textoCelda(n, "moneda") || "0,00";
const f = (d: Date | null) => (d ? textoCelda(d, "fecha") : "—");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const doc = (href: string | null, texto: string) => (href ? <Link href={href} className="text-marca-texto hover:underline">{texto}</Link> : texto);

export default async function ConsultaProveedor({ searchParams }: { searchParams: Promise<{ q?: string; id?: string }> }) {
  const { db } = await requerirPermiso("reportes", "ver");
  const { q = "", id = "" } = await searchParams;
  const texto = q.trim().slice(0, 60);
  const sinSignos = texto.replace(/[\s.\-]/g, "");
  const candidatos = texto ? await db.proveedor.findMany({ where: { OR: [{ codigo: { contains: texto, mode: "insensitive" } }, { razonSocial: { contains: texto, mode: "insensitive" } }, ...(sinSignos ? [{ documento: { contains: sinSignos, mode: "insensitive" as const } }] : [])] }, select: { id: true, codigo: true, razonSocial: true, documento: true }, orderBy: { razonSocial: "asc" }, take: 50 }) : null;
  const elegido = UUID.test(id) ? id : candidatos?.length === 1 ? candidatos[0].id : "";
  const r = elegido ? await consultaProveedor(db, elegido) : null;
  return (
    <div className="flex flex-col gap-4">
      <Buscador accion="/gerencial/proveedor" valor={texto} etiqueta="Código, nombre o RIF del proveedor" />
      {!r && candidatos ? <Resultados filas={candidatos.map((c) => ({ href: `/gerencial/proveedor?id=${c.id}`, titulo: c.razonSocial, detalle: `${c.codigo} · ${c.documento}` }))} /> : null}
      {r ? (
        <>
          <Tarjeta className="p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">{r.p.razonSocial}</h2>
              <Link href={`/cxp/proveedor/${r.p.id}`} className={clasesBoton("secundario")}>Cuentas por pagar</Link>
            </div>
            <Datos datos={[
              ["Código", r.p.codigo], ["RIF / documento", r.p.documento], ["Dirección", [r.p.direccion, r.p.direccion2].filter(Boolean).join(", ")], ["Teléfonos", [r.p.telefono, r.p.telefono2, r.p.celular].filter(Boolean).join(" · ")],
              ["Correo", r.p.email], ["Situación", r.p.situacion], ["País", r.p.pais?.nombre], ["Condición de pago", r.p.condicionPago?.nombre],
              ["Límite de crédito USD", m(Number(r.p.limiteCredito))], ["Días de plazo", String(r.p.diasCredito)], ["Moneda", r.p.divisa], ["Saldo por pagar USD", m(r.saldo)],
            ]} />
          </Tarjeta>
          <Tabla titulo={`Documentos por pagar (${r.pendientes.length})`} columnas={[{ titulo: "Documento" }, { titulo: "Tipo" }, { titulo: "Emisión" }, { titulo: "Vencimiento" }, { titulo: "Descripción" }, { titulo: "Monto USD", derecha: true }, { titulo: "Saldo USD", derecha: true }]} vacio="No tiene documentos por pagar."
            filas={r.pendientes.map((x) => [doc(x.href, x.documento), x.tipo, f(x.emision), f(x.vencimiento), x.descripcion ?? "—", m(x.monto), m(x.saldo)])} />
          <Tabla titulo="Historial de registros y pagos" columnas={[{ titulo: "Documento" }, { titulo: "Fecha" }, { titulo: "Operación" }, { titulo: "Descripción" }, { titulo: "Estado" }, { titulo: "Monto USD", derecha: true }]} vacio="Sin movimientos."
            filas={r.historial.map((x) => [doc(x.href, x.documento), f(x.fecha), x.operacion, x.descripcion ?? "—", x.estado, m(x.monto)])} nota={r.recortado ? "Se muestran los 500 movimientos más recientes." : undefined} />
        </>
      ) : null}
    </div>
  );
}
