import Link from "next/link";
import { FileSpreadsheet, Plus } from "lucide-react";
import { Listado } from "@/components/listado/listado";
import { textoAviso } from "@/components/ficha";
import { Aviso, Etiqueta, clasesBoton } from "@/components/ui";
import { requerirPermiso, tienePermiso } from "@/lib/dal";
import type { Busqueda, Definicion } from "@/lib/listados";
import { eliminarRegistro } from "@/app/maestros-acciones";
import { diaDeCaracas, entreDiasCaracas, rangoDeFechas } from "@/lib/filtros-fecha";
import { normalizar, type Fila, type Maestro } from "@/lib/maestros/tipos";

export async function ListadoMaestro({ maestro: m, busqueda }: { maestro: Maestro; busqueda: Busqueda }) {
  const ctx = await requerirPermiso(m.modulo, "ver");
  const { db } = ctx;
  const aviso = textoAviso(busqueda.aviso, { singular: m.singular }, m.genero);
  const clavePrimaria = m.clave.campo;
  const puedeCrear = !m.soloConsulta && !m.sinCrear && tienePermiso(ctx, m.modulo, "crear");
  const puedeEliminar = !m.soloConsulta && !m.sinEliminar && tienePermiso(ctx, m.modulo, "eliminar");

  // Un filtro sin nada que elegir (por ejemplo, marcas si ningún producto tiene) no se muestra.
  const filtrosDelMaestro = [...(m.filtros ?? []), ...((await m.filtrosDe?.(db)) ?? [])].filter((f) => f.opciones.length > 0);
  // Con rango de fechas, los calendarios van del primer registro a hoy.
  const texto = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const campoFecha = m.fechas?.campo;
  const extremo = async (dir: "asc" | "desc") => {
    const [f] = await m.delegado(db).findMany({ orderBy: { [campoFecha!]: dir }, take: 1 });
    return f ? diaDeCaracas(f[campoFecha!] as Date) : null;
  };
  const fechas = campoFecha ? rangoDeFechas({ desde: texto(busqueda.desde), hasta: texto(busqueda.hasta) }, "todas", { _min: { fecha: await extremo("asc") }, _max: { fecha: await extremo("desc") } }) : null;

  const definicion: Definicion<Fila, Fila> = {
    id: m.id,
    titulo: m.plural,
    modulo: m.modulo,
    ruta: m.ruta,
    elemento: { singular: m.singular, plural: m.plural },
    busqueda: m.busqueda.texto,
    rango: fechas ? { desde: fechas.desde, hasta: fechas.hasta, activo: { desde: fechas.desdeFecha ? fechas.desde : undefined, hasta: fechas.hastaFecha ? fechas.hasta : undefined } } : undefined,
    filtros: filtrosDelMaestro.map((f) => ({ id: f.id, etiqueta: f.etiqueta, todos: f.todos, opciones: f.opciones.map((o) => ({ valor: o.valor, etiqueta: o.etiqueta })) })),
    orden: m.orden,
    soloLectura: m.soloConsulta,
    claveFila: m.claveFila ?? ((f) => String(f[clavePrimaria])),
    enlace: m.soloConsulta || m.sinEdicion ? undefined : (f) => `${m.ruta}/${encodeURIComponent(String(f[clavePrimaria]))}`,
    columnas: m.columnas.map((c) => ({
      id: c.id,
      titulo: c.titulo,
      valor: (f) => normalizar(c.valor ? c.valor(f) : c.campo ? f[c.campo] : null),
      formato: c.formato,
      alinear: c.alinear,
      oculta: c.oculta,
      fija: c.fija,
      ordenar: c.campo ? (dir) => ({ [c.campo!]: dir }) : undefined,
      celda: c.etiqueta
        ? (f) => {
            const e = c.etiqueta!(c.valor ? c.valor(f) : c.campo ? f[c.campo] : null);
            return <Etiqueta tono={e.tono}>{e.texto}</Etiqueta>;
          }
        : undefined,
    })),
    cargar: async ({ texto, filtros, orden, salto, cantidad }) => {
      const condiciones: Fila[] = [];
      // Un campo con punto ("producto.descripcion") busca dentro de la relación.
      const condicion = (campo: string): Fila => campo.split(".").reduceRight<Fila>((dentro, parte, i, partes) => (i === partes.length - 1 ? { [parte]: { contains: texto, mode: "insensitive" } } : { [parte]: dentro }), {});
      if (texto) condiciones.push({ OR: m.busqueda.campos.map(condicion) });
      if (fechas?.restringe) condiciones.push({ [campoFecha!]: entreDiasCaracas(fechas.desdeFecha, fechas.hastaFecha) });
      for (const f of filtrosDelMaestro) {
        const op = f.opciones.find((o) => o.valor === filtros[f.id]);
        if (op) condiciones.push(op.donde);
      }
      const where = condiciones.length > 0 ? { AND: condiciones } : {};
      const d = m.delegado(db);
      const [filas, total] = await Promise.all([
        d.findMany({ where, orderBy: orden.length > 0 ? Object.assign({}, ...orden) : undefined, skip: salto, take: cantidad, include: m.incluir }),
        d.count({ where }),
      ]);
      return { filas, total };
    },
  };

  return (
    <div className="flex flex-col gap-4">
      {m.encabezado ? await m.encabezado(db) : null}
      {aviso ? <Aviso tono="exito">{aviso}</Aviso> : null}
      <Listado
        definicion={definicion}
        busqueda={Promise.resolve(busqueda)}
        acciones={
          puedeCrear ? (
            <>
              {m.importable ? (
                <Link href={`${m.ruta}/importar`} className={clasesBoton("secundario")}>
                  <FileSpreadsheet className="size-4" aria-hidden />
                  Importar Excel
                </Link>
              ) : null}
              <Link href={`${m.ruta}/nuevo`} className={clasesBoton("primario")}>
                <Plus className="size-4" aria-hidden />
                {m.genero === "el" ? "Nuevo" : "Nueva"} {m.singular}
              </Link>
            </>
          ) : null
        }
        eliminar={puedeEliminar ? (f) => eliminarRegistro.bind(null, m.id, String(f[clavePrimaria])) : undefined}
      />
    </div>
  );
}
