// Búsqueda que comparten las pestañas de devoluciones y de notas: por número, factura, cliente o motivo.

/** «NC-5» y «ND-5» buscan esa nota (cada tipo numera por separado); «FAC-5», las de esa factura; un número solo, cualquiera de ellas. */
export function porTexto(buscado: string) {
  const texto = buscado.trim().slice(0, 60);
  if (!texto) return {};
  const n = /^(NC|ND|FAC)?-?0*(\d{1,9})$/i.exec(texto);
  const prefijo = n?.[1]?.toUpperCase();
  const numero = Number(n?.[2]);
  const numeros = !n ? [] : prefijo === "FAC" ? [{ factura: { numero } }] : prefijo ? [{ numero, tipo: prefijo === "NC" ? "CREDITO" : "DEBITO" }] : [{ numero }, { factura: { numero } }];
  const contiene = { contains: texto, mode: "insensitive" as const };
  return { OR: [...numeros, { cliente: { razonSocial: contiene } }, { cliente: { documento: contiene } }, { motivo: contiene }] };
}
