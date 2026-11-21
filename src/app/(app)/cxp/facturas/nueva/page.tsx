import { requerirPermiso } from "@/lib/dal";
import { numeroOrden } from "@/lib/compras/calculos";
import { hoyCaracas } from "@/lib/tasas";
import { FormularioFacturaProveedor } from "./formulario";

export default async function NuevaFacturaProveedor() {
  const { db } = await requerirPermiso("cxp", "crear");
  const [proveedores, ordenes] = await Promise.all([
    db.proveedor.findMany({ where: { activo: true }, orderBy: { razonSocial: "asc" }, select: { id: true, razonSocial: true, documento: true } }),
    db.ordenCompra.findMany({ where: { estado: { in: ["EMITIDA", "RECIBIDA_PARCIAL", "RECIBIDA"] } }, orderBy: { numero: "desc" }, take: 300, select: { id: true, numero: true, proveedorId: true, total: true } }),
  ]);
  return (
    <FormularioFacturaProveedor
      hoy={hoyCaracas().toISOString().slice(0, 10)}
      proveedores={proveedores.map((p) => ({ valor: p.id, etiqueta: `${p.razonSocial} (${p.documento})` }))}
      ordenes={ordenes.map((o) => ({ valor: o.id, proveedorId: o.proveedorId, etiqueta: `${numeroOrden(o.numero)} · ${Number(o.total).toLocaleString("es-VE", { minimumFractionDigits: 2 })} USD` }))}
    />
  );
}
