import { DetalleRetencion } from "@/components/retenciones/detalle-retencion";
import { anularRetencionProveedor } from "../../acciones";

export default async function DetalleRetencionProveedor({ params }: { params: Promise<{ id: string }> }) {
  return <DetalleRetencion id={(await params).id} modulo="cxp" anular={anularRetencionProveedor} />;
}
