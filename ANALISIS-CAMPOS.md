# Análisis de campos: Lebrun (origen) contra `erp-suma` (nuevo)

> **Alcance (2026-11-22):** solo se hace lo que existe en el original; lo que no, queda anotado como fuera de alcance en `PLAN-WEB.md` sección 12.00 (con la revisión contra el código del original).

**Fecha:** 2026-11-21 · **Objetivo:** comprobar que los formularios nuevos tienen **todos los campos que el Lebrun original usa**. Es condición del proyecto: si falta un campo, el cliente no puede dejar de usar el escritorio.

## 1. Cómo se hizo y qué tan firme es

- **Pantallas originales:** se leyeron los 155 archivos `.Designer.cs` que `lebrun.csproj` compila (se excluyen `Copia de…`, `Malo_…`, `NewFolder1`). Por pantalla se sacaron etiquetas, controles de entrada, botones y columnas de grillas → `docs/analisis/inventario.json`.
- **Base original:** se leyó el respaldo `respaldo_bd_local/antes_N2_restantes_2026-10-23.sql` (259 tablas) → `docs/analisis/esquema.json` (columnas con tipo).
- **Nuevo:** modelos Prisma (`prisma/schema/*.prisma`) y formularios (`src/app/(app)/**`, `src/lib/maestros/*`).
- **Reproducir:** `node docs/analisis/extraer.mjs`, `node docs/analisis/esquema.mjs` (ajustar las rutas de la parte superior); `node docs/analisis/ver.mjs <parte del nombre>` muestra una pantalla y `node docs/analisis/cols.mjs <tabla>` las columnas de una tabla.

**Límites (importante):**
1. Es un inventario de lo que las pantallas **muestran** y de lo que las tablas **guardan**. No prueba que un campo esté *en uso* con datos reales: eso se confirma con el respaldo de producción y con quien opera el sistema (sección 6).
2. Algunas pantallas (`frmMantProductos`, `frmProveedores`) arman controles en código, no en el diseñador; sus etiquetas salen completas pero no sus controles.
3. El nombre de la tabla/columna no siempre dice qué hace; donde hay duda se marca «¿?» y se anota en la sección 6.
4. Lo que sigue compara **campos**. Las reglas de cálculo (por ejemplo, los tres descuentos escalonados) se mencionan, pero su paridad hay que probarla contra el sistema actual.

## 2. Resultado en una mirada

| Área | Campos en el original | Campos en el nuevo | Veredicto |
|---|---|---|---|
| **Clientes** | 49 columnas · 36 etiquetas en pantalla | ~55 | **✅ Completado el 2026-11-21** (faltan contactos, sucursales y cuenta contable) |
| **Proveedores** | 42 columnas · 50 etiquetas | ~45 | **✅ Completado el 2026-11-21** (falta varios contactos y cuentas contables) |
| **Productos** | 31 columnas + presentaciones, precios por lista, promociones | ~40 + precios y promociones | **✅ Campos completados el 2026-11-21** (falta usarlos en ventas, cambio masivo e imagen) |
| **Pedido / Prefactura / Factura** | 46–47 columnas · ~40 etiquetas | + vendedor, condición de pago, transporte, entrega, 3 descuentos globales, lista de precios y control de crédito | **✅ Condiciones completadas el 2026-11-21** (faltan pronto pago, almacén/unidad por línea y pago mixto con el POS) |
| **Orden de compra** | 29 columnas | proveedor, fechas, observaciones, líneas | **Incompleto** (moneda/cambio, condición, 3 descuentos, arancel) |
| **Documento del proveedor** | 45 columnas | 8 | **Incompleto** (fechas, desglose por alícuota, tipo de documento) |
| **Cobros (recibo de ingreso)** | 16 + 20 columnas | 7 | **Incompleto** (cobrador, pago mixto, anticipos, cheques) |
| **Pagos a proveedores** | 16 columnas | 6 | **Incompleto** (cheque, portador, comprobante) |
| **Bancos y cuentas bancarias** | 12 + 31 columnas | 9 | **Incompleto** (titular, chequeras, ITF/IDB, catálogo de bancos) |
| **Plan de cuentas y comprobantes** | plan, auxiliares, comprobante | plan, asientos | **Parcial** (auxiliares, saldo inicial, banderas, concepto por línea) |
| **Almacenes** | 16 columnas | 3 | **Incompleto** |
| **Catálogos** | ~25 tablas de apoyo | 9 | **Faltan** condición de pago, vendedores, cobradores, transporte, tipo de negocio, zonas, bancos… |

> Lo construido hasta ahora cubre bien el **flujo** (pedido → factura → cobro → contabilidad, compras, pagos, retenciones, tesorería) pero los **datos maestros y los encabezados de documentos** quedaron con los campos mínimos. Eso es lo que hay que completar antes de pensar en el corte.

Prioridad: **A** = sin esto no se puede operar o declarar; **M** = se usa a diario pero hay alternativa; **B** = ocasional o de reportes.

## 3. Maestros

### 3.1 Clientes (`admclientes`, `frmClientes`, `frmClientesMayor`)

Nuevo: documento (RIF), razón social, nombre comercial, tipo, categoría, dirección, teléfono, correo, activo.

| Campo original | En el nuevo | Prio |
|---|---|---|
| Código de cliente (`cli_codigo`) | **Falta.** Hay id interno, pero el negocio usa el código | A |
| RIF y **NIF** | RIF sí; NIF falta | A |
| Tipo de persona (natural/jurídica) | Hay «tipo» genérico: definir si equivale | A |
| **Residente** (sí/no) | Falta (afecta retención de ISLR) | A |
| **Contribuyente** (IVA) y **Contribuyente especial** | Falta (afecta retenciones de IVA) | A |
| Situación (activo, bloqueado…) | Solo activo/inactivo | M |
| Dirección fiscal, **dirección 2 y dirección de envío** | Una sola dirección | A |
| País, región, estado, municipio, parroquia, **zona postal**, zona geográfica | Falta, y no existe el catálogo geográfico | M |
| Teléfono, teléfono master, **fax, celular, otro celular**, código de área | Un teléfono | M |
| Página web | Falta | B |
| **Vendedor** y **cobrador** | Falta (base de comisiones y de cobranza) | A |
| **% comisión venta y % comisión cobranza** del cliente | Falta | M |
| **Condición de pago**, día y hora de cobro, **días de plazo** | Falta: los días de crédito se escriben en cada factura | A |
| **Límite de crédito** y «línea de días de vencimiento» (`cli_lindiasven`) | Falta (no se controla el crédito) | A |
| **Lista de precios** del cliente (`cli_lisprecio`) y «último precio» (`cli_ultiprecio`) | Falta | A |
| **Descuentos de venta 1, 2 y 3** | Falta | A |
| **Tipo de negocio** (con topes de descuento y días de «leyenda») | Falta el catálogo y el campo | M |
| Transporte habitual | Falta | M |
| Divisa del cliente | Falta | M |
| Clasificación, actividad económica, representante | Falta | M |
| Fecha de registro, fecha de nacimiento, vacaciones (inicio/fin) | Falta | B |
| Observaciones (3 memos) | Falta | M |
| Cuenta contable y auxiliar contable del cliente | Falta (hoy la cuenta por cobrar es única, por concepto) | M |
| «C.P. FERLE», «NonMbreg», «gacenun» | ¿? específicos de una empresa; confirmar si se usan | B |
| Contactos (`admpersonalcli`, `dlgDatosContactoCliente`) | Falta | M |
| Sucursales del cliente (`admsucursalcli`, 17 columnas) | Falta | M |
| Clasificación de clientes (`admclasiclient`), asociados (`admcliasociados`) | Falta | B |


> **✅ Avance 2026-11-21 (clientes):** hecho: código automático o manual, NIF, tipo de persona, residente, contribuyente (especial), situación, tres direcciones y país→estado→municipio→parroquia, zona postal y geográfica, teléfonos, celulares, fax, web, vendedor, cobrador, comisiones, condición de pago, lista de precios, tres descuentos, tipo de negocio, transporte, moneda, crédito (límite y días máximos), día y hora de cobro, fecha de nacimiento, clasificación, actividad económica, representante y observaciones. Con reglas en la base y pruebas.
> **✅ Avance 2026-11-22 (clientes, catálogos):** contactos (varias personas), sucursales del cliente, cuenta contable y auxiliar propios, y clasificación y actividad económica como catálogos.
> **⬜ Sigue pendiente:** usar la cuenta contable del cliente al contabilizar, y cargar los datos reales con la importación. No se llevaron `FERLE` (confirmado que no se usa), `gacenun`, `nonmbreg` ni las fechas de vacaciones.

### 3.2 Proveedores (`admproveedor`, `frmProveedores`)

Nuevo: documento, razón social, nombre comercial, contacto, teléfono, correo, dirección, días de crédito, % retención de IVA, activo.

| Campo original | En el nuevo | Prio |
|---|---|---|
| Código de proveedor | **Falta** | A |
| **Tipo de persona, residente, contribuyente, contribuyente especial** | Falta (definen la retención de ISLR e IVA) | A |
| **Actividad económica** y clasificación | Falta (concepto de ISLR) | A |
| Situación | Solo activo | M |
| **Divisa** (moneda del proveedor) | Falta (hoy la moneda se elige por producto) | A |
| **Condición de pago**, días de plazo, **límite de crédito** | Solo «días de crédito» | A |
| **Descuentos 1, 2 y 3** | Falta | M |
| **Zona libre** | Falta | M |
| «CxP en moneda extranjera», «órdenes de compra en moneda extranjera», «solicita cotización en moneda extranjera» | Falta (banderas por proveedor) | M |
| **Banco, tipo de cuenta** y cuenta de transferencia | Falta (necesario para pagar) | A |
| Cuenta contable, cuenta de efectivo, centro de costo por proveedor | Falta | M |
| Dirección 1, 2 y 3, país, estado, municipio, parroquia, región, código de área | Una dirección | M |
| Teléfonos 1, 2 y 3, celulares 1 y 2, página web | Un teléfono | M |
| Foto, comentario | Falta | B |
| Fecha de registro | Falta | B |
| Personas de contacto (`admpersonalprov`) | Un solo nombre de contacto | M |
| % de retención de IVA | Sí (extra del nuevo) | — |


> **✅ Avance 2026-11-21 (proveedores):** hecho: código, tipo de persona, residente, contribuyente (especial), zona libre, situación, clasificación, actividad económica, moneda en que factura, condición de pago (si los días están en 0 se toman de ella), límite de crédito, tres descuentos, las banderas de moneda extranjera, banco, tipo y número de cuenta, tres direcciones y ubicación encadenada, tres teléfonos, dos celulares, web y observaciones.
> **✅ Avance 2026-11-22 (proveedores, catálogos):** varias personas de contacto, cuenta contable y auxiliar propios, y clasificación y actividad económica como catálogos.
> **⬜ Sigue pendiente:** foto, y usar la cuenta contable del proveedor al contabilizar. El enlace de la condición de pago a las órdenes y facturas de compra se hace en el paso 5.

### 3.3 Productos (`adminv`, `adminvmed`, `adminvparam`, `admprecios`, `admpromociones`, `frmMantProductos`)

Ya está: código, descripción, categoría/subcategoría, alícuota de IVA, arancel, código de fabricante, código de barras, procedencia, garantía, peso, volumen, alto, ancho, existencias mínima y máxima, comisiones, costos, precio de lista, precio máximo al público, observaciones, activo; presentaciones (unidad, cantidad, precios, principal); proveedores por producto (moneda, país).

| Campo original | En el nuevo | Prio |
|---|---|---|
| **Marca** (`inv_codmarca`, catálogo `admmarcas`) | Falta | M |
| **División** (`inv_divisi`) | Falta | B |
| **Método de costo** (`inv_metcos`: promedio, último…) | Falta (hoy solo promedio ponderado) | M |
| «Descripción editable» (`inv_editar`) | Falta (permite cambiar el texto al vender) | M |
| «Utilización» (`inv_utiliz`) y «impuesto patente» (`inv_imppat`) | Falta ¿? | B |
| «Requiere medida» (`inv_reqmed`), capacidad/contenido | Falta | M |
| Imagen del producto | Falta | M |
| Estado (activo/descontinuado…) | Solo activo | M |
| «Promoción» (bandera) | Falta; y no hay promociones | M |
| Fecha de creación, 3 observaciones y memo | Una observación | B |
| **Listas de precio múltiples** (`admpreciotip`, `admprecios`: lista A, B, C…, con utilidad %, descuento, descuento máximo, **precio en dólares**, **vencimiento del precio**, usuario) | **Falta.** Hoy hay un solo precio de lista y el precio de venta por presentación | **A** |
| **Cambio masivo de precios** (`frmCambioPrecio`) | ✅ 2026-11-22 (por lista, con vista previa y auditoría; falta aplicarlo a presentaciones) | M |
| **Promociones** (`frmPromociones`: precio, % descuento, vigencia, lista, **cantidad requerida / otorgada / múltiplo**) | Falta | M |
| Unidad por producto con **signo** (× o ÷) y banderas «visible en ventas / en compras» (`ime_compra`, `ime_venta`, `ime_signo`) | Hay presentaciones, sin signo ni visibilidad por operación | M |
| Productos sustitutos, asociados, componentes (`admsustituto`, `admproasociados`, `admcomponentes`, `admcompproduc`) | ✅ 2026-11-22 (se registran; falta usarlos al vender) | B |
| Seriales, tallas, colores (`admseriales`, `admtallas`, `admcolor`) | Falta | B |
| Etiquetas de góndola (`frmEtiq*`, 4 formatos) | Falta | B |
| Ubicación física (`admubicafis`, `admubicacfis`) | Falta | B |


> **✅ Avance 2026-11-21 (productos):** hecho: **marca** (catálogo nuevo en Catálogos), **método de costo** (promedio ponderado o último costo; el inventario ya lo aplica al recibir mercancía), «descripción editable», utilización, «requiere medida», **capacidad o contenido**, **descontinuado**, **listas de precio A–F** por producto o por presentación (precio en USD, utilidad, descuento, **descuento máximo**, **vencimiento**), **promociones** (precio o descuento por fechas, lista, **cantidad requerida / otorgada / múltiplo**) y **visible en ventas / compras** por presentación. Formulario del producto por secciones; reglas en la base y pruebas.
> **⬜ Sigue pendiente:** que el pedido y la factura **tomen el precio de la lista del cliente** y apliquen promociones y descuento máximo (paso 5); **cambio masivo de precios**; imagen del producto; división; «impuesto patente» (¿?); productos sustitutos, asociados y componentes; seriales, tallas y colores; etiquetas de góndola; ubicación física.

### 3.4 Almacenes (`admalmacenes`) y catálogos de producto

- **Almacén:** el original guarda código, descripción, **dirección 1 y 2, teléfonos 1 y 2, comentario, transporte, sucursal**, y **cuentas contables de entrada y salida** por tipo de movimiento (transferencia, ajuste, proceso) más una cuenta. El nuevo: código, nombre, dirección, activo. Falta teléfono, comentario, sucursal y las cuentas contables por movimiento (M). **✅ 2026-11-22:** hecho (teléfonos, comentario, sucursal, cuenta de inventario y de entrada/salida por traslado, ajuste y proceso), más **ubicaciones físicas** y **división** del producto; las cuentas se guardan, **aún no se usan al contabilizar**.
- **Alícuota de IVA:** tiene los tres porcentajes (venta, zona libre, compra). ✔️
- **Arancel:** código, descripción, porcentaje, impuesto, kilos. ✔️
- **Categoría y subcategoría:** código, nombre, comisiones. ✔️ Falta la **imagen** y la **descripción larga** que tienen grupo y subgrupo originales (B).

## 4. Documentos

### 4.1 Pedido, prefactura y factura (`admpedido`, `admdocclipre`, `admdoccli`, `frmPedido`, `frmPrefactura`, `frmFactura`)

Nuevo (formulario de factura): cliente, almacén, observaciones, días de crédito; por línea: producto, cantidad, precio, descuento %. En el pedido: cliente, fecha, observaciones, líneas.

> **✅ Avance 2026-11-21 (cotización, pedido y factura):** hecho: **vendedor**, **condición de pago** (propone los días de crédito de la factura), **transporte**, **dirección de entrega** y **tres descuentos globales** en cadena; todo se propone desde la ficha del cliente y se puede cambiar. El precio sale de la **lista de precios del cliente** (con **promociones** de precio o descuento vigentes) y se respeta el **descuento máximo** de la lista. **Control de crédito** al facturar: bloqueado no compra; a crédito solo con crédito habilitado, sin mora, dentro del **límite** y sin facturas vencidas más allá de los **días máximos**. Los documentos copian sus condiciones al convertirse (cotización → pedido → factura) y el detalle las muestra.
> **⬜ Sigue pendiente:** aplicar el **pronto pago** al cobrar, la **unidad de venta por línea** (ventas por presentación), el permiso «cambiar precio» en el POS, y **candado por cliente** en el crédito (dos ventas a crédito simultáneas pueden pasar el límite juntas).

> **✅ Avance 2026-11-22 (punto de venta):** hecho: **turnos de caja** (apertura con fondo en Bs. y USD, un turno abierto por cajero), **venta de mostrador** (factura de contado + cobros en una sola transacción), **pago mixto** (efectivo en Bs. o USD, punto de venta, pago móvil, transferencia, Zelle, con cuenta y referencia), **vuelto** en la moneda del pago o en la otra, **cierre de caja** con conteo, diferencia y observaciones, y **recibo no fiscal**.
> **⬜ Sigue pendiente:** impresora fiscal y **serie fiscal** (caja, serial, IP; número fiscal y de control al facturar), reportes **Z y X**, devoluciones y anulación de una venta desde el POS, cheques y tarjeta de crédito/débito diferenciadas en el cierre, venta a crédito y vendedor en el mostrador, y control del permiso «cambiar precio».

| Campo original | En el nuevo | Prio |
|---|---|---|
| **Vendedor** (y comisión resultante) | Falta | A |
| **Condición de pago** (catálogo) y **modo de pago** | Solo «días de crédito» | A |
| **Plazo en días** y fecha de vencimiento | Días sí; sale del cliente en el original | M |
| **Descuento global (3 niveles, `Des G`, `Dscto vtas 1-3`)** y descuento por ítem | Solo descuento por línea | A |
| **Pronto pago:** días 1 y 2 y porcentajes 1 y 2 (`pDiasPP1/2`, `pFechaPP1/2`) | ✅ 2026-11-22: en la condición de pago y copiado al documento (falta aplicarlo al cobrar) | M |
| **Dirección de entrega** y dirección fiscal impresas | Falta (se toma del cliente, que solo tiene una) | A |
| **Transporte**, cantidad de bultos, kilos | ✅ 2026-11-22 | M |
| **Almacén por línea** y **unidad de venta** por línea | ✅ Almacén por línea (2026-11-22). ⬜ Unidad de venta por línea: requiere vender por presentación con conversión de unidades | A |
| **Divisa de visualización** y valor de cambio | Todo en USD con tasa congelada ✔️ (la divisa elegida en pantalla no) | M |
| **Origen de venta** (`cboOrigenVenta`) | ✅ 2026-11-22 (catálogo + campo del documento) | M |
| **Caja, número de punto de venta, relación de caja** | Falta (llega con el POS) | A |
| **Número fiscal** y **número de control** | Se registran después de emitir ✔️ | — |
| **Serie fiscal / serial / IP de la impresora** (`frmSerieFiscal`) | Falta (llega con la impresora fiscal) | A |
| «Cambiar precio» (permiso de cambiar el precio en la línea) | ✅ 2026-11-22: permiso especial; sin él solo se vende al precio de la lista (falta en el POS) | M |
| **Pago contado/mixto en la propia factura:** efectivo, tarjetas, **cheques (banco, número)**, cambio, monto a abonar | Falta (llega con el POS; hoy se cobra aparte) | A |
| Aprobación gerencial (`frmAprobacionGerencial`, `pFlagAprob`, `pLoginAprob`) | ✅ 2026-11-22: permiso especial que aprueba excepciones de crédito con motivo (falta el flujo de pedir aprobación a otro gerente) | M |
| Tipo de pedido, nota de entrega (`pNroNotaEntrega`), «genera giro», «grava comisión especial», pre-lista | Falta ¿? | B |
| Documentos no impresos (`frmDocumentosNoImpresos`), reimpresión | Falta | M |
| Cierre de caja (`cierreCaja`: facturas, devoluciones, punto de venta, cheque, efectivo, tarjetas, IVA, cuadre) | Falta (llega con el POS) | A |
| Exportar/importar factura de devolución (`frmImportarDev`) | Sustituido por las notas de crédito ✔️ | — |

### 4.2 Orden de compra (`admordencompra`, `frmOrdenCompra`)

| Campo original | En el nuevo | Prio |
|---|---|---|
| **Moneda y valor de cambio** de la orden | Falta (el nuevo trabaja en USD) | M |
| **Condición de pago** | Falta | A |
| **Descuentos por línea 1, 2 y 3** y **descuento del documento** | Un solo descuento por línea | A |
| **Referencia / documento y sufijo** del proveedor | Falta | M |
| **Fecha de recepción** (prevista) | ✔️ (`fechaEsperada`) | — |
| **Código y % de arancel por línea** | Falta (importaciones) | M |
| Transporte que trae la mercancía, centro de costo, sucursal | Falta | M |
| Cantidad de ítems y de unidades (totales) | Se calculan ✔️ | — |
| Usuario que modificó, fecha de última modificación | Auditoría general ✔️ | — |

> **✅ Avance 2026-11-22 (orden de compra):** condición de pago, transporte, centro de costo, referencia, moneda y valor de cambio, tres descuentos por línea y del documento, arancel por línea. **⬜ Pendiente:** usar el arancel en la liquidación de importaciones.

### 4.3 Documento del proveedor (`admdocpro`, `frmServicios` «Carga Documento»)

| Campo original | En el nuevo | Prio |
|---|---|---|
| **Tipo de documento** (factura, nota de crédito/débito, etc.) | Hay facturas y notas por separado ✔️ | — |
| **Número fiscal y número de control** | Control ✔️; número fiscal = el documento ✔️ | — |
| **Factura a la que aplica** (notas) | ✔️ | — |
| **Orden de compra** asociada | ✔️ | — |
| **Fechas separadas:** emisión, **recepción**, vencimiento, **libro de compras**, **retención** | Una fecha (la del documento) | A |
| **Desglose por alícuota:** exento, IVA reducida (RD), IVA general (GN), con sus bases | **Un solo IVA** (limitación ya anotada en 12.2) | A |
| **Retención** del documento (monto y fecha) | ✔️ módulo de retenciones | — |
| **Recibido por**, **planilla de importación**, transporte, **centro de costo** | Falta | M |
| Divisa y cambio | USD con tasa ✔️ | — |
| Condición y plazo | Solo días de crédito | M |
| Asiento contable manual al cargar (cuenta, auxiliar, débito/crédito, concepto) | La contabilidad es automática ✔️; falta elegir **cuentas por documento** (gastos, servicios) | A |
| Gastos de compra (`admdocprogasto`, `admgastoscompra`) | Falta | M |
| **Pagaré / documentos por pagar** (`frmPagare`) | Falta | M |
| Cruce de saldos (`frmCruceDeSaldo`) | Falta (entre cliente y proveedor, o notas) | M |

> **✅ Avance 2026-11-22 (documento del proveedor):** fechas de emisión, recepción y del libro, recibido por, planilla de importación, condición, transporte, centro de costo, cuenta contable de la base y **desglose por alícuota**. **⬜ Pendiente:** gastos de compra (`admdocprogasto`), pagaré y cruce de saldos.

## 5. Tesorería y contabilidad

### 5.1 Cobros (`admreciboingre`, `…_det`, `…_doc`, `frmRecibodeIngreso`)

| Campo original | En el nuevo | Prio |
|---|---|---|
| **Cobrador** | Falta | A |
| **Caja** | La cuenta de tesorería hace de caja ✔️ | — |
| **Varias formas de pago en un solo recibo** (forma, banco, cuenta, número, fecha, monto) | Un cobro = una forma de pago | A |
| **Cheque:** banco, cuenta, número, fecha | Solo «referencia» | A |
| **Anticipo / pago adelantado** y «monto restante» | Falta (el cobro exige factura) | A |
| **Fecha del recibo** | Siempre hoy | M |
| **Número de comprobante** y N.° de recibo de cobro | Número interno ✔️; falta el comprobante contable | M |
| **Divisa y cambio** | ✔️ (moneda + tasa del día) | — |
| **Débito/crédito libre** (asientos adicionales del recibo) | Automático ✔️ | — |
| Memo, documento asociado | Observaciones ✔️ | — |
| Retención de IVA del cliente (`frmRetIvaCli`): número fiscal, % retención, número de retención, **fecha recibido**, fecha de la retención, monto, estado | ✔️ salvo la **fecha de recepción** del comprobante | B |
| Retención de ISLR del cliente (`admcliislr`) | ✔️ (módulo de retenciones); falta el **concepto** (tarifas, 3.x) | M |

> **✅ Avance 2026-11-22 (cobros):** cobrador, varias formas de pago en un recibo (RC-), datos del cheque, comprobante y fecha del recibo. **⬜ Pendiente:** anticipos y saldo a favor.

### 5.2 Pagos (`admpagos`, `frmProcesoPago`, `frmProcesoPagoManual`)

| Campo original | En el nuevo | Prio |
|---|---|---|
| **Cheque:** número, monto, **chequera** (rangos y último cheque), **portador** | Falta | A |
| Banco y cuenta de salida | ✔️ cuenta de tesorería | — |
| **Número de comprobante** (voucher) y descripción | Falta el comprobante | M |
| Varios documentos en un pago | ✔️ | — |
| Pago manual con asientos adicionales | Falta | M |
| Estado del pago | ✔️ | — |

> **✅ Avance 2026-11-22 (pagos):** cheque con número tomado de la chequera activa, portador y comprobante de egreso. **⬜ Pendiente:** pago manual con asientos adicionales.

### 5.3 Bancos y cuentas bancarias (`admbancos`, `admcuentasbanc`, `admcuentascaja`)

| Campo original | En el nuevo | Prio |
|---|---|---|
| **Catálogo de bancos:** código, nombre, dirección, contacto, teléfonos 1–3, web, casillero postal, login/clave de banca en línea (no migrar claves) | El banco es un texto libre | M |
| **Titular**, **descripción**, **sucursal** | Falta | M |
| **Tipo de cuenta** (corriente, ahorro) | Solo caja/banco | M |
| Número, divisa, activa | ✔️ | — |
| **«Acepta depósitos» / «acepta pagos»** | Falta | M |
| **ITF/IDB:** porcentaje, desde, hasta | Falta (impuesto a transacciones financieras) | A |
| **Chequeras (3):** desde, hasta, cantidad, activa, **último cheque**, formato de cheque, «cheque automático» | Falta | A |
| Cuenta contable (mayor y auxiliar) | ✔️ cuenta contable (sin auxiliar) | — |
| **Conciliación bancaria** (`admmovban`, `adminstrumenban`) | Hay marca de conciliado por movimiento ✔️; falta el proceso con estado de cuenta | M |
| Cajas: trabaja, recibe/paga, **cuentas contables por concepto** (IVA débito/crédito, ventas, cuentas por cobrar, devoluciones contado/crédito, pronto pago) | ✔️ la configuración contable por concepto cubre esto | — |

> **✅ Avance 2026-11-22 (bancos y cuentas):** banco del catálogo, titular, sucursal, descripción, tipo de cuenta, acepta depósitos/pagos, ITF (porcentaje, desde, hasta; se carga a pagos y egresos), chequeras (rangos, último cheque, una activa) y formato de cheque. **⬜ Pendiente:** impresión del cheque y conciliación con estado de cuenta.

### 5.4 Contabilidad (`admcuentascontables`, `frmPlanCuentas`, `frmAuxiliarContable`, `frmComprobanteContable`, `parametrosContables`)

| Campo original | En el nuevo | Prio |
|---|---|---|
| Plan: grupo, subgrupo, cuenta, subcuenta, auxiliar, nombre | ✔️ plan jerárquico | — |
| **Siglas** de la cuenta | Falta | B |
| **Saldo inicial del ejercicio** | Falta (apertura de cuentas; se hace con un asiento) | A |
| «Imprime balance», «imprime diarios» | Falta | M |
| **Compañías que no procesan la cuenta** | Cambia: una base por cliente ✔️ | — |
| **Auxiliares contables** (código, nombre, «maneja documentos», monto de apertura) | **Falta** (subcuentas por cliente/proveedor/banco) | A |
| Comprobante: **fecha de carga y fecha del comprobante**, origen, referencia, **nº de documento**, **concepto por línea** | Fecha, descripción, referencia general; línea con descripción | M |
| **Cierre definitivo** del comprobante, **comprobante de cierre** | Falta (cierre del ejercicio, queda para el final) | A |
| Parámetros contables (`parametrosContables`, 25 etiquetas) | Configuración por concepto ✔️ (revisar paridad en 6) | M |
| Centro de costos (`admcentrocostos`) y estructura de costos | Falta | M |

> **✅ Avance 2026-11-22 (contabilidad):** siglas, «imprime balance» e «imprime diarios» por cuenta, **auxiliares contables**, referencia y documento por línea del asiento, asiento de **apertura** (saldos iniciales) y **libro diario**. **⬜ Pendiente:** cierre definitivo del comprobante, mayor y balance por auxiliar.

### 5.5 Reportes y fiscal

Ya cubiertos: libros de ventas y compras, resumen de IVA, retenciones, balance, resultados, antigüedad de saldos, ventas, inventario. Faltan los de la sección 12.8 de `PLAN-WEB.md` (ARC, comprobantes de retención en PDF, planillas, kardex, flujo de caja, comisiones) y los 20 Crystal Reports.

## 6. Catálogos que existen en el original y no en el nuevo

> **Avance (2026-11-21):** los catálogos marcados con ✅ ya existen en `Tablas base` (menú Configuración), con pruebas en `tests/tablas.test.ts`. **Aún no están enlazados** a clientes, proveedores, documentos ni cuentas bancarias: eso se hace al completar cada formulario (sección 7, pasos 3 a 6). Las cifras de «catálogos que faltan» de la sección 2 bajan de 25 a ~17.

| Catálogo (tabla) | Contenido | Prio |
|---|---|---|
| **Condición de pago** (`admcondpago`) | código, descripción, observación, estado, días de mora | **A** **✅ Hecho 2026-11-21: pantalla `Tablas base › Condiciones de pago`; 6 condiciones comunes sembradas** |
| **Vendedores** (`admvendedor`) | código, nombre, cédula, estado, grupo, cargo | **A** **✅ Hecho 2026-11-21: una persona puede ser vendedor, cobrador o ambos** |
| **Cobradores** (en trabajadores/vendedores) | ídem | A **✅ Hecho 2026-11-21: van en Vendedores y cobradores** |
| **Tipo de negocio** (`admtiponegocio`, `frmTipoNegocio`) | código, descripción, topes de descuento 1–3, días y % de «leyendas», observaciones | M **✅ Hecho 2026-11-21: con topes de descuento y leyendas** |
| **Transporte** (`admtransporte`) | código, descripción, proveedor, estado, memo | M **✅ Hecho 2026-11-21: con proveedor opcional** |
| **Bancos** (`admbancos`) | ver 5.3 | M **✅ Hecho 2026-11-21: catálogo; sin clave de banca en línea a propósito** |
| **Sucursales** (`admsucursal`) | código, descripción, dirección, teléfonos, RIF, correo, fechas, geografía | M |
| **Geografía** (país, región, estado, municipio, parroquia) | catálogos encadenados | M **✅ Hecho 2026-11-21: país, estado, municipio y parroquia; falta cargar los datos (importación)** |
| **Actividad económica / clasificación** (`admactividadeco`, `admclasiclient`, `admclasiprovee`) | para ISLR y reportes | M |
| **Tarifas de retención de ISLR** (`admtarifasreten`, `admconcepretenc`) | concepto, numeral, tipo de persona, residente, tarifa, acumulable | **A** **✅ Hecho 2026-11-21: catálogo de conceptos; falta cargar tarifas y usarlas en las retenciones** |
| **Marcas, colores, tallas, divisiones, grupos de productos** | catálogos de producto | M/B |
| **Series fiscales** (`admseriefiscal`) | serie, serial, IP, documento, caja, punto activo | A (con la impresora) |
| **Centros de costo, departamentos, cargos, trabajadores** | administración | M/B |
| Vehículos, conductores, bultos, seguimientos, solicitudes | logística y soporte | B |

## 7. Qué hacer con esto (propuesta de orden)

1. **Confirmar con quien opera el sistema** (30 min por área) qué campos se usan de verdad y cuáles son ruido. Hay varios «¿?» y campos específicos de una empresa (por ejemplo «C.P. FERLE»). Con el respaldo de producción se puede medir cuántas filas tienen cada campo lleno y descartar los vacíos.
2. **Catálogos base (prioridad A):** condición de pago, vendedores/cobradores, tarifas de ISLR, tipo de negocio, transporte, bancos, geografía. Son requisito de los maestros.
3. **Clientes y proveedores completos** (secciones 3.1 y 3.2), con las banderas fiscales (residente, contribuyente especial, tipo de persona), condiciones, límites de crédito y descuentos. Se pueden agrupar en pestañas del formulario.
4. **Productos:** listas de precio múltiples con vigencia y precio en dólares, luego promociones, marca y método de costo.
5. **Encabezados de documentos:** vendedor, condición de pago, descuentos globales, entrega, transporte; y en compras, condición, tres descuentos, fechas separadas y desglose por alícuota.
6. **Tesorería:** catálogo de bancos, cuentas con titular, ITF y chequeras; pagos con cheque; cobros mixtos y anticipos.
7. **Punto de venta, cierre de caja e impresora fiscal** (cubren el pago mixto, caja y serie fiscal de 4.1).
8. **Contabilidad:** auxiliares, saldos iniciales, banderas y concepto por línea; el cierre del ejercicio queda al final.

Cada paso lleva su migración y su prueba en la suite (`npm test`), y se actualiza este documento (columna «En el nuevo») al cerrarlo.

## 8. Cobertura que no se pudo comparar todavía

Importaciones (`frmOtrosDatos`, `frmFacturaImportacion`, `frmFacturaNacionalImportacion`, `frmOtrosGastos`: 28–31 etiquetas cada una), consultas gerenciales (`lbxConsultaGerencial`, 58–64 etiquetas), bultos, promociones, etiquetas de góndola, seguimientos, solicitudes y los módulos web antiguos (`web_*`, `usuarios_web`). Se inventariaron en `inventario.json` pero no se compararon porque el módulo nuevo equivalente aún no existe.
