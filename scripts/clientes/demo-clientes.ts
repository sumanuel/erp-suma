// npm run cliente:demo -- <codigo>   → carga datos de ejemplo (clientes, catálogos y productos) en la base de ese cliente. Idempotente.
import "dotenv/config";
import { Client } from "pg";
import { clientePorSlug, poolControl, urlConexion } from "../../src/lib/nucleo/control";
import { sembrarCatalogosBase } from "../lib/catalogos-base";

const filas = [
  ["J300000011", "Centro Comercial Plaza Norte C.A.", "Plaza Norte", "Privado", "Comercial"],
  ["J300000022", "Frigorífico Río Claro C.A.", null, "Privado", "Industrial"],
  ["J300000033", "Hospital Modelo del Este", null, "Privado", "Sanitario"],
  ["J300000044", "Industrias Lácteas del Sur C.A.", "Lácteos del Sur", "Privado", "Industrial"],
  ["G200000055", "Alcaldía de Villa Ejemplo", null, "Público", "Municipal"],
  ["J300000066", "Supermercados La Costa S.R.L.", "La Costa Market", "Privado", "Comercial"],
];
async function main() {
  const slug = process.argv[2];
  const c = slug ? await clientePorSlug(slug) : null;
  if (!c) throw new Error("Uso: npm run cliente:demo -- <codigo> (el cliente debe existir)");
  const db = new Client({ connectionString: urlConexion(c, "migrador") });
  await db.connect();
  for (const f of filas)
    await db.query("INSERT INTO cliente (documento, razon_social, nombre_comercial, tipo, categoria) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (documento) DO NOTHING", f);
  await sembrarCatalogosBase(db);
  const cats = [["FER", "Ferretería", 2], ["PIN", "Pinturas", 2], ["ELE", "Electricidad", 1.5]] as const;
  for (const [codigo, nombre, cv] of cats) await db.query("INSERT INTO categoria (codigo, nombre, comision_venta) VALUES ($1,$2,$3) ON CONFLICT (codigo) DO NOTHING", [codigo, nombre, cv]);
  for (const [cat, codigo, nombre] of [["FER", "TOR", "Tornillería"], ["FER", "HER", "Herramientas manuales"], ["PIN", "ESM", "Esmaltes"], ["ELE", "CAB", "Cables"]] as const)
    await db.query("INSERT INTO subcategoria (categoria_id, codigo, nombre) SELECT id, $2, $3 FROM categoria WHERE codigo = $1 ON CONFLICT DO NOTHING", [cat, codigo, nombre]);
  const prods = [
    ["TOR-001", "Tornillo hexagonal 1/4 x 2 pulg", "FER", "TOR", "General", 0.05, 0.09],
    ["MAR-010", "Martillo de uña 16 oz", "FER", "HER", "General", 4.2, 7.5],
    ["ESM-004", "Esmalte sintético blanco 1 galón", "PIN", "ESM", "General", 11.8, 18.9],
    ["CAB-012", "Cable THW #12 por metro", "ELE", "CAB", "General", 0.55, 0.95],
    ["ARR-020", "Arroz blanco 1 kg", "FER", null, "Exento", 0.9, 1.35],
  ] as const;
  for (const [codigo, descripcion, cat, sub, iva, costo, precio] of prods) {
    await db.query(
      `INSERT INTO producto (codigo, descripcion, categoria_id, subcategoria_id, alicuota_iva_id, ultimo_costo, costo_promedio, precio_lista)
       SELECT $1, $2, c.id, (SELECT s.id FROM subcategoria s WHERE s.categoria_id = c.id AND s.codigo = $4), (SELECT id FROM alicuota_iva WHERE nombre = $5), $6, $6, $7
       FROM categoria c WHERE c.codigo = $3 ON CONFLICT (codigo) DO NOTHING`,
      [codigo, descripcion, cat, sub, iva, costo, precio],
    );
    await db.query(
      `INSERT INTO producto_presentacion (producto_codigo, unidad_medida_id, nombre, cantidad, precio_compra, precio_venta, principal)
       SELECT $1, id, 'Unidad', 1, $2, $3, true FROM unidad_medida WHERE codigo = 'UND' ON CONFLICT DO NOTHING`,
      [codigo, costo, precio],
    );
  }
  // Existencias iniciales en el almacén principal (con su línea de kardex). ESM-004 queda bajo su mínimo para ver la alerta.
  await db.query("UPDATE producto SET existencia_minima = 20 WHERE codigo = 'ESM-004'");
  for (const [codigo, cantidad] of [["TOR-001", 5000], ["MAR-010", 40], ["ESM-004", 12], ["CAB-012", 800]] as const) {
    const ya = await db.query("SELECT 1 FROM movimiento_inventario WHERE producto_codigo = $1", [codigo]);
    if (ya.rowCount) continue;
    await db.query("INSERT INTO existencia (almacen_id, producto_codigo, cantidad) SELECT id, $1, $2 FROM almacen WHERE codigo = 'PRINC' ON CONFLICT DO NOTHING", [codigo, cantidad]);
    await db.query(
      `INSERT INTO movimiento_inventario (tipo, almacen_id, producto_codigo, cantidad, costo_unitario, saldo_despues, motivo, usuario_nombre)
       SELECT 'ENTRADA', a.id, p.codigo, $2, p.costo_promedio, $2, 'Carga inicial (demo)', 'Sistema' FROM almacen a, producto p WHERE a.codigo = 'PRINC' AND p.codigo = $1`,
      [codigo, cantidad],
    );
  }
  // Tasas de ejemplo de los últimos días (el dólar y el euro del BCV publican con 8 decimales).
  for (let i = 5; i >= 0; i--) {
    for (const [codigo, base, paso] of [["USD", 36.41253687, 0.1832], ["EUR", 39.85127401, 0.2105]] as const) {
      await db.query(
        `INSERT INTO tasa_cambio (moneda_id, fecha, valor, fuente)
         SELECT m.id, (now() AT TIME ZONE 'America/Caracas')::date - $2::int, $3, 'BCV' FROM moneda m WHERE m.codigo = $1
         AND NOT EXISTS (SELECT 1 FROM tasa_cambio t WHERE t.moneda_id = m.id AND t.fecha = (now() AT TIME ZONE 'America/Caracas')::date - $2::int)`,
        [codigo, i, (base + (5 - i) * paso).toFixed(8)],
      );
    }
  }
  await db.end();
  console.log(`Datos de ejemplo cargados en ${slug}.`);
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => poolControl().end());
