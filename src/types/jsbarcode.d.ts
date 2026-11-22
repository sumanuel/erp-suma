declare module "jsbarcode" {
  type Opciones = { format?: string; width?: number; height?: number; displayValue?: boolean; fontSize?: number; margin?: number; textMargin?: number };
  export default function JsBarcode(elemento: SVGElement | string, valor: string, opciones?: Opciones): void;
}
