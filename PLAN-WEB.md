# ERP Lebrun · Plan de versión web (`erp-suma`)

Estudio de factibilidad y plan por fases para reemplazar el ERP de escritorio **Lebrun** (WinForms, .NET Framework 4.8, MySQL 5.5)
por una aplicación web con el stack de **`wms-web`** (Next.js 16 + React 19 + TypeScript + Prisma 7 + Tailwind 4).

- Origen: `D:\lebrun_20220627\lebrun_20220627\lebrun` (ver su `CLAUDE.md`)
- Referencia de stack y patrones: `D:\Mis proyectos\wms\wms-web` (ver su `PLAN-MIGRACION.md`, `AGENTS.md`)
- Estado: **borrador para decisión**. Nada de esto está construido todavía.

## 0. Conclusión

**Es viable.** El stack de `wms-web` sirve casi tal cual: motor de listados, motor de catálogos/maestros, permisos por módulo,
sesión JWT, auditoría, importación/exportación Excel, PDF y multi-empresa ya están resueltos allí y se reutilizan.

Lo que hace distinto a este proyecto frente al WMS (y por tanto lo que manda el plan):

| Diferencia | Efecto |
|---|---|
| **Lógica en C#, no en stored procedures** (SQL inline por concatenación, sin capa de servicios) | Más fácil de leer que el WMS, pero cada pantalla mezcla UI + SQL + reglas: hay que extraer reglas pantalla por pantalla. |
| **Base MySQL 5.5** (664 tablas en 4 esquemas: `sisadm`, `sysconf`, `sysconta_NN`, `reporte`), sin PK/FK fiables, `latin1`, fechas `0000-00-00`, `GROUP BY` laxo | Decisión de base de datos es la primera y más cara (sección 2). |
| **Contabilidad + facturación fiscal venezolana** (SENIAT, impresora fiscal TFHKA, retenciones ISLR/IVA, ARC, tasa de cambio USD/VES/EUR) | Es el riesgo funcional mayor. Las reglas fiscales no se pueden «reinterpretar»; se portan con pruebas contra el sistema actual. |
| **Hardware fiscal** (OCX 32 bits `TMFISCAL`, `PNPDLL.dll`, MSComm) | El navegador no puede hablar con la impresora fiscal → **agente local** obligatorio para POS. |
| **6 empresas (`01`–`06`) con comportamiento ramificado por código** (`switch` sobre `Compania.Codigo`) | Se vuelve **configuración por empresa**, no ramas en el código. |
| **Reportes en Crystal Reports** (20 `.rpt`) | Se rehacen en PDF/Excel (pdfkit + write-excel-file). Son pocos. |

Tamaño aproximado del origen (sin carpetas `Copia de…`/`Malo_*`):

- ~135 formularios (≈ 63 000 líneas de UI) y ~100 clases de negocio (≈ 46 000 líneas), 20 reportes Crystal.
- Mayores áreas por líneas: **productos** (≈ 11 000 UI + 10 000 clase), **facturación** (≈ 6 000 UI + 12 500 clase), **contabilidad**
  (≈ 5 800 + 5 300), **complementos** (≈ 4 800 + 6 900), tesorería, importaciones, pedidos, prefactura, pagos, compras.
- Cifras a verificar en la fase 0 (sobre todo cuáles formularios están realmente en uso: solo 49 de 236 filas de `conf_menu` traen ruta).

## 1. Stack objetivo (heredado de `wms-web`)

| Tema | Decisión | Nota |
|---|---|---|
| Framework | Next.js 16 (App Router, `output: standalone`), React 19 | Leer `node_modules/next/dist/docs/` antes de codificar (AGENTS.md de wms-web: esta versión rompe convenciones conocidas). |
| Lenguaje | TypeScript estricto + Zod 4 | |
| UI | Tailwind 4, `lucide-react`, tema por tokens en `globals.css` | Reutilizar `components/listado`, `maestro`, `formulario-ficha`, `ui`. |
| ORM | Prisma 7, esquema partido `prisma/schema/NN_modulo.prisma` | Adaptador según decisión de BD (sección 2). |
| Sesión | JWT en cookie (`jose`), `proxy.ts` + `dal.ts`, 30 min inactividad | Igual que wms-web. |
| Contraseñas | scrypt, bloqueo tras 5 intentos | **Migrar los hashes/claves actuales** requiere revisar cómo guarda `UsuarioSistema` (sección 6, riesgo 5). |
| Permisos | `<modulo>.ver/.crear/.editar/.eliminar/.exportar`, validados en página **y** en cada acción de servidor | Reemplaza perfiles + `conf_menu`/`confmapamenu`. |
| Listados / catálogos | `Definicion` declarativa + `<Listado>`; motor de maestros | Cubre la mayoría de los ~40 formularios de consulta y maestros. |
| Excel / PDF | `write-excel-file`, `read-excel-file`, `pdfkit` | Reemplaza Excel COM Interop y Crystal Reports. |
| Código de barras | `bwip-js` | Ya en wms-web. |
| Despliegue | Docker (Node 22) + base gestionada | Igual que wms-web (`scripts/aws` / `scripts/azure`). |
| Hardware local | **Agente local** (impresora fiscal, cajón, lector serial) | Sección 5. |

## 2. Decisión previa: la base de datos

Es la decisión que más condiciona el costo. Hay tres caminos:

| Opción | Qué es | A favor | En contra |
|---|---|---|---|
| **A. PostgreSQL nueva (recomendada)** | Esquema nuevo, migración de datos desde MySQL, como en wms-web | Mismo stack y herramientas que wms-web; constraints reales (PK/FK/CHECK); mejor para contabilidad (transacciones, numeric); cero deuda de MySQL 5.5 | Más trabajo: mapeo de ~664 tablas (se migran solo las núcleo), convivencia desktop+web exige sincronizar o cortar por módulo |
| **B. MySQL 8.4 + Prisma (`adapter-mariadb`)** | Mantener MySQL, subirlo a 8.4 (ya hay un servidor de pruebas `mysql84_pruebas`, Parte C del proyecto actual) | Escritorio y web comparten la misma base desde el día 1; convivencia sencilla; migración de datos casi nula | Hereda el esquema sin claves ni tipos fiables; Prisma sobre esquema legado cuesta; hay que corregir ~22 `GROUP BY` y fechas cero igualmente |
| **C. Híbrida** | Web nueva sobre MySQL 8.4 **mientras** conviven; Postgres al apagar el escritorio | Entrega valor rápido, corte progresivo | Doble migración si se acaba pasando a Postgres |

> **DECISIÓN (2026-11-20): opción A, PostgreSQL nueva.** Mismo patrón que `wms-web` (Prisma 7 + `@prisma/adapter-pg`, una base por cliente más `erp_control`). Consecuencias: (1) la fase 12 incluye importación repetible MySQL → PostgreSQL (`scripts/db/importar-mysql/`) con conteos y
> sumas de control; (2) la convivencia con el escritorio se hace por corte por módulo/empresa, no compartiendo base; (3) el esquema se
> modela con PK/FK/CHECK reales y tipos correctos (`numeric`, `timestamptz`, `utf8`), solo para las tablas núcleo de cada módulo; (4) la opción
> B queda descartada salvo para consultas de solo lectura puntuales, si el cliente las pide antes del corte.

*Análisis original (se conserva como contexto):* empezar con **B para los módulos de convivencia** (lectura/consulta y reportes, donde el escritorio sigue siendo el que escribe)
y **A como destino final** si el cliente decide apagar el escritorio. Si la meta es *reemplazar* el escritorio, ir directo a **A** y cortar por módulo.
Esta decisión se toma en la fase 0 con el cliente; el resto del plan es válido para ambas, cambiando solo la fase de datos.

Cualquiera sea la opción, quedan obligatorios: respaldo de producción restaurado (ya existe: `FLebrun 20261013 0737.sql`, 664 tablas),
conector moderno (el `MySql.Data 6.3.7` no autentica en MySQL 8) y limpieza de `0000-00-00` y `GROUP BY`.

## 3. Servicio alquilado: una base de datos por cliente, un solo despliegue

> **DECISIÓN (2026-11-20):** `erp-suma` se **alquila como servicio** (SaaS). Un solo despliegue atiende a todos los clientes; cada cliente tiene
> **su propia base de datos**, sus propios roles y credenciales cifradas. No hay multiempresa dentro de una base. Patrón tomado de `wms-web`.

```
PostgreSQL
 ├─ erp_control            ← catálogo de clientes (lo administra el proveedor): estado, conexión cifrada, módulos activos, versión de esquema
 ├─ erp_cliente_acme       ← datos del cliente "acme"  (roles erp_cliente_acme_app / _mig)
 ├─ erp_cliente_beta       ← datos del cliente "beta"
 └─ …
```

- **Resolución del cliente:** subdominio (`acme.<DOMINIO_BASE>`; en local `acme.localhost:3000`) o `CLIENTE_POR_DEFECTO` solo en desarrollo; si no hay ninguno, el
  login pide el código de la empresa. El JWT lleva `clienteId`/`clienteSlug`; `proxy.ts` invalida la sesión si no coincide con el subdominio y `dal.ts`
  la valida contra la base del cliente en cada petición.
- **Acceso a datos:** todo pasa por `requerirSesion()` → `{ db, cliente, usuario }` (`src/lib/tenant.ts` es el único lugar que crea clientes Prisma; regla de lint).
  Cada cliente tiene su propio pool (caché LRU, máximo de conexiones por cliente) para no agotar `max_connections`.
- **Ciclo de vida** (`npm run …`): `cliente:crear -- <codigo> "Nombre" [correo]` (base, roles, migraciones, administrador con contraseña temporal),
  `db:migrar:todos` (un cliente que falla no frena a los demás), `cliente:listar`, `cliente:suspender -- <codigo> [--reactivar]` (impago; deja de operar en
  menos de 30 s), `cliente:contrasena`, `cliente:eliminar -- <codigo> --confirmar` (respaldo antes), `probar:aislamiento`.
- **Planes y módulos:** `cliente.modulos` (JSON en `erp_control`) apaga módulos por cliente (`{"contabilidad": false}`): no se ven ni con permiso. Base para planes de precio.
- **Seguridad:** el rol de la aplicación no tiene DDL ni acceso a `_prisma_migrations`; el rol de un cliente no puede conectarse a la base de otro
  (`probar:aislamiento` lo verifica); secretos solo en `.env`/gestor de secretos.
- **Las 6 empresas de Lebrun (`01`–`06`)** pasan a ser clientes independientes de la plataforma (una base cada una).
- **Panel del proveedor (`/plataforma`):** login propio (tabla `administrador_plataforma`, cookie y firma distintas, bloqueo por intentos), lista de clientes
  (estado, módulos, esquema al día), detalle con uso (usuarios, último ingreso), suspender/reactivar, módulos contratados e historial. Altas y bajas de bases
  quedan en la línea de comandos: la web nunca tiene la contraseña de administrador de PostgreSQL. `npm run plataforma:admin` crea administradores.
- **Pendiente para operar el servicio:** facturación del alquiler y planes, respaldos por cliente (`pg_dump`),
  PgBouncer o agrupar servidores al pasar de unas decenas de clientes, y límites de uso por plan.

## 4. Mapa de módulos

Prioridad según valor y riesgo. «Motor» = se cubre mayormente con el motor de listados/maestros de wms-web.

| Módulo web | Origen (formularios / clases) | Esfuerzo | Notas |
|---|---|---|---|
| **Seguridad y empresas** | `frmLogin`, `UsuarioSistema`, `Compania`, perfiles, menú dinámico | M | Menú sale de BD hoy; en web: permisos por módulo + menú por áreas. |
| **Maestros** (clientes, proveedores, vendedores, bancos, bultos, transporte, condiciones de pago) | `clientes`, `clientesMayor`, `vendedores`, `bancos`, `bultos`, `transporte` | M | Motor de maestros. Incluye campos nuevos de los scripts `condicion_pago`, `clientes_contacto`. |
| **Productos e inventario** | `productos` (31 forms), `clases/producto` (≈ 10 000 líneas) | **XL** | El área más grande: fichas, precios, costos en USD, existencias, movimientos, listas, estructura de costos (`historicoestructuracostos`). Dividir por casos de uso. |
| **Tasa de cambio y monedas** | `admhistodivi`, scripts `tasa_cambio` (8 decimales) | S | Se hace temprano: lo usan costos, facturas y contabilidad. |
| **Compras e importaciones** | `compras`, `importaciones`, `clases/importaciones` | L | Compras sugeridas (sin formulario hoy), liquidación de importaciones. |
| **Pedidos, cotizaciones, prefactura** | `pedidos`, `cotizacion`, `prefactura` | L | Flujo comercial previo a la factura; reservas. |
| **Facturación y POS** | `facturacion` (14 forms), `clases/facturacion` (≈ 12 500 líneas), `facturacionMisionVivienda` | **XL / crítico** | Fiscal (SENIAT/TFHKA). Dos fases: facturación administrativa (web pura) y POS con impresora fiscal (necesita agente local). |
| **Cuentas por cobrar / por pagar** | `cxpagar`, `pagos`, `clases/pagos`, estado de cuentas | L | Pagos, abonos, retenciones. |
| **Tesorería y bancos** | `tesoreria`, `bancos` | L | Conciliación, movimientos de caja (`admmovcaja`). |
| **Contabilidad** | `contabilidad` (11 forms), `clases/contabilidad`, `parametrosContables`, `sysconta_NN` | **XL / crítico** | Asientos, plan de cuentas, cierres, libros. Un esquema por empresa. Exige pruebas de cuadre contra el sistema actual. |
| **Retenciones y ARC** | `clases/retenciones`, `reporteARC`, `datasetARC` | M | IVA/ISLR, comprobantes ARC. |
| **Gerencial / indicadores** | `gerencial`, `clases/gerencial` | M | Tableros y consultas de gestión. |
| **Reportes** | 20 `.rpt` Crystal (+ DataSets tipados) | M | Rehacer en PDF/Excel; priorizar los fiscales (libro de ventas/compras, ARC, pagaré, facturas). |
| **Complementos / administración** | `complementos`, `administracion`, `EnviarCorreo`, utilidades | M | Mezcla de utilidades; clasificar en fase 0. |

Esfuerzo: S ≈ 1–2 sem · M ≈ 3–4 · L ≈ 5–7 · XL ≈ 8+ (una persona).

Todo lo que cuelga de `Copia de …`, `Malo_Julio2018`, `NewFolder1` y duplicados no referenciados por `lebrun.csproj` **queda fuera** (regla ya fijada en el `CLAUDE.md` del origen).

## 5. Hardware e integraciones

- **Impresora fiscal TFHKA** (`TMFISCAL.ocx`, `PNPDLL.dll`): servicio local en cada caja (Node o .NET) que expone una API autenticada
  en `localhost`; la web la llama desde el navegador (HTTPS local o WebSocket). Es el mayor riesgo técnico del POS: la `PNPDLL` **no se
  ha probado con impresora conectada** según el `CLAUDE.md` del origen → prueba de concepto en la fase 1.
- **Lector de códigos**: casi siempre emula teclado → hook `useLectorCodigo`; cámara con `BarcodeDetector` como alternativa.
- **Excel**: de COM Interop a `read/write-excel-file` (importaciones masivas, exportes).
- **Correo**: SMTP desde servidor (`EnviarCorreo`).
- **Crystal Reports**: se eliminan; PDF con `pdfkit`.
- **Web existente**: las tablas `utf8mb4` «del módulo web» indican que ya hay algo web; revisar en fase 0 qué es y si se integra.

## 6. Riesgos principales

1. **Reglas fiscales y contables** (SENIAT, retenciones, cierres) → pruebas comparativas contra el sistema actual con datos reales anonimizados; contador del cliente como validador.
2. **Formularios gigantes con SQL inline** (hasta miles de líneas) → extraer reglas a `src/lib/<modulo>/` con pruebas *antes* de portar la pantalla.
3. **Sin PK/FK ni tipos fiables** en el esquema → definir claves y restricciones al modelar; reportes de huérfanos antes de importar.
4. **Convivencia desktop + web** (misma base o dos bases) → decidir en la fase 0; si comparten MySQL, nada de migraciones destructivas hasta apagar el escritorio.
5. **Contraseñas y usuarios legados**: verificar cómo se almacenan hoy; si están en claro o con hash débil, forzar cambio de clave en el primer ingreso (no migrar el secreto).
6. **Comportamiento por empresa** disperso en `switch` → inventariarlo todo antes de modelar la configuración.
7. **Alcance inflado** por duplicados y código muerto → fase 0 define el alcance por uso real (log de uso, menú activo, entrevistas).
8. **Credenciales de producción** en `App.config`/respaldos del repositorio → rotarlas y mantener secretos solo en variables de entorno / gestor de secretos.

## 7. Fases

| Fase | Contenido | Resultado verificable |
|---|---|---|
| **0. Descubrimiento** (2–3 sem) | Inventario de pantallas **en uso**; mapa pantalla → tablas → reglas; decisión de BD (sección 2); ramas por empresa; qué es el «módulo web» existente; hardware real; reportes fiscales obligatorios | `docs/mapa-pantallas.md`, `docs/mapa-tablas.md`, `docs/empresas-config.md`, decisión de BD firmada |
| **1. Base técnica y prueba de hardware** (3 sem) | Repo Next 16 + Prisma 7, CI, lint, Dockerfile, `/api/salud`; aprovisionamiento por cliente; **PoC del agente local con la impresora fiscal** | Dos clientes de prueba aislados; ticket fiscal de prueba impreso desde el navegador |
| **2. Seguridad y empresas** (2 sem) | Login, selección de empresa, perfiles/permisos por módulo, auditoría, menú por áreas | Login + permisos + `auditoria_cambio` |
| **3. Motores y tema** (2 sem) | Reutilizar/portar `Listado`, maestros, ficha, Excel/PDF desde wms-web (idealmente como paquete compartido o copia versionada) | Un maestro completo de punta a punta |
| **4. Maestros y monedas** (3–4 sem) | Clientes, proveedores, vendedores, bancos, condiciones de pago, tasa de cambio | Todos los maestros cubiertos con permisos y auditoría |
| **5. Productos e inventario** (6–8 sem) | Fichas, precios, costos USD, existencias, movimientos, listas | Existencias y costos que cuadran con el legado |
| **6. Comercial** (6–8 sem) | Cotizaciones, pedidos, prefactura, reservas | Casos de `comparar-resultados` iguales |
| **7. Facturación** (6–8 sem) | Factura administrativa web; luego POS con agente local y fiscal | Factura fiscal real emitida y conciliada |
| **8. CxC / CxP / Tesorería / Bancos** (6–8 sem) | Cobros, pagos, retenciones, conciliación, caja | Estado de cuentas igual al legado |
| **9. Compras e importaciones** (4–6 sem) | Órdenes, recepción, liquidación, compras sugeridas | Importación completa de un caso real |
| **10. Contabilidad** (8–10 sem) | Plan de cuentas, asientos, cierres, libros, parámetros contables por empresa | Balance de comprobación idéntico al legado en un período cerrado |
| **11. Reportes e indicadores** (4 sem) | Reportes Crystal → PDF/Excel; gerencial; ARC; libros fiscales | Cada `.rpt` con equivalente aprobado |
| **12. Datos, paralelo y corte** (4–6 sem) | Importación completa repetible, operación en paralelo por empresa, capacitación, rollback | Go-live por empresa (piloto: la de menor volumen) |

Total orientativo: **≈ 14–20 meses para una persona; ≈ 8–11 con dos o tres** (fases 4–10 se reparten en paralelo tras la fase 3).

**Prioridad si hay que recortar:** 0 → 1 → 2 → 3 → 4 → 5 → 7 → 6 → 8 → 11 (fiscales) → 10 → 9.
**Entrega temprana sugerida:** consulta web de existencias, clientes, estado de cuentas y reportes gerenciales (solo lectura sobre MySQL 8.4)
en las fases 2–5, para dar valor mientras se construye lo transaccional.

## 8. Estrategia de convivencia y corte

- No hay *big bang*: corte **por empresa** y **por módulo**. Piloto con la empresa de menor volumen.
- Mientras convivan, el escritorio sigue siendo la fuente de escritura de los módulos aún no migrados; la web nace en solo lectura en ellos.
- Cada módulo se da por terminado cuando: pantalla equivalente con mismos permisos y validaciones, reglas con pruebas, prueba comparativa
  contra el legado, exportes funcionando, auditoría registrada y aceptación de un usuario del área.
- Plan de rollback por empresa documentado antes de cada corte.

## 9. Estructura sugerida del repositorio

```
erp-suma/
  PLAN-WEB.md
  prisma/schema/   00_config 10_seguridad 20_empresas 30_maestros 40_productos 50_comercial
                   60_facturacion 70_cxc_cxp 80_tesoreria 90_contabilidad
  scripts/db/      bootstrap.ts  importar-mysql/  generar-checks.ts
  scripts/legado/  extraer-esquema.ts  comparar-resultados.ts
  agente-local/    servicio de impresora fiscal / cajón / lector serial
  src/app/(app)/   un directorio por módulo
  src/lib/         dal, sesion, empresa, listados, maestros, pdf, fiscal, moneda
  docs/            mapa-pantallas.md  mapa-tablas.md  empresas-config.md
```

## 10. Próximos pasos inmediatos

1. ~~Decidir la base de datos~~ → **PostgreSQL nueva** (sección 2). Falta aprobar el resto del plan.
2. Arrancar la fase 0: inventario de pantallas en uso y mapa de tablas núcleo sobre el respaldo ya restaurado en `mysql84_pruebas`.
3. Hacer la **prueba de concepto de impresora fiscal** antes de comprometer fechas del POS.
4. Decidir cómo compartir código con `wms-web` (paquete interno vs copia versionada de listados/maestros/ficha).

## 11. Estado de avance

- **2026-11-20 · Base técnica inicial hecha.** Proyecto `erp-suma` creado con el stack de `wms-web` (Next 16, React 19, Prisma 7 + `adapter-pg`, Tailwind 4),
  mismo diseño que la referencia TEYMA en **azul** (tokens en `src/app/globals.css`), menú lateral por áreas, inicio con tarjetas por módulo,
  login con sesión JWT, permisos por módulo/acción y primer módulo real: **Clientes** (listado, búsqueda, alta, edición, baja).
- Base local `erp_suma` en el PostgreSQL 14 (roles `suma_migrador` y `suma_app`). `npm run local:preparar`, `npx prisma migrate dev`,
  `npm run usuario:crear -- correo "Nombre" contraseña`. Credenciales locales en `USUARIOS-DE-PRUEBA.md` (no versionado).
- Pendiente de esta base: auditoría de cambios, pantalla de usuarios y perfiles, motor de listados/maestros reutilizable.
- **2026-11-20 · Usuarios y perfiles** (`/seguridad`): usuarios, perfiles y matriz de permisos por módulo, con protección del último administrador.
- **2026-11-20 · Servicio alquilado (SaaS):** `erp_control` + una base por cliente, resolución por subdominio, sesión con cliente, cambio obligatorio de la
  contraseña temporal, módulos por cliente y scripts de ciclo de vida (sección 3). Aislamiento verificado con `npm run probar:aislamiento`.
  El cliente de desarrollo es `demo` (`CLIENTE_POR_DEFECTO=demo`). La base `erp_suma` anterior (solo datos de prueba) se eliminó.
- **2026-11-20 · Panel del proveedor** (`/plataforma`): ver sección 3. Probado: login, lista, detalle y apagado de módulos. Suspender/reactivar sin probar de punta a punta.
- **2026-11-20 · Auditoría de cambios** (`/auditoria`): tabla `auditoria_cambio` por cliente, helper `registrarCambio()` (`src/lib/auditoria.ts`) usado en Clientes y Seguridad (alta, cambio con solo los campos modificados, baja; las contraseñas nunca se guardan), pestañas Cambios e Ingresos con filtros y paginación. **Regla para todo módulo nuevo:** cada acción de servidor que escriba debe llamar a `registrarCambio`.
- **2026-11-20 · Motor de listados y maestros** (portado de `wms-web`): `Listado` (búsqueda, filtros, orden, columnas elegibles, paginación), ficha de alta/edición dirigida por campos
  (`lib/formularios.ts`), validación en servidor, auditoría automática y una sola ruta `[modulo]/[[...ruta]]`. **Clientes** pasó al motor y se agregó **Proveedores**.

### Cómo agregar un maestro (receta)
1. Modelo en `prisma/schema/NN_*.prisma` y migración (`prisma migrate diff … --script`; luego `npm run db:migrar:todos`).
2. Declarar el maestro en `src/lib/maestros/<archivo>.ts` (tabla, campos, columnas, búsqueda, filtros, `preparar`/`validar`, mensajes) — ver `terceros.ts`.
3. Registrarlo en `src/lib/maestros/registro.ts` (una sección por pestaña del módulo).
4. El módulo y su ítem de menú ya existen en `src/lib/modulos.ts` y `src/lib/menu.ts`. Listado, ficha, alta, edición, baja, permisos y auditoría salen del motor.
Lo que no cabe en el motor (documentos con líneas, flujos) se escribe como pantalla propia, con `registrarCambio()` en cada acción de servidor.
- **2026-11-20 · Productos (fase A: catálogo)** sobre el motor de maestros. `/productos`: **Productos** (código inmutable, categoría/subcategoría validada, IVA, arancel,
  costos y precios en USD, existencias mín./máx., comisiones, medidas), **Presentaciones y precios** (unidad de medida, cantidad, precio de compra/venta, principal) y
  **Proveedores por producto**. `/catalogos`: categorías, subcategorías, alícuotas de IVA, aranceles y unidades de medida. Cada cliente nuevo nace con IVA General 16 %,
  Reducida 8 %, Exento y unidades comunes (`scripts/lib/catalogos-base.ts`); `npm run cliente:demo -- <codigo>` carga productos de ejemplo.
  Equivalencias: `adminv`→`producto`, `adminvmed`→`producto_presentacion`, `adminvparam`→`producto_proveedor`, `admgrupo/admsubgrupo`→`categoria/subcategoria`, `admiva`→`alicuota_iva`, `admarancel`→`arancel`.
  **Pendiente de Productos:** cambio masivo de precios (`frmCambioPrecio`), promociones (`frmPromociones`), listas de precios, etiquetas/código de barras (`Etiqueta*`),
  consulta de artículos con existencias, importación masiva desde Excel y carga inicial desde el MySQL de Lebrun (fase 12). Las existencias y movimientos son del módulo Existencias.
  Regla de presentación principal única por producto: sin validar todavía.
- **2026-11-20 · Tasa de cambio** (`/tasas`, grupo Finanzas): monedas (VES base, USD, EUR sembradas en cada cliente nuevo) e historial de tasas con **8 decimales** (`tasa_cambio`, equivale a `admhistodivi`).
  Tarjetas con la tasa vigente de cada divisa y aviso si no es la de hoy; carga manual con validación (> 0, máximo 8 decimales, no posterior a mañana). Regla heredada de Lebrun: rige la
  última tasa hasta la fecha pedida (si el día no tiene, la anterior) y, con varias el mismo día, la última cargada. Helper `src/lib/tasas.ts`: `tasaVigente(db, "USD", fecha)`, `aBolivares`, `aDivisa`
  (la tasa nunca se redondea; solo los montos finales en bolívares, a 2 decimales). El formato de números y fechas del sistema pasó a Venezuela (`es-VE`, hora de Caracas, hasta 8 decimales).
  **Pendiente:** carga automática desde el BCV (tarea programada por cliente), tasas del euro/otras con su propia fuente, y usar la tasa en Productos (precio en bolívares) y Facturación (tasa del día en cada factura).
- **2026-11-20 · Existencias** (`/existencias`): **Existencias** (saldo por almacén y producto, valor a costo promedio, estado Disponible/Bajo mínimo/Sin existencia, tarjetas de resumen), **Movimientos** (kardex con filtros; alta de
  entrada, salida, ajuste sobrante/faltante y traslado entre almacenes) y **Almacenes**. Cada cliente nuevo nace con el almacén `PRINC`.
  **Reglas (en `src/lib/inventario/movimientos.ts`, único lugar que toca `existencia`):** cada movimiento y su cambio de saldo van en una sola transacción; el saldo nunca es negativo (descuento atómico + `CHECK` en la base; dos salidas
  simultáneas no pueden pasarse del saldo); el kardex no se edita ni se borra (un error se corrige con otro movimiento); los ajustes exigen motivo; un traslado son dos líneas ligadas por `grupo`, y si falla una se revierten ambas;
  una entrada con costo actualiza último costo y **costo promedio ponderado** (con el saldo de todos los almacenes). Verificado con pruebas de transacción, concurrencia y costo promedio (sin script permanente todavía).
  Compras, Facturación y Pedidos deben mover inventario **solo** con `registrarMovimiento()`/`trasladar()`. Motor de maestros ampliado: `sinEdicion`, `sinEliminar`, `crear` (alta personalizada), `encabezado` y búsqueda por relación (`producto.descripcion`).
  **Pendiente:** reservas (pedidos/prefacturas), lotes y vencimientos si el cliente los usa, conteo físico con conciliación, costo por lote, reporte de kardex por producto/fecha, exportar a Excel, y la carga inicial desde `adminv2.existencia`.
- **2026-11-21 · Cotizaciones:** modelo `cotizacion`/`cotizacion_linea` (migración `…110000_cotizaciones`, con `CHECK`; el pedido gana `cotizacion_id`), servicio `src/lib/cotizaciones/servicio.ts` y pantallas `/cotizaciones` (lista, nueva, editar, detalle). Estados: borrador → emitida → aceptada / rechazada / anulada; «vencida» se calcula por la fecha de vigencia (días de validez, 1–365). Emitir congela la tasa del dólar (muestra el total en Bs.). **Convertir en pedido** crea un pedido en borrador con los mismos precios (revalida producto activo y precio máximo) y marca la cotización aceptada en la misma transacción; el cambio de estado condicionado impide convertirla dos veces y una vencida se rechaza sin dejar nada a medias. No reserva inventario (la reserva ocurre al confirmar el pedido).
  Verificado por script (vigencia 0 rechazada, borrador no se convierte, emitida no se edita, dos conversiones simultáneas → un solo pedido, vencida rechazada y sigue emitida, rechazo exige motivo) y en navegador (500 × 0,09 + IVA 16 % = 52,20 USD = 1.955,24 Bs.; convertir lleva al pedido en borrador con el mismo total).
  **Pendiente:** versiones/revisiones de una cotización, enviar por correo o PDF para el cliente, descuentos por perfil o lista de precios por cliente, convertir directo en factura, seguimiento comercial (vendedor, probabilidad) y reporte de cotizaciones vs. ventas.
- **2026-11-21 · Tesorería y bancos:** modelo `cuenta_tesoreria` (caja o banco, una moneda USD/VES, saldo, sobregiro opcional) y `movimiento_tesoreria` (libro con signo, `saldo_despues`, conciliado) — migración `…100000_tesoreria` con `CHECK` (tipo y moneda válidos, sin saldo negativo salvo sobregiro, signo coherente con el tipo). **`src/lib/tesoreria/movimientos.ts` es el ÚNICO escritor del saldo** (descuento atómico: dos egresos simultáneos no pueden sobregirar). Cobros y pagos ahora exigen una cuenta de la misma moneda en que se pagó y generan su movimiento en la misma transacción; anular el cobro/pago genera el contramovimiento (si el dinero ya se gastó y no alcanza, la anulación se rechaza completa).
  Pantallas: `/tesoreria` (cuentas y totales por moneda), alta/edición de cuenta (moneda y saldo no se editan; el saldo inicial entra como movimiento), libro de la cuenta con conciliación por casilla y filtro «sin conciliar», ingreso/egreso manual con concepto obligatorio, y transferencia entre cuentas de la misma moneda (dos líneas en una transacción). Los clientes nuevos nacen con `CAJA-USD` y `CAJA-VES`.
  Verificado por script (egreso sobre el saldo rechazado, dos egresos de 70 sobre 100 → uno, transferencia que falla revierte ambas cuentas, cobro en moneda distinta a la cuenta rechazado, anulación sin fondos rechazada, saldo = suma del libro) y en navegador (cuenta con saldo inicial 10.000, egreso de 20.000 rechazado, egreso 150,50 → 9.849,50, conciliar baja los pendientes de 2 a 1).
  **Pendiente:** cambio de divisas entre cuentas de distinta moneda, importar el estado de cuenta del banco y conciliar automáticamente, cheques (emitidos/en tránsito), anticipos de clientes y a proveedores, arqueo y cierre de caja, comisiones e ITF automáticos, cobros/pagos de cuentas anteriores a Tesorería (sin cuenta) y reportes.
- **2026-11-21 · Cuentas por pagar:** modelo `factura_compra`, `pago_proveedor` y `pago_aplicacion` (migración `…090000_cxp`, con `CHECK`: total = base + IVA, saldo entre 0 y el total, montos positivos, moneda coherente con tasa) y servicio `src/lib/cxp/servicio.ts`. Pantallas `/cxp` (saldos por proveedor con antigüedad), `/cxp/proveedor/[id]` (estado de cuenta), `/cxp/facturas` (registrar y anular facturas del proveedor, con orden de compra opcional como referencia), `/cxp/pagos` (pagos aplicados a facturas, en USD o Bs. con la tasa del día, con anulación).
  Es el espejo de Cuentas por cobrar y comparte tramos y formas de pago. La factura del proveedor se registra por montos (el inventario entra por la recepción de Compras); el mismo proveedor no puede repetir un número de factura; no se anula una factura con pagos vigentes.
  Verificado por script (duplicada y fecha futura rechazadas, exceso rechazado, dos pagos simultáneos de 50 sobre 80 → solo uno, anulaciones) y en navegador (factura de 1.000 + 16 % a 30 días vence 21/12; pago de 400 USD en Bs. = 14.982,72; saldo por pagar 760).
  **Pendiente:** retenciones de IVA/ISLR (comprobantes), facturas del proveedor en bolívares, anticipos a proveedores, notas de débito/crédito del proveedor, programación de pagos por vencimiento, cuentas bancarias y caja (Tesorería), y cargar los gastos de importación.
- **2026-11-21 · Cuentas por cobrar:** la factura ahora lleva `dias_credito`, `fecha_vencimiento` y `saldo` (USD); modelo `cobro`/`cobro_aplicacion` (migración `…080000_cxc`, con `CHECK`: saldo entre 0 y el total, montos positivos, moneda USD/VES coherente con tasa), servicio `src/lib/cxc/servicio.ts` y pantallas `/cxc` (saldos por cliente con antigüedad por tramos), `/cxc/cliente/[id]` (estado de cuenta), `/cxc/cobros` (lista), `/cxc/cobros/nuevo?cliente=ID` y detalle con anular.
  Un cobro reparte lo recibido entre las facturas abiertas del cliente; todo se lleva en USD: si paga en Bs., se guarda el monto en Bs. (USD × tasa de hoy) y la tasa. El saldo baja con un `UPDATE` atómico condicionado (`saldo >= monto`). Anular un cobro restituye lo aplicado; una factura con cobros vigentes no se anula hasta anular esos cobros.
  Verificado por script (cliente ajeno y exceso rechazados; dos cobros simultáneos de 60 sobre 80 → solo uno; anulaciones; factura anulada no se cobra) y en navegador (factura a 15 días vence 06/12; cobro de 100 USD en Bs. = 3.745,68; anular devuelve el saldo a 208,80).
  **Pendiente:** anticipos y pagos sin factura (con Tesorería), abonos en varias monedas en un mismo recibo, notas de crédito/débito, retenciones, intereses de mora, recibo imprimible/PDF, conciliación con bancos y cuenta de caja, y cobranza (recordatorios).
- **2026-11-21 · Facturación (factura administrativa):** modelo `factura`/`factura_linea` (migración `…070000_facturacion`, con `CHECK`), servicio `src/lib/facturacion/servicio.ts` y pantallas `/facturacion` (lista, nueva directa o `?pedido=ID`, detalle con anular y motivo). Botón «Facturar» en el pedido confirmado.
  Emitir = una transacción: crea la factura (número FAC-xxxxxx, tasa USD congelada, total Bs.), guarda el costo promedio de cada línea (margen futuro) y descuenta el almacén elegido vía `aplicarMovimiento` (SALIDA). Factura directa respeta lo reservado por pedidos confirmados; la de un pedido pasa el pedido a FACTURADO y consume su reserva. Anular exige motivo, devuelve la mercancía como ajuste sobrante (no cambia el costo promedio) y reabre el pedido (CONFIRMADO). Una factura emitida no se edita.
  Verificado por script (reserva respetada, dos facturaciones simultáneas del mismo pedido → una sola, anulaciones, cuadre de Bs.) y en navegador (50 > 40 disponibles rechazado; 5 × 7,50 + IVA 16 % = 43,50 USD = 1.629,37 Bs.; anulación y kardex 40→35→40).
  **Pendiente:** número fiscal e integración con la impresora/máquina fiscal (campo `numero_fiscal` listo), cobro y condiciones de pago (CxC), notas de crédito/débito, retenciones de IVA/ISLR, POS, descuentos por perfil, factura en PDF/Excel y libro de ventas.
- **2026-11-21 · Pedidos de venta:** modelo `pedido_venta`/`pedido_venta_linea` (migración `…060000_pedidos`, con `CHECK`), servicio `src/lib/pedidos/servicio.ts` y pantallas `/pedidos` (lista, nuevo, editar, detalle con confirmar y anular).
  **Reserva sin columna:** lo reservado de un producto es la suma de sus líneas en pedidos CONFIRMADOS; disponible = existencia total − reservado. Confirmar toma un candado por producto (`pg_advisory_xact_lock`), valida disponibilidad, exige tasa USD cargada y la congela en el pedido (muestra Bs.). Respeta `precioMaximoPublico`.
  Verificado: dos confirmaciones simultáneas de 3.000 sobre 5.000 → solo una pasa; anular libera la reserva; no se edita ni anula dos veces; en pantalla 4.000 × 0,09 + IVA 16 % = 417,60 USD = 15.641,96 Bs. a 37,45678912.
  **Pendiente:** reserva por almacén, pasar el pedido a FACTURADO (lo hará Facturación), cotizaciones, lista de precios por cliente/condición de pago, y descuentos por perfil.
- **2026-11-21 · Compras con pantallas:** `/compras` (lista con filtro por número/proveedor/estado), `/compras/nueva` y `/compras/[id]/editar` (líneas con buscador de productos y totales en vivo; el servidor recalcula), `/compras/[id]` (detalle, emitir, anular, registrar recepción parcial o total, historial de recepciones). Permisos: crear/editar (emitir y recibir) /eliminar (anular).
  Verificado en navegador: crear, emitir, sobre-recepción rechazada, recepción parcial 40 + 60 → orden «Recibida» y kardex 36→76→136. **Pendiente:** probar editar/anular en pantalla y concurrencia de recepciones; los números de recepción pueden saltar (la secuencia no se revierte si la recepción falla).
- **2026-11-20 · Compras (modelo y servicio):** hecho el modelo (`orden_compra`, `orden_compra_linea`, `recepcion`, `recepcion_linea`, con `CHECK`), los cálculos (`src/lib/compras/calculos.ts`) y el servicio transaccional
  (`src/lib/compras/servicio.ts`: guardar orden, emitir, anular, recibir). La recepción entra al inventario con el costo neto de la orden vía `aplicarMovimiento()`. Migración aplicada a los clientes.
  **Falta:** pantallas (`/compras` lista, nueva/editar con líneas y buscador de productos, detalle con emitir/anular/recibir), permisos por acción, pruebas del servicio (recepción parcial, sobre-recepción, concurrencia) y verificación en navegador. Órdenes solo en USD por ahora.
