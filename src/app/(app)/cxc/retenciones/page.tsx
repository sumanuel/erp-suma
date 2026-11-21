import { ListaRetenciones } from "@/components/retenciones/lista-retenciones";

export default async function RetencionesClientes({ searchParams }: { searchParams: Promise<{ q?: string; tipo?: string; estado?: string }> }) {
  return <ListaRetenciones sentido="SUFRIDA" base="/cxc/retenciones" searchParams={await searchParams} />;
}
