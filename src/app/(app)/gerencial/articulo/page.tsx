import Link from "next/link";
import { Etiqueta, Tarjeta, clasesBoton } from "@/components/ui";
import { Buscador, Datos, Resultados, Tabla } from "@/components/gerencial/piezas";
import { requerirPermiso } from "@/lib/dal";
import { consultaArticulo } from "@/lib/reportes/consulta-articulo";
import { textoCelda } from "@/lib/reportes/tipos";

const m = (n: number | null | undefined) => (n === null || n === undefined ? "—" : textoCelda(n, "moneda"));
const n = (x: number) => textoCelda(x, "numero") || "0";
const f = (d: Date | null | undefined) => (d ? textoCelda(d, "fecha") : "—");
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

export default async function ConsultaArticulo({ searchParams }: { searchParams: Promise<{ q?: string; codigo?: string; vista?: string }> }) {
  const { db } = await requerirPermiso("reportes", "ver");
  const { q = "", codigo = "", vista = "" } = await searchParams;
  const gerentes = vista === "gerentes";
  const texto = q.trim().slice(0, 60);
  const sufijo = gerentes ? "&vista=gerentes" : "";

  let elegido = codigo.trim().slice(0, 60);
  let candidatos: { codigo: string; descripcion: string }[] | null = null;
  if (texto) {
    candidatos = await db.producto.findMany({ where: { OR: [{ codigo: { contains: texto, mode: "insensitive" } }, { descripcion: { contains: texto, mode: "insensitive" } }, { codigoBarras: texto }] }, select: { codigo: true, descripcion: true }, orderBy: { descripcion: "asc" }, take: 50 });
    const exacto = candidatos.find((c) => c.codigo.toLowerCase() === texto.toLowerCase());
    elegido = exacto?.codigo ?? (candidatos.length === 1 ? candidatos[0].codigo : "");
  }
  const r = elegido ? await consultaArticulo(db, elegido) : null;
  const buscador = <Buscador accion="/gerencial/articulo" valor={texto || elegido} etiqueta="Código, descripción o código de barras" extra={gerentes ? <input type="hidden" name="vista" value="gerentes" /> : null} />;
  if (!r) {
    return (
      <div className="flex flex-col gap-4">
        {buscador}
        {candidatos ? <Resultados filas={candidatos.map((c) => ({ href: `/gerencial/articulo?codigo=${encodeURIComponent(c.codigo)}${sufijo}`, titulo: `${c.codigo} · ${c.descripcion}`, detalle: "" }))} /> : elegido ? <Resultados filas={[]} /> : null}
      </div>
    );
  }
  const p = r.p;
  const oferta = p.promociones[0];
  return (
    <div className="flex flex-col gap-4">
      {buscador}
      <Tarjeta className="p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3"><h2 className="text-xl font-semibold">{p.codigo} · {p.descripcion}</h2><Etiqueta tono={p.activo ? "exito" : "neutro"}>{p.activo ? "Activo" : "Inactivo"}</Etiqueta>{oferta ? <Etiqueta tono="aviso">En oferta</Etiqueta> : null}</div>
          <Link href={`/gerencial/articulo?codigo=${encodeURIComponent(p.codigo)}${gerentes ? "" : "&vista=gerentes"}`} className={clasesBoton("secundario")}>{gerentes ? "Ver consulta general" : "Ver consulta gerentes"}</Link>
        </div>
        <Datos datos={[
          ["Categoría", p.categoria.nombre], ["Subcategoría", p.subcategoria?.nombre], ["Marca", p.marca?.nombre], ["Código de barras", p.codigoBarras],
          ["Existencia", n(r.existencia)], ["Disponible", n(r.disponible)], ["Reservado en pedidos", n(r.reservado)], ["En órdenes de compra por recibir", n(r.porRecibir)],
          ["Precio lista A USD", m(Number(p.precioLista))], ["Último costo USD", m(Number(p.ultimoCosto))], ...(gerentes ? [] : ([["Costo promedio USD", m(Number(p.costoPromedio))], ["Arancel", p.arancel ? `${p.arancel.codigo} · ${Number(p.arancel.porcentaje)} %` : null], ["Alícuota de IVA", p.alicuotaIva.nombre]] as [string, string | null][])),
          ["Última venta", f(r.ultimaVenta)], ["Última compra", f(r.ultimaCompra)], ["Último ajuste", r.ultimoAjuste ? `${f(r.ultimoAjuste.fecha)} · ${n(Number(r.ultimoAjuste.cantidad))}${r.ultimoAjuste.documento ? ` (${r.ultimoAjuste.documento})` : ""}` : "—"],
          ["Oferta vigente", oferta ? `Hasta el ${f(oferta.hasta)}${oferta.precioUsd !== null ? ` · ${m(Number(oferta.precioUsd))} USD` : oferta.descuentoPct !== null ? ` · ${Number(oferta.descuentoPct)} %` : ""}` : "—"],
        ]} />
      </Tarjeta>

      <Tabla titulo="Proveedores" columnas={[{ titulo: "Proveedor" }, { titulo: "RIF" }, { titulo: "País" }, { titulo: "Moneda" }]} vacio="Sin proveedores asignados."
        filas={p.proveedores.map((x) => [<Link key="p" href={`/gerencial/proveedor?id=${x.proveedor.id}`} className="text-marca-texto hover:underline">{x.proveedor.razonSocial}</Link>, x.proveedor.documento, x.proveedor.pais?.nombre ?? x.pais ?? "—", x.moneda])} />

      {gerentes ? null : (
        <>
          <Tabla titulo="Precios por lista" columnas={[{ titulo: "Lista" }, { titulo: "Unidad" }, { titulo: "Precio USD", derecha: true }, { titulo: "Utilidad %", derecha: true }, { titulo: "Desc. máx. %", derecha: true }]} vacio="Solo tiene el precio de la lista A de su ficha."
            filas={p.precios.map((x) => [x.lista, x.presentacion?.unidadMedida.nombre ?? "Unidad base", m(Number(x.precioUsd)), n(Number(x.utilidadPct)), n(Number(x.descuentoMaxPct))])} />
          <Tabla titulo="Existencia por almacén" columnas={[{ titulo: "Almacén" }, { titulo: "Existencia", derecha: true }]} vacio="Sin existencia registrada." filas={p.existencias.map((x) => [`${x.almacen.codigo} · ${x.almacen.nombre}`, n(Number(x.cantidad))])} />
          <Tabla titulo="Promedio de ventas" columnas={[{ titulo: "Meses completos anteriores" }, { titulo: "Unidades por mes", derecha: true }]} vacio="" filas={r.promedios.map((x) => [`${x.meses} ${x.meses === 1 ? "mes" : "meses"}`, n(x.unidades)])} />
          <Tabla titulo="Movimientos del año actual" columnas={[{ titulo: "Mes" }, { titulo: "Cant. vendida", derecha: true }, { titulo: "De ella, filial", derecha: true }, { titulo: "Venta USD", derecha: true }, { titulo: "Costo USD", derecha: true }, { titulo: "Utilidad USD", derecha: true }]} vacio="Sin ventas este año."
            filas={r.porMes.map((x) => [MESES[x.mes - 1], n(x.cantidad), n(x.filial), m(x.monto), m(x.costo), m(x.utilidad)])} nota="Neto de devoluciones, sin IVA." />
          <Tabla titulo="Compras del producto" columnas={[{ titulo: "Fecha" }, { titulo: "Proveedor" }, { titulo: "Documento" }, { titulo: "Cantidad", derecha: true }, { titulo: "Costo USD", derecha: true }]} vacio="Sin compras recibidas."
            filas={r.recepciones.map((x) => [f(x.recepcion.fecha), x.recepcion.orden.proveedor.razonSocial, x.recepcion.documento ?? "—", n(Number(x.cantidad)), m(Number(x.costoUnitario))])} nota="Últimas 20 recepciones de órdenes de compra." />
          <Tabla titulo="Historial de ventas" columnas={[{ titulo: "Fecha" }, { titulo: "Documento" }, { titulo: "Cliente" }, { titulo: "Cantidad", derecha: true }, { titulo: "Precio USD", derecha: true }]} vacio="Sin ventas en los últimos 12 meses."
            filas={r.ventas.map((x) => [f(x.fecha), <Link key="d" href={x.tipo === "FAV" ? `/facturacion/${x.documentoId}` : `/facturacion/notas/${x.documentoId}`} className="text-marca-texto hover:underline">{x.documento}</Link>, x.clienteNombre, n(x.tipo === "DEV" ? -x.cantidad : x.cantidad), m(x.precio)])} nota="Las 50 más recientes de los últimos 12 meses." />
        </>
      )}

      <Tabla titulo="Últimos movimientos de inventario" columnas={[{ titulo: "Fecha" }, { titulo: "Tipo" }, { titulo: "Documento" }, { titulo: "Almacén" }, { titulo: "Cantidad", derecha: true }, { titulo: "Saldo del almacén", derecha: true }]} vacio="Sin movimientos."
        filas={r.movimientos.slice(0, gerentes ? 20 : 50).map((x) => [f(x.fecha), x.tipo.replaceAll("_", " ").toLowerCase(), x.documento ?? "—", x.almacen.codigo, n(Number(x.cantidad)), n(Number(x.saldoDespues))])} />
    </div>
  );
}
