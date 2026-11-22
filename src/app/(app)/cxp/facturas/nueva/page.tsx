import { requerirPermiso } from "@/lib/dal";
import { numeroOrden } from "@/lib/compras/calculos";
import { hoyCaracas } from "@/lib/tasas";
import { FormularioFacturaProveedor } from "./formulario";

export default async function NuevaFacturaProveedor() {
  const { db } = await requerirPermiso("cxp", "crear");
  const [proveedores, condiciones, transportes, centros, cuentas, ordenes] = await Promise.all([
    db.proveedor.findMany({ where: { activo: true }, orderBy: { razonSocial: "asc" }, select: { id: true, razonSocial: true, documento: true, condicionPagoId: true, diasCredito: true } }),
    db.condicionPago.findMany({ where: { activo: true }, orderBy: { dias: "asc" }, select: { id: true, nombre: true, dias: true } }),
    db.transporte.findMany({ where: { activo: true }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true } }),
    db.centroCosto.findMany({ where: { activo: true }, orderBy: { nombre: "asc" }, select: { id: true, codigo: true, nombre: true } }),
    db.cuentaContable.findMany({ where: { activo: true, posteable: true, tipo: { in: ["GASTO", "COSTO", "ACTIVO"] } }, select: { id: true, codigo: true, nombre: true } }),
    db.ordenCompra.findMany({ where: { estado: { in: ["EMITIDA", "RECIBIDA_PARCIAL", "RECIBIDA"] } }, orderBy: { numero: "desc" }, take: 300, select: { id: true, numero: true, proveedorId: true, total: true } }),
  ]);
  return (
    <FormularioFacturaProveedor
      hoy={hoyCaracas().toISOString().slice(0, 10)}
      catalogos={{
        proveedores: proveedores.map((p) => ({ valor: p.id, etiqueta: `${p.razonSocial} (${p.documento})`, condicionPagoId: p.condicionPagoId ?? "", diasCredito: p.diasCredito })),
        ordenes: ordenes.map((o) => ({ valor: o.id, proveedorId: o.proveedorId, etiqueta: `${numeroOrden(o.numero)} · ${Number(o.total).toLocaleString("es-VE", { minimumFractionDigits: 2 })} USD` })),
        condiciones: condiciones.map((c) => ({ valor: c.id, etiqueta: c.nombre, dias: c.dias })),
        transportes: transportes.map((t) => ({ valor: t.id, etiqueta: t.nombre })),
        centros: centros.map((c) => ({ valor: c.id, etiqueta: `${c.codigo} · ${c.nombre}` })),
        cuentas: cuentas.sort((a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true })).map((c) => ({ valor: c.id, etiqueta: `${c.codigo} ${c.nombre}` })),
      }}
    />
  );
}
