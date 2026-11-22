import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { abrirTurno, cerrarTurno, registrarVentaPos, resumenTurno, type DatosVentaPos } from "../src/lib/pos/servicio";
import { abrirEntorno, automatica, crearCajaTesoreria, crearProducto, descuadreContable, fijarTasa, type Entorno } from "./soporte/entorno";

describe("Punto de venta", () => {
  let e: Entorno;
  before(async () => {
    e = await abrirEntorno();
    await fijarTasa(e.db, 40);
    await automatica(e.db, true);
  });
  after(async () => {
    await automatica(e.db, false);
  });

  const cajasUsadas: { id: string; fondo: number }[] = [];
  const saldo = async (id: string) => Number((await e.db.cuentaTesoreria.findUniqueOrThrow({ where: { id } })).saldo);
  const existencia = async (codigo: string) => Number((await e.db.existencia.findUnique({ where: { almacenId_productoCodigo: { almacenId: e.almacenId, productoCodigo: codigo } } }))?.cantidad ?? 0);

  /** Abre un turno con cajas nuevas, corre la prueba y siempre lo cierra (un usuario solo puede tener un turno abierto). */
  async function conTurno(fondoVes: number, fondoUsd: number, prueba: (t: { id: string; ves: string; usd: string }) => Promise<void>) {
    const ves = await crearCajaTesoreria(e, "VES", fondoVes);
    const usd = await crearCajaTesoreria(e, "USD", fondoUsd);
    cajasUsadas.push({ id: ves.id, fondo: fondoVes }, { id: usd.id, fondo: fondoUsd });
    const r = await abrirTurno(e.db, e.actor, { almacenId: e.almacenId, cajaVesId: ves.id, cajaUsdId: usd.id, fondoVes, fondoUsd });
    assert.ok(r.ok, JSON.stringify(r));
    try {
      await prueba({ id: r.id, ves: ves.id, usd: usd.id });
    } finally {
      await e.db.turnoCaja.updateMany({ where: { id: r.id, estado: "ABIERTO" }, data: { estado: "CERRADO", cerradoEn: new Date() } });
    }
  }
  const venta = (turnoId: string, codigo: string, cantidad: number, pagos: DatosVentaPos["pagos"], extra: Partial<DatosVentaPos> = {}) =>
    registrarVentaPos(e.db, e.actor, { turnoId, lineas: [{ productoCodigo: codigo, cantidad, precioUnitario: 10, descuento: 0 }], pagos, ...extra });

  it("abrir turno: cajas válidas, y no se abren dos a la vez", async () => {
    const ves = await crearCajaTesoreria(e, "VES");
    const usd = await crearCajaTesoreria(e, "USD");
    const banco = await e.db.cuentaTesoreria.create({ data: { codigo: `B${Math.random()}`.slice(0, 12), nombre: "Banco", tipo: "BANCO", moneda: "VES" } });
    const base = { almacenId: e.almacenId, cajaVesId: ves.id, cajaUsdId: usd.id, fondoVes: 0, fondoUsd: 0 };
    assert.equal((await abrirTurno(e.db, e.actor, { ...base, cajaVesId: banco.id })).ok, false); // un banco no es caja
    assert.equal((await abrirTurno(e.db, e.actor, { ...base, cajaVesId: usd.id, cajaUsdId: ves.id })).ok, false); // monedas cruzadas
    assert.equal((await abrirTurno(e.db, e.actor, { ...base, fondoVes: -1 })).ok, false);
    assert.equal((await abrirTurno(e.db, e.actor, { ...base, fondoUsd: 1.234 })).ok, false);
    const t = await abrirTurno(e.db, e.actor, base);
    assert.ok(t.ok);
    const otra = await abrirTurno(e.db, e.actor, base);
    assert.equal(otra.ok, false);
    if (!otra.ok) assert.match(otra.error, /turno abierto/);
    await e.db.turnoCaja.update({ where: { id: t.id }, data: { estado: "CERRADO", cerradoEn: new Date() } });
  });

  it("efectivo exacto en bolívares: factura de contado, cobro, caja, inventario y asiento", async () => {
    await conTurno(100, 0, async (t) => {
      const p = await crearProducto(e, { existencia: 10, costo: 4 });
      const r = await venta(t.id, p.codigo, 2, [{ formaPago: "EFECTIVO", moneda: "VES", recibido: 928 }]); // 23,20 USD × 40
      assert.ok(r.ok, JSON.stringify(r));
      assert.equal(r.totalUsd, 23.2);
      assert.equal(r.totalBs, 928);
      assert.equal(r.vueltoMonto, 0);
      assert.equal(await saldo(t.ves), 1028);
      assert.equal(await existencia(p.codigo), 8);
      const f = await e.db.factura.findUniqueOrThrow({ where: { id: r.facturaId } });
      assert.equal(Number(f.saldo), 0);
      assert.equal(f.diasCredito, 0);
      assert.equal(await e.db.asiento.count({ where: { origen: "COBRO", referencia: { contains: "COB-" }, descripcion: { contains: "Consumidor final" } } }) > 0, true);
      assert.equal(await descuadreContable(e.db), 0);
    });
  });

  it("sin cliente se factura a «Consumidor final» (uno solo, aunque se venda muchas veces)", async () => {
    await conTurno(0, 0, async (t) => {
      const p = await crearProducto(e, { existencia: 10 });
      assert.ok((await venta(t.id, p.codigo, 1, [{ formaPago: "EFECTIVO", moneda: "VES", recibido: 464 }])).ok);
      assert.ok((await venta(t.id, p.codigo, 1, [{ formaPago: "EFECTIVO", moneda: "VES", recibido: 464 }])).ok);
      assert.equal(await e.db.cliente.count({ where: { documento: "CONTADO" } }), 1);
    });
  });

  it("pago mixto: dólares en efectivo + bolívares por punto de venta a un banco", async () => {
    await conTurno(0, 0, async (t) => {
      const p = await crearProducto(e, { existencia: 10 });
      const banco = await e.db.cuentaTesoreria.create({ data: { codigo: `PV${Math.random()}`.slice(0, 12), nombre: "Banco punto", tipo: "BANCO", moneda: "VES", cuentaContableId: (await e.db.cuentaContable.findFirstOrThrow({ where: { codigo: "1.1.01" } })).id } });
      // total 23,20 USD = 928 Bs.: 10 USD en efectivo (400 Bs.) + 528 Bs. por punto
      const r = await venta(t.id, p.codigo, 2, [{ formaPago: "EFECTIVO", moneda: "USD", recibido: 10 }, { formaPago: "PUNTO_VENTA", moneda: "VES", recibido: 528, cuentaId: banco.id, referencia: "LOTE 77" }]);
      assert.ok(r.ok, JSON.stringify(r));
      assert.equal(await saldo(t.usd), 10);
      assert.equal(await saldo(banco.id), 528);
      assert.equal(await saldo(t.ves), 0);
      const f = await e.db.factura.findUniqueOrThrow({ where: { id: r.facturaId } });
      assert.equal(Number(f.saldo), 0);
      assert.equal(await e.db.cobro.count({ where: { aplicaciones: { some: { facturaId: r.facturaId } } } }), 2);
    });
  });

  it("vuelto en la misma moneda: paga 20 USD por 11,60 → la caja recibe solo 11,60", async () => {
    await conTurno(0, 0, async (t) => {
      const p = await crearProducto(e, { existencia: 10 });
      const r = await venta(t.id, p.codigo, 1, [{ formaPago: "EFECTIVO", moneda: "USD", recibido: 20 }]);
      assert.ok(r.ok);
      assert.equal(r.vueltoMoneda, "USD");
      assert.equal(r.vueltoMonto, 8.4);
      assert.equal(await saldo(t.usd), 11.6);
    });
  });

  it("vuelto en otra moneda: paga 20 USD y se le devuelven bolívares; las dos cajas y el libro cuadran", async () => {
    await conTurno(1000, 0, async (t) => {
      const p = await crearProducto(e, { existencia: 10 });
      const r = await venta(t.id, p.codigo, 1, [{ formaPago: "EFECTIVO", moneda: "USD", recibido: 20 }], { monedaVuelto: "VES" });
      assert.ok(r.ok, JSON.stringify(r));
      assert.equal(r.vueltoMoneda, "VES");
      assert.equal(r.vueltoMonto, 336); // 8,40 USD × 40
      assert.equal(await saldo(t.usd), 20); // entra todo el billete
      assert.equal(await saldo(t.ves), 664); // 1.000 − 336
      assert.equal(await descuadreContable(e.db), 0);
      const mov = await e.db.movimientoTesoreria.findMany({ where: { tipo: { in: ["VUELTO_ENTRADA", "VUELTO_SALIDA"] }, cuentaId: { in: [t.usd, t.ves] } } });
      assert.equal(mov.length, 2);
    });
  });

  it("el vuelto sin fondos en la caja deshace toda la venta", async () => {
    await conTurno(0, 0, async (t) => {
      const p = await crearProducto(e, { existencia: 10 });
      const facturas0 = await e.db.factura.count();
      const r = await venta(t.id, p.codigo, 1, [{ formaPago: "EFECTIVO", moneda: "USD", recibido: 20 }], { monedaVuelto: "VES" }); // la caja Bs. está vacía
      assert.equal(r.ok, false);
      assert.equal(await e.db.factura.count(), facturas0);
      assert.equal(await existencia(p.codigo), 10);
      assert.equal(await saldo(t.usd), 0);
      assert.equal(await e.db.ventaPos.count({ where: { turnoId: t.id } }), 0);
    });
  });

  it("falta cobrar, sobra un pago o excedente que no es efectivo: se rechaza sin dejar rastro", async () => {
    await conTurno(0, 0, async (t) => {
      const p = await crearProducto(e, { existencia: 10 });
      const banco = await e.db.cuentaTesoreria.create({ data: { codigo: `X${Math.random()}`.slice(0, 12), nombre: "Banco", tipo: "BANCO", moneda: "VES", cuentaContableId: (await e.db.cuentaContable.findFirstOrThrow({ where: { codigo: "1.1.01" } })).id } });
      const antes = await e.db.factura.count();
      assert.equal((await venta(t.id, p.codigo, 1, [{ formaPago: "EFECTIVO", moneda: "VES", recibido: 400 }])).ok, false); // 464 Bs.
      assert.equal((await venta(t.id, p.codigo, 1, [{ formaPago: "EFECTIVO", moneda: "VES", recibido: 464 }, { formaPago: "EFECTIVO", moneda: "USD", recibido: 5 }])).ok, false); // sobra
      assert.equal((await venta(t.id, p.codigo, 1, [{ formaPago: "TRANSFERENCIA", moneda: "VES", recibido: 500, cuentaId: banco.id }])).ok, false); // excedente sin efectivo
      assert.equal((await venta(t.id, p.codigo, 1, [{ formaPago: "TRANSFERENCIA", moneda: "VES", recibido: 464 }])).ok, false); // sin cuenta
      assert.equal((await venta(t.id, p.codigo, 1, [{ formaPago: "EFECTIVO", moneda: "VES", recibido: 464.123 }])).ok, false);
      assert.equal(await e.db.factura.count(), antes);
      assert.equal(await existencia(p.codigo), 10);
      assert.equal(await saldo(t.ves), 0);
    });
  });

  it("sin existencia o con crédito bloqueado no se vende y no queda nada", async () => {
    await conTurno(0, 0, async (t) => {
      const p = await crearProducto(e, { existencia: 1 });
      assert.equal((await venta(t.id, p.codigo, 2, [{ formaPago: "EFECTIVO", moneda: "VES", recibido: 928 }])).ok, false);
      const cli = await e.db.cliente.create({ data: { documento: `BL${Math.random()}`.slice(0, 12), razonSocial: "Bloqueado", tipo: "Privado", situacion: "BLOQUEADO" } });
      assert.equal((await venta(t.id, p.codigo, 1, [{ formaPago: "EFECTIVO", moneda: "VES", recibido: 464 }], { clienteId: cli.id })).ok, false);
      assert.equal(await existencia(p.codigo), 1);
      assert.equal(await saldo(t.ves), 0);
    });
  });

  it("concurrencia: 6 ventas simultáneas de 1 unidad con existencia de 3 → solo 3 se cobran", async () => {
    await conTurno(0, 0, async (t) => {
      const p = await crearProducto(e, { existencia: 3 });
      const rs = await Promise.all(Array.from({ length: 6 }, () => venta(t.id, p.codigo, 1, [{ formaPago: "EFECTIVO", moneda: "VES", recibido: 464 }])));
      assert.equal(rs.filter((r) => r.ok).length, 3);
      assert.equal(await existencia(p.codigo), 0);
      assert.equal(await saldo(t.ves), 1392);
      assert.equal(await e.db.ventaPos.count({ where: { turnoId: t.id } }), 3);
    });
  });

  it("cierre de caja: calcula lo esperado (fondo + movimientos del cajero), anota la diferencia y no se cierra dos veces", async () => {
    const ves = await crearCajaTesoreria(e, "VES", 500);
    const usd = await crearCajaTesoreria(e, "USD", 20);
    const abierto = await abrirTurno(e.db, e.actor, { almacenId: e.almacenId, cajaVesId: ves.id, cajaUsdId: usd.id, fondoVes: 500, fondoUsd: 20 });
    assert.ok(abierto.ok);
    const p = await crearProducto(e, { existencia: 10 });
    assert.ok((await venta(abierto.id, p.codigo, 1, [{ formaPago: "EFECTIVO", moneda: "VES", recibido: 464 }])).ok);
    assert.ok((await venta(abierto.id, p.codigo, 1, [{ formaPago: "EFECTIVO", moneda: "USD", recibido: 20 }])).ok); // vuelto 8,40 USD
    const parcial = await resumenTurno(e.db, abierto.id);
    assert.deepEqual(parcial!.esperado, { ves: 964, usd: 31.6 });
    // Reporte X/Z: base, IVA, devoluciones y anuladas del turno (dos ventas de 1 unidad a 10 USD + IVA 16 %).
    assert.equal(parcial!.totalUsd, Math.round((parcial!.subtotalUsd + parcial!.ivaUsd) * 1e4) / 1e4);
    assert.ok(parcial!.subtotalUsd > 0 && parcial!.ivaUsd >= 0);
    assert.equal(parcial!.devolucionesUsd, 0);
    assert.equal(parcial!.anuladas, 0);
    assert.equal((await cerrarTurno(e.db, e.actor, abierto.id, { contadoVes: -1, contadoUsd: 0, observaciones: null })).ok, false);
    const c = await cerrarTurno(e.db, e.actor, abierto.id, { contadoVes: 960, contadoUsd: 31.6, observaciones: "Faltan 4 Bs." });
    assert.ok(c.ok, JSON.stringify(c));
    assert.equal(c.esperadoVes, 964);
    assert.equal(c.diferenciaVes, -4);
    assert.equal(c.diferenciaUsd, 0);
    assert.equal((await cerrarTurno(e.db, e.actor, abierto.id, { contadoVes: 1, contadoUsd: 1, observaciones: null })).ok, false);
    assert.equal((await venta(abierto.id, p.codigo, 1, [{ formaPago: "EFECTIVO", moneda: "VES", recibido: 464 }])).ok, false); // cerrado
    const t = await e.db.turnoCaja.findUniqueOrThrow({ where: { id: abierto.id } });
    assert.equal(t.estado, "CERRADO");
    assert.equal(Number(t.esperadoVes), 964);
  });

  it("otro cajero no vende en tu turno ni lo cierra (salvo supervisor)", async () => {
    await conTurno(0, 0, async (t) => {
      const perfil = await e.db.perfil.findFirstOrThrow();
      const otro = await e.db.usuario.create({ data: { email: `caj${Math.random()}@x.test`.slice(0, 30), nombre: "Otro cajero", perfilId: perfil.id } });
      const actorOtro = { id: otro.id, nombre: otro.nombre };
      const p = await crearProducto(e, { existencia: 5 });
      const r = await registrarVentaPos(e.db, actorOtro, { turnoId: t.id, lineas: [{ productoCodigo: p.codigo, cantidad: 1, precioUnitario: 10, descuento: 0 }], pagos: [{ formaPago: "EFECTIVO", moneda: "VES", recibido: 464 }] });
      assert.equal(r.ok, false);
      assert.equal((await cerrarTurno(e.db, actorOtro, t.id, { contadoVes: 0, contadoUsd: 0, observaciones: null })).ok, false);
      assert.equal((await cerrarTurno(e.db, actorOtro, t.id, { contadoVes: 0, contadoUsd: 0, observaciones: null }, true)).ok, true); // supervisor
    });
  });

  it("el libro sigue cuadrado y cada caja usada = fondo + sus movimientos", async () => {
    assert.equal(await descuadreContable(e.db), 0);
    for (const c of cajasUsadas) {
      const m = await e.db.movimientoTesoreria.aggregate({ where: { cuentaId: c.id }, _sum: { monto: true } });
      assert.equal(await saldo(c.id), Math.round((c.fondo + Number(m._sum.monto ?? 0)) * 100) / 100);
    }
  });
});
