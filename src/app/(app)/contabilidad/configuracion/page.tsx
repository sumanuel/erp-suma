import { requerirSesion, tienePermiso } from "@/lib/dal";
import { FormularioConfiguracion } from "./formulario";
import { FormularioEmpresa } from "./formulario-empresa";

export default async function Configuracion() {
  const ctx = await requerirSesion();
  const [empresa, cfg, conceptos, cuentas, tesoreria] = await Promise.all([
    ctx.db.empresa.findUnique({ where: { id: 1 } }),
    ctx.db.configContable.findUnique({ where: { id: 1 } }),
    ctx.db.cuentaConcepto.findMany(),
    ctx.db.cuentaContable.findMany({ where: { posteable: true, activo: true }, select: { id: true, codigo: true, nombre: true } }),
    ctx.db.cuentaTesoreria.findMany({ orderBy: [{ moneda: "asc" }, { nombre: "asc" }], select: { id: true, codigo: true, nombre: true, moneda: true, activo: true, cuentaContableId: true } }),
  ]);
  const clave = (c: string) => c.split(".").map((n) => n.padStart(6, "0")).join(".");
  cuentas.sort((a, b) => clave(a.codigo).localeCompare(clave(b.codigo)));
  return (
    <div className="flex flex-col gap-6">
    <FormularioEmpresa
      puedeEditar={tienePermiso(ctx, "contabilidad", "editar")}
      inicial={{ rif: empresa?.rif ?? "", razonSocial: empresa?.razonSocial ?? "", nombreComercial: empresa?.nombreComercial ?? "", direccion: empresa?.direccion ?? "", telefono: empresa?.telefono ?? "", email: empresa?.email ?? "", agenteRetencion: empresa?.agenteRetencion ?? false }}
    />
    <FormularioConfiguracion
      puedeEditar={tienePermiso(ctx, "contabilidad", "editar")}
      automatica={cfg?.automatica ?? false}
      conceptos={Object.fromEntries(conceptos.map((c) => [c.concepto, c.cuentaId]))}
      cuentas={cuentas.map((c) => ({ valor: c.id, etiqueta: `${c.codigo} ${c.nombre}` }))}
      tesoreria={tesoreria.map((t) => ({ id: t.id, etiqueta: `${t.codigo} · ${t.nombre} (${t.moneda})${t.activo ? "" : " — inactiva"}`, cuentaContableId: t.cuentaContableId ?? "" }))}
    />
    </div>
  );
}
