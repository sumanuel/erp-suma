import type { Client } from "pg";

// Catálogos que todo cliente necesita desde el primer día. Idempotente: se puede correr sobre un cliente existente.
export async function sembrarCatalogosBase(c: Client) {
  for (const [codigo, nombre, simbolo, esBase] of [["VES", "Bolívar", "Bs.", true], ["USD", "Dólar estadounidense", "$", false], ["EUR", "Euro", "€", false]] as const) {
    await c.query("INSERT INTO moneda (codigo, nombre, simbolo, es_base) VALUES ($1,$2,$3,$4) ON CONFLICT (codigo) DO NOTHING", [codigo, nombre, simbolo, esBase]);
  }
  for (const [nombre, venta, compra] of [["General", 16, 16], ["Reducida", 8, 8], ["Exento", 0, 0]] as const) {
    await c.query(
      "INSERT INTO alicuota_iva (nombre, porcentaje_venta, porcentaje_compra) VALUES ($1,$2,$3) ON CONFLICT (nombre) DO NOTHING",
      [nombre, venta, compra],
    );
  }
  await c.query("INSERT INTO almacen (codigo, nombre) VALUES ('PRINC', 'Almacén principal') ON CONFLICT (codigo) DO NOTHING");
  await c.query("INSERT INTO cuenta_tesoreria (codigo, nombre, tipo, moneda) VALUES ('CAJA-USD', 'Caja en dólares', 'CAJA', 'USD'), ('CAJA-VES', 'Caja en bolívares', 'CAJA', 'VES') ON CONFLICT (codigo) DO NOTHING");
  for (const [codigo, nombre] of [["UND", "Unidad"], ["CJ", "Caja"], ["PQ", "Paquete"], ["KG", "Kilogramo"], ["MT", "Metro"], ["LT", "Litro"], ["GL", "Galón"]] as const) {
    await c.query("INSERT INTO unidad_medida (codigo, nombre) VALUES ($1,$2) ON CONFLICT (codigo) DO NOTHING", [codigo, nombre]);
  }
}
