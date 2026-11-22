import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { abrirEntorno, unico, type Entorno } from "./soporte/entorno";
import { clientes, proveedores } from "../src/lib/maestros/terceros";
import { almacenes } from "../src/lib/maestros/existencias";
import { sucursales, seriesFiscales } from "../src/lib/maestros/catalogos-extra";

describe("Catálogos adicionales, contactos y sucursales", () => {
  let e: Entorno;
  before(async () => {
    e = await abrirEntorno();
  });
  const rechaza = (p: Promise<unknown>) => assert.rejects(p);

  it("el código de cada catálogo es único", async () => {
    const c = unico("K");
    for (const d of [e.db.actividadEconomica, e.db.clasificacionCliente, e.db.clasificacionProveedor, e.db.division, e.db.color, e.db.talla, e.db.sucursal] as unknown as { create: (a: unknown) => Promise<unknown> }[]) {
      await d.create({ data: { codigo: c, nombre: "A" } });
      await rechaza(d.create({ data: { codigo: c, nombre: "B" } }));
    }
  });

  it("serie fiscal: el documento debe ser factura o nota", async () => {
    await rechaza(e.db.serieFiscal.create({ data: { serie: unico("S"), documento: "RECIBO" } }));
    await e.db.serieFiscal.create({ data: { serie: unico("S"), documento: "NOTA_CREDITO", impresora: "Bematech" } });
  });

  it("sucursal: la fecha de cierre no precede a la apertura", async () => {
    await rechaza(e.db.sucursal.create({ data: { codigo: unico("S"), nombre: "X", fechaInicio: new Date("2026-05-01"), fechaFin: new Date("2026-04-01") } }));
    const v = await sucursales.validar!(e.db, { fechaInicio: "2026-05-01", fechaFin: "2026-04-01" }, false);
    assert.ok(v?.fechaFin);
  });

  it("cliente: clasificación y actividad son catálogos; el auxiliar debe ser de la cuenta elegida", async () => {
    const cl = await e.db.clasificacionCliente.create({ data: { codigo: unico("CL"), nombre: "Mayorista" } });
    const act = await e.db.actividadEconomica.create({ data: { codigo: unico("AE"), nombre: "Ferretería" } });
    const cliente = await e.db.cliente.create({ data: { razonSocial: "Cliente prueba", documento: unico("J"), tipo: "Privado", clasificacionId: cl.id, actividadEconomicaId: act.id } });
    assert.equal(cliente.clasificacionId, cl.id);
    // Borrar la clasificación en uso deja al cliente sin clasificación, no lo borra.
    await e.db.clasificacionCliente.delete({ where: { id: cl.id } });
    assert.equal((await e.db.cliente.findUnique({ where: { id: cliente.id } }))?.clasificacionId, null);

    const cuentas = await e.db.cuentaContable.findMany({ where: { posteable: true, activo: true }, take: 2 });
    assert.ok(cuentas.length === 2);
    const aux = await e.db.auxiliarContable.create({ data: { cuentaId: cuentas[0].id, codigo: unico("AX"), nombre: "Aux" } });
    const base = { razonSocial: "X", documento: "J123456789", tipo: "Privado" };
    const sin = await clientes.validar!(e.db, { ...base, auxiliarContableId: aux.id }, false);
    assert.ok(sin?.auxiliarContableId);
    const otra = await clientes.validar!(e.db, { ...base, cuentaContableId: cuentas[1].id, auxiliarContableId: aux.id }, false);
    assert.ok(otra?.auxiliarContableId);
    const ok = await proveedores.validar!(e.db, { ...base, cuentaContableId: cuentas[0].id, auxiliarContableId: aux.id, diasCredito: 0, retencionIvaPct: 0 }, false);
    assert.equal(ok?.auxiliarContableId, undefined);
  });

  it("contactos y sucursales: se borran con su cliente; el código de sucursal no se repite por cliente", async () => {
    const c = await e.db.cliente.create({ data: { razonSocial: "Con contactos", documento: unico("J"), tipo: "Privado" } });
    await e.db.contactoCliente.create({ data: { clienteId: c.id, nombre: "Ana", cargo: "Compras" } });
    await e.db.sucursalCliente.create({ data: { clienteId: c.id, codigo: "S1", nombre: "Sede norte" } });
    await rechaza(e.db.sucursalCliente.create({ data: { clienteId: c.id, codigo: "S1", nombre: "Otra" } }));
    const c2 = await e.db.cliente.create({ data: { razonSocial: "Otro", documento: unico("J"), tipo: "Privado" } });
    await e.db.sucursalCliente.create({ data: { clienteId: c2.id, codigo: "S1", nombre: "Misma clave, otro cliente" } });
    await e.db.cliente.delete({ where: { id: c.id } });
    assert.equal(await e.db.contactoCliente.count({ where: { clienteId: c.id } }), 0);
    assert.equal(await e.db.sucursalCliente.count({ where: { clienteId: c.id } }), 0);

    const p = await e.db.proveedor.create({ data: { razonSocial: "Prov", documento: unico("J") } });
    await e.db.contactoProveedor.create({ data: { proveedorId: p.id, nombre: "Luis" } });
    await e.db.proveedor.delete({ where: { id: p.id } });
    assert.equal(await e.db.contactoProveedor.count({ where: { proveedorId: p.id } }), 0);
  });

  it("almacén: sucursal y cuentas contables; ubicaciones físicas no dejan borrar el almacén", async () => {
    const suc = await e.db.sucursal.create({ data: { codigo: unico("SU"), nombre: "Principal" } });
    const cuenta = await e.db.cuentaContable.findFirst({ where: { posteable: true, activo: true } });
    const a = await e.db.almacen.create({ data: { codigo: unico("AL"), nombre: "Con cuentas", sucursalId: suc.id, cuentaInventarioId: cuenta!.id, telefono1: "0212" } });
    await e.db.ubicacionFisica.create({ data: { codigo: unico("UB"), almacenId: a.id, pasillo: "1", anaquel: "B", nivel: "3" } });
    await rechaza(e.db.almacen.delete({ where: { id: a.id } }));
    await e.db.sucursal.delete({ where: { id: suc.id } });
    assert.equal((await e.db.almacen.findUnique({ where: { id: a.id } }))?.sucursalId, null);
  });

  it("producto: la división es un catálogo", async () => {
    const d = await e.db.division.create({ data: { codigo: unico("DV"), nombre: "Plomería" } });
    const cat = await e.db.categoria.create({ data: { codigo: unico("CA"), nombre: "Cat" } });
    const iva = await e.db.alicuotaIva.create({ data: { nombre: unico("IVA") } });
    assert.ok(cat && iva);
    const p = await e.db.producto.create({ data: { codigo: unico("PR"), descripcion: "Con división", categoriaId: cat.id, alicuotaIvaId: iva.id, divisionId: d.id } });
    assert.equal(p.divisionId, d.id);
  });

  it("los maestros nuevos arman sus campos", async () => {
    for (const m of [clientes, proveedores, almacenes, sucursales, seriesFiscales]) {
      const campos = typeof m.campos === "function" ? await m.campos(e.db) : m.campos;
      assert.ok(campos.length > 3, m.id);
    }
  });
});
