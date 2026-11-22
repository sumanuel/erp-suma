"use client";

import { useState } from "react";
import { Tarjeta, claseControl } from "@/components/ui";
import { descuentoGlobal } from "@/lib/pedidos/calculos";

// Condiciones comerciales de un pedido, cotización o factura: vendedor, condición de pago, transporte, dirección de entrega y tres descuentos
// globales. Al elegir el cliente se proponen los suyos (se pueden cambiar). Las usan los tres formularios de venta.

export type InfoCliente = {
  lista: string;
  vendedorId: string;
  condicionPagoId: string;
  /// Días de la condición de pago del cliente (para proponer los días de crédito de la factura).
  diasCondicion: number;
  transporteId: string;
  direccionEnvio: string;
  descuentos: [string, string, string];
};
export type OpcionVenta = { valor: string; etiqueta: string };
export type DatosVentaForm = { clientes: Record<string, InfoCliente>; vendedores: OpcionVenta[]; condiciones: (OpcionVenta & { dias: number })[]; transportes: OpcionVenta[] };
export type CondicionesInicial = { vendedorId: string; condicionPagoId: string; transporteId: string; direccionEntrega: string; descuentos: [string, string, string] };

export const CONDICIONES_VACIAS: CondicionesInicial = { vendedorId: "", condicionPagoId: "", transporteId: "", direccionEntrega: "", descuentos: ["0", "0", "0"] };

const num = (s: string) => {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

export function useCondiciones(inicial: CondicionesInicial | undefined, datos: DatosVentaForm | undefined, clienteInicial: string) {
  const ini = inicial ?? CONDICIONES_VACIAS;
  const [vendedorId, setVendedorId] = useState(ini.vendedorId);
  const [condicionPagoId, setCondicionPagoId] = useState(ini.condicionPagoId);
  const [transporteId, setTransporteId] = useState(ini.transporteId);
  const [direccionEntrega, setDireccionEntrega] = useState(ini.direccionEntrega);
  const [descuentos, setDescuentos] = useState<[string, string, string]>(ini.descuentos);
  const [clienteId, setClienteId] = useState(clienteInicial);

  const info = datos?.clientes[clienteId];
  const global = descuentoGlobal(descuentos.map(num));

  /** Al elegir otro cliente se proponen sus condiciones; devuelve los días de su condición de pago. */
  function elegirCliente(id: string) {
    setClienteId(id);
    const c = datos?.clientes[id];
    if (!c) return 0;
    setVendedorId(c.vendedorId);
    setCondicionPagoId(c.condicionPagoId);
    setTransporteId(c.transporteId);
    setDireccionEntrega(c.direccionEnvio);
    setDescuentos(c.descuentos);
    return c.diasCondicion;
  }

  return {
    vendedorId, setVendedorId, condicionPagoId, setCondicionPagoId, transporteId, setTransporteId, direccionEntrega, setDireccionEntrega, descuentos, setDescuentos,
    /// Lista de precios del cliente elegido.
    lista: info?.lista ?? "A",
    /// Descuento global combinado (%), para la vista previa.
    global,
    elegirCliente,
    /// Lo que se envía al servidor.
    encabezado: () => ({
      vendedorId: vendedorId || null, condicionPagoId: condicionPagoId || null, transporteId: transporteId || null, direccionEntrega: direccionEntrega.trim() || null,
      descuentos: descuentos.map(num) as [number, number, number],
    }),
  };
}
export type Condiciones = ReturnType<typeof useCondiciones>;

export function CondicionesVenta({ cond, datos, onCondicion }: { cond: Condiciones; datos: DatosVentaForm; onCondicion?: (dias: number) => void }) {
  const campo = "flex flex-col gap-1.5";
  const etiqueta = "text-[13px] font-medium";
  return (
    <Tarjeta className="p-6">
      <h3 className="mb-4 text-[13px] font-semibold uppercase tracking-wide text-gris-600">Condiciones comerciales</h3>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className={campo}>
          <label htmlFor="vendedorId" className={etiqueta}>Vendedor <span className="font-normal text-gris-500">(opcional)</span></label>
          <select id="vendedorId" value={cond.vendedorId} onChange={(e) => cond.setVendedorId(e.target.value)} className={`${claseControl} pr-9`}>
            <option value="">Sin vendedor</option>
            {datos.vendedores.map((v) => <option key={v.valor} value={v.valor}>{v.etiqueta}</option>)}
          </select>
        </div>
        <div className={campo}>
          <label htmlFor="condicionPagoId" className={etiqueta}>Condición de pago <span className="font-normal text-gris-500">(opcional)</span></label>
          <select
            id="condicionPagoId" value={cond.condicionPagoId}
            onChange={(e) => { cond.setCondicionPagoId(e.target.value); onCondicion?.(datos.condiciones.find((c) => c.valor === e.target.value)?.dias ?? 0); }}
            className={`${claseControl} pr-9`}
          >
            <option value="">Sin condición</option>
            {datos.condiciones.map((c) => <option key={c.valor} value={c.valor}>{c.etiqueta}</option>)}
          </select>
        </div>
        <div className={campo}>
          <label htmlFor="transporteId" className={etiqueta}>Transporte <span className="font-normal text-gris-500">(opcional)</span></label>
          <select id="transporteId" value={cond.transporteId} onChange={(e) => cond.setTransporteId(e.target.value)} className={`${claseControl} pr-9`}>
            <option value="">Sin transporte</option>
            {datos.transportes.map((t) => <option key={t.valor} value={t.valor}>{t.etiqueta}</option>)}
          </select>
        </div>
        <div className={campo}>
          <label htmlFor="direccionEntrega" className={etiqueta}>Dirección de entrega <span className="font-normal text-gris-500">(opcional)</span></label>
          <input id="direccionEntrega" value={cond.direccionEntrega} onChange={(e) => cond.setDireccionEntrega(e.target.value)} maxLength={300} className={claseControl} />
        </div>
        {([0, 1, 2] as const).map((i) => (
          <div key={i} className={campo}>
            <label htmlFor={`descuentoGlobal${i + 1}`} className={etiqueta}>Descuento global {i + 1} (%)</label>
            <input
              id={`descuentoGlobal${i + 1}`} inputMode="decimal" value={cond.descuentos[i]}
              onChange={(e) => cond.setDescuentos((d) => d.map((x, k) => (k === i ? e.target.value : x)) as [string, string, string])} className={claseControl}
            />
          </div>
        ))}
        <div className={`${campo} justify-end`}>
          <p className="text-[12.5px] text-gris-500">
            Descuento global combinado: <span className="font-semibold text-tinta">{cond.global.toLocaleString("es-VE", { maximumFractionDigits: 4 })} %</span>. Se suma al de cada línea y la lista de precios
            es la <span className="font-semibold text-tinta">{cond.lista}</span> del cliente.
          </p>
        </div>
      </div>
    </Tarjeta>
  );
}
