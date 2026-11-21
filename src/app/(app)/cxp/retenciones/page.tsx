import { ListaRetenciones } from "@/components/retenciones/lista-retenciones";

export default async function RetencionesProveedores({ searchParams }: { searchParams: Promise<{ q?: string; tipo?: string; estado?: string }> }) {
  return <ListaRetenciones sentido="PRACTICADA" base="/cxp/retenciones" searchParams={await searchParams} />;
}
