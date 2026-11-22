import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { abrirEntorno, unico, type Entorno } from "./soporte/entorno";

// Clientes y proveedores con los campos del sistema anterior: el código se asigna solo y las reglas las hace cumplir la base.
describe("Clientes y proveedores", () => {
  let e: Entorno;
  before(async () => {
    e = await abrirEntorno();
  });
  const rechaza = (p: Promise<unknown>) => assert.rejects(p);

  it("el código se asigna solo, es único y sigue la secuencia", async () => {
    const a = await e.db.cliente.create({ data: { documento: unico("J"), razonSocial: "A", tipo: "Privado" } });
    const b = await e.db.cliente.create({ data: { documento: unico("J"), razonSocial: "B", tipo: "Privado" } });
    assert.match(a.codigo, /^C\d{6}$/);
    assert.ok(Number(b.codigo.slice(1)) > Number(a.codigo.slice(1)));
    await rechaza(e.db.cliente.create({ data: { documento: unico("J"), razonSocial: "C", tipo: "Privado", codigo: a.codigo } }));
    const p = await e.db.proveedor.create({ data: { documento: unico("P"), razonSocial: "P" } });
    assert.match(p.codigo, /^P\d{6}$/);
    const manual = await e.db.cliente.create({ data: { documento: unico("J"), razonSocial: "Manual", tipo: "Privado", codigo: unico("X") } });
    assert.match(manual.codigo, /^X/);
  });

  it("cliente: situación, tipo de persona, moneda, descuentos y crédito válidos", async () => {
    const base = () => ({ documento: unico("J"), razonSocial: "R", tipo: "Privado" });
    await rechaza(e.db.cliente.create({ data: { ...base(), situacion: "RARO" } }));
    await rechaza(e.db.cliente.create({ data: { ...base(), tipoPersona: "ROBOT" } }));
    await rechaza(e.db.cliente.create({ data: { ...base(), divisa: "EUR" } }));
    await rechaza(e.db.cliente.create({ data: { ...base(), descuento2: 150 } }));
    await rechaza(e.db.cliente.create({ data: { ...base(), comisionVentaPct: -1 } }));
    await rechaza(e.db.cliente.create({ data: { ...base(), limiteCredito: -5 } }));
    await rechaza(e.db.cliente.create({ data: { ...base(), diasMaxVencimiento: 400 } }));
    const ok = await e.db.cliente.create({ data: { ...base(), tipoPersona: "JURIDICA", contribuyenteEspecial: true, residente: false, limiteCredito: 2500, listaPrecio: "C", descuento1: 5 } });
    assert.equal(Number(ok.limiteCredito), 2500);
    assert.equal(ok.listaPrecio, "C");
  });

  it("cliente: vendedor, cobrador, condición, tipo de negocio y ubicación se guardan y se leen", async () => {
    const sufijo = unico("");
    const v = await e.db.vendedor.create({ data: { codigo: `V${sufijo}`, nombre: "Vendedor", esVendedor: true } });
    const co = await e.db.vendedor.create({ data: { codigo: `C${sufijo}`, nombre: "Cobrador", esVendedor: false, esCobrador: true } });
    const cp = await e.db.condicionPago.create({ data: { codigo: `CP${sufijo}`, nombre: "45 días", dias: 45 } });
    const tn = await e.db.tipoNegocio.create({ data: { codigo: `T${sufijo}`, nombre: "Mayorista" } });
    const pais = await e.db.pais.create({ data: { codigo: `P${sufijo}`, nombre: "País" } });
    const est = await e.db.estado.create({ data: { paisId: pais.id, codigo: "01", nombre: "Estado" } });
    const c = await e.db.cliente.create({
      data: { documento: unico("J"), razonSocial: "Completo", tipo: "Privado", vendedorId: v.id, cobradorId: co.id, condicionPagoId: cp.id, tipoNegocioId: tn.id, paisId: pais.id, estadoId: est.id },
      include: { vendedor: true, cobrador: true, condicionPago: true, tipoNegocio: true, pais: true, estado: true },
    });
    assert.equal(c.vendedor?.nombre, "Vendedor");
    assert.equal(c.cobrador?.nombre, "Cobrador");
    assert.equal(c.condicionPago?.dias, 45);
    assert.equal(c.tipoNegocio?.nombre, "Mayorista");
    assert.equal(c.estado?.nombre, "Estado");
    // Borrar el vendedor no borra al cliente: solo lo desliga.
    await e.db.vendedor.delete({ where: { id: v.id } });
    assert.equal((await e.db.cliente.findUniqueOrThrow({ where: { id: c.id } })).vendedorId, null);
  });

  it("proveedor: tipo de cuenta, descuentos y límite válidos; banco y condición ligados", async () => {
    const base = () => ({ documento: unico("P"), razonSocial: "Prov" });
    await rechaza(e.db.proveedor.create({ data: { ...base(), tipoCuentaBancaria: "VIRTUAL" } }));
    await rechaza(e.db.proveedor.create({ data: { ...base(), descuento3: 101 } }));
    await rechaza(e.db.proveedor.create({ data: { ...base(), limiteCredito: -1 } }));
    await rechaza(e.db.proveedor.create({ data: { ...base(), situacion: "X" } }));
    const banco = await e.db.banco.create({ data: { codigo: unico("B"), nombre: "Banco" } });
    const p = await e.db.proveedor.create({
      data: { ...base(), bancoId: banco.id, tipoCuentaBancaria: "CORRIENTE", numeroCuentaBancaria: "01020000000000000000", zonaLibre: true, cxpMonedaExtranjera: true, divisa: "USD" },
      include: { banco: true },
    });
    assert.equal(p.banco?.nombre, "Banco");
    assert.equal(p.zonaLibre, true);
  });
});
