import { DetalleRetencion } from "@/components/retenciones/detalle-retencion";
import { anularRetencionCliente } from "../../acciones";

export default async function DetalleRetencionCliente({ params }: { params: Promise<{ id: string }> }) {
  return <DetalleRetencion id={(await params).id} modulo="cxc" anular={anularRetencionCliente} />;
}
