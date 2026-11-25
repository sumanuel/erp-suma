import Link from "next/link";
import { Tarjeta, clasesBoton } from "@/components/ui";
import { Buscador, Datos, Resultados, Tabla } from "@/components/gerencial/piezas";
import { requerirPermiso } from "@/lib/dal";
import { diaCaracas } from "@/lib/reportes/ayudas";
import { consultaCliente } from "@/lib/reportes/consulta-terceros";
import { textoCelda } from "@/lib/reportes/tipos";

const m = (n: number) => textoCelda(n, "moneda") || "0,00";
const f = (d: Date | null) => (d ? textoCelda(d, "fecha") : "—");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const doc = (href: string | null, texto: string) => (href ? <Link href={href} className="text-marca-texto hover:underline">{texto}</Link> : texto);

export default async function ConsultaCliente({ searchParams }: { searchParams: Promise<{ q?: string; id?: string }> }) {
  const { db } = await requerirPermiso("reportes", "ver");
  const { q = "", id = "" } = await searchParams;
  const texto = q.trim().slice(0, 60);
  const sinSignos = texto.replace(/[\s.\-]/g, "");
  const candidatos = texto ? await db.cliente.findMany({ where: { OR: [{ codigo: { contains: texto, mode: "insensitive" } }, { razonSocial: { contains: texto, mode: "insensitive" } }, ...(sinSignos ? [{ documento: { contains: sinSignos, mode: "insensitive" as const } }] : [])] }, select: { id: true, codigo: true, razonSocial: true, documento: true }, orderBy: { razonSocial: "asc" }, take: 50 }) : null;
  const elegido = UUID.test(id) ? id : candidatos?.length === 1 ? candidatos[0].id : "";
  const r = elegido ? await consultaCliente(db, elegido) : null;
  return (
    <div className="flex flex-col gap-4">
      <Buscador accion="/gerencial/cliente" valor={texto} etiqueta="Código, nombre o RIF del cliente" />
      {!r && candidatos ? <Resultados filas={candidatos.map((c) => ({ href: `/gerencial/cliente?id=${c.id}`, titulo: c.razonSocial, detalle: `${c.codigo} · ${c.documento}` }))} /> : null}
      {r ? (
        <>
          <Tarjeta className="p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">{r.c.razonSocial}</h2>
              <Link href={`/cxc/cliente/${r.c.id}/estado`} className={clasesBoton("secundario")}>Estado de cuenta</Link>
            </div>
            <Datos datos={[
              ["Código", r.c.codigo], ["RIF / documento", r.c.documento], ["Dirección", [r.c.direccion, r.c.direccion2].filter(Boolean).join(", ")], ["Teléfonos", [r.c.telefono, r.c.celular].filter(Boolean).join(" · ")],
              ["Correo", r.c.email], ["Situación", r.c.situacion], ["Vendedor", r.c.vendedor?.nombre], ["Condición de pago", r.c.condicionPago?.nombre],
              ["Límite de crédito USD", m(Number(r.c.limiteCredito))], ["Cliente desde", f(diaCaracas(r.c.creadoEn))], ["Saldo pendiente USD", m(r.saldo)], ["Vencido USD", m(r.vencido)],
            ]} />
          </Tarjeta>
          <Tabla titulo={`Documentos pendientes (${r.pendientes.length})`} columnas={[{ titulo: "Documento" }, { titulo: "Emisión" }, { titulo: "Vencimiento" }, { titulo: "Nº fiscal" }, { titulo: "Monto USD", derecha: true }, { titulo: "Saldo USD", derecha: true }, { titulo: "Días vencido", derecha: true }]} vacio="No tiene documentos pendientes."
            filas={r.pendientes.map((x) => [doc(x.href, x.documento), f(x.emision), f(x.vencimiento), x.numeroFiscal ?? "—", m(x.monto), m(x.saldo), x.diasVencido > 0 ? String(x.diasVencido) : "—"])} />
          <Tabla titulo="Historial" columnas={[{ titulo: "Documento" }, { titulo: "Fecha" }, { titulo: "Tipo" }, { titulo: "Aplica a" }, { titulo: "Nº fiscal" }, { titulo: "Estado" }, { titulo: "Monto USD", derecha: true }]} vacio="Sin documentos."
            filas={r.historial.map((x) => [doc(x.href, x.documento), f(x.fecha), x.tipo, x.aplica ?? "—", x.numeroFiscal ?? "—", x.estado, m(x.monto)])} nota={r.recortado ? "Se muestran los 500 documentos más recientes." : undefined} />
        </>
      ) : null}
    </div>
  );
}
