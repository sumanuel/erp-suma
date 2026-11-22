import { Aviso, Tarjeta } from "@/components/ui";
import { requerirPermiso } from "@/lib/dal";
import { numeroTurno } from "@/lib/pos/estados";
import { hoyCaracas, tasaVigente, textoTasa } from "@/lib/tasas";
import { FormularioApertura } from "./formulario-apertura";
import { PantallaVenta } from "./pantalla-venta";

export default async function PaginaPos() {
  const { db, usuario } = await requerirPermiso("pos", "ver");
  const turno = await db.turnoCaja.findFirst({ where: { usuarioId: usuario.id, estado: "ABIERTO" } });
  const tasa = await tasaVigente(db, "USD");

  if (!turno) {
    const [almacenes, cajas] = await Promise.all([
      db.almacen.findMany({ where: { activo: true }, orderBy: { nombre: "asc" } }),
      db.cuentaTesoreria.findMany({ where: { activo: true, tipo: "CAJA" }, orderBy: { codigo: "asc" }, select: { id: true, codigo: true, nombre: true, moneda: true, saldo: true } }),
    ]);
    return (
      <FormularioApertura
        almacenes={almacenes.map((a) => ({ valor: a.id, etiqueta: `${a.codigo} · ${a.nombre}` }))}
        cajasVes={cajas.filter((c) => c.moneda === "VES").map((c) => ({ valor: c.id, etiqueta: `${c.codigo} · ${c.nombre} (saldo ${Number(c.saldo).toLocaleString("es-VE", { minimumFractionDigits: 2 })} Bs.)` }))}
        cajasUsd={cajas.filter((c) => c.moneda === "USD").map((c) => ({ valor: c.id, etiqueta: `${c.codigo} · ${c.nombre} (saldo ${Number(c.saldo).toLocaleString("es-VE", { minimumFractionDigits: 2 })} USD)` }))}
        puedeAbrir={true}
      />
    );
  }

  if (!tasa) return <Aviso tono="error">No hay tasa del dólar cargada: regístrala en Tasa de cambio para vender.</Aviso>;
  const [almacen, cajaVes, cajaUsd, clientes, cuentas] = await Promise.all([
    db.almacen.findUniqueOrThrow({ where: { id: turno.almacenId }, select: { nombre: true } }),
    db.cuentaTesoreria.findUniqueOrThrow({ where: { id: turno.cajaVesId }, select: { codigo: true } }),
    db.cuentaTesoreria.findUniqueOrThrow({ where: { id: turno.cajaUsdId }, select: { codigo: true } }),
    db.cliente.findMany({ where: { activo: true, NOT: { documento: "CONTADO" } }, orderBy: { razonSocial: "asc" }, select: { id: true, razonSocial: true, documento: true, listaPrecio: true } }),
    db.cuentaTesoreria.findMany({ where: { activo: true, id: { notIn: [turno.cajaVesId, turno.cajaUsdId] } }, orderBy: { codigo: "asc" }, select: { id: true, codigo: true, nombre: true, moneda: true } }),
  ]);
  const hoy = hoyCaracas();
  return (
    <div className="flex flex-col gap-4">
      <Tarjeta className="flex flex-wrap items-center gap-x-8 gap-y-2 px-5 py-3 text-[13.5px]">
        <span><span className="text-gris-500">Turno</span> <span className="font-semibold">{numeroTurno(turno.numero)}</span></span>
        <span><span className="text-gris-500">Almacén</span> {almacen.nombre}</span>
        <span><span className="text-gris-500">Cajas</span> {cajaVes.codigo} · {cajaUsd.codigo}</span>
        <span><span className="text-gris-500">Tasa USD</span> <span className="font-semibold">{textoTasa(tasa.valor)}</span>{tasa.fecha.getTime() !== hoy.getTime() ? <span className="text-error"> (no es la de hoy)</span> : null}</span>
        <a href={`/pos/turnos/${turno.id}`} className="ml-auto text-sm font-medium text-marca-fuerte hover:underline">Resumen y cierre de caja</a>
      </Tarjeta>
      <PantallaVenta
        turnoId={turno.id}
        tasa={tasa.valor}
        clientes={clientes.map((c) => ({ valor: c.id, etiqueta: `${c.razonSocial} (${c.documento})`, lista: c.listaPrecio }))}
        cuentas={cuentas.map((c) => ({ valor: c.id, etiqueta: `${c.codigo} · ${c.nombre}`, moneda: c.moneda }))}
      />
    </div>
  );
}
