import {
  Banknote, ArrowLeftRight, Layers, History, BookOpenCheck, Boxes, Briefcase, ChartColumn, ClipboardList, FileText, FileSpreadsheet, Globe, House,
  Calculator, Landmark, Package, ReceiptText, Scale, ShieldCheck, ShoppingCart, SlidersVertical, Store, Truck, Users, Wallet,
  Warehouse, type LucideIcon,
} from "lucide-react";
import type { IconoMenu } from "@/lib/menu";

export const iconos: Record<IconoMenu, LucideIcon> = {
  inicio: House, comercial: Briefcase, compras: ShoppingCart, inventario: Boxes, finanzas: Wallet, analisis: ChartColumn,
  configuracion: SlidersVertical, clientes: Users, cotizaciones: FileText, pedidos: ClipboardList, facturacion: ReceiptText, pos: Calculator,
  proveedores: Store, ordenes: FileSpreadsheet, importaciones: Globe, productos: Package, catalogos: Layers, tablas: Layers, existencias: Warehouse,
  cxc: Banknote, tasas: ArrowLeftRight, cxp: Scale, tesoreria: Landmark, contabilidad: BookOpenCheck, reportes: ChartColumn, seguridad: ShieldCheck, auditoria: History,
};
// Truck se reserva para logística futura.
void Truck;
