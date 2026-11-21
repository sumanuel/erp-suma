import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export function Volver({ href, texto }: { href: string; texto: string }) {
  return <Link href={href} className="flex w-fit items-center gap-1 text-[13px] text-gris-600 hover:text-tinta"><ChevronLeft className="size-4" aria-hidden />{texto}</Link>;
}
