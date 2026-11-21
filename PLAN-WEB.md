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

> Cada entrada trae su lista «Pendiente». La lista **consolidada y priorizada** está en la sección 12, al final de este archivo.

- **2026-11-20 · Base técnica inicial hecha.** Proyecto `erp-suma` creado con el stack de `wms-web` (Next 16, React 19, Prisma 7 + `adapter-pg`, Tailwind 4),
  mismo diseño que la referencia TEYMA en **azul** (tokens en `src/app/globals.css`), menú lateral por áreas, inicio con tarjetas por módulo,
  login con sesión JWT, permisos por módulo/acción y primer módulo real: **Clientes** (listado, búsqueda, alta, edición, baja).
- Base local `erp_suma` en el PostgreSQL 14 (roles `suma_migrador` y `suma_app`). `npm run local:preparar`, `npx prisma migrate dev`,
  `npm run usuario:crear -- correo "Nombre" contraseña`. Credenciales locales en `USUARIOS-DE-PRUEBA.md` (no versionado).
- Pendiente de esta base (todo hecho más abajo): auditoría de cambios, pantalla de usuarios y perfiles, motor de listados/maestros reutilizable.
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
  **Pendiente:** reserva por almacén (la reserva global ya existe en Pedidos), lotes y vencimientos si el cliente los usa, conteo físico con conciliación, costo por lote, reporte de kardex por producto/fecha, exportar a Excel, y la carga inicial desde `adminv2.existencia`.
- **2026-11-21 · Retenciones de IVA e ISLR:** migración `…160000_retenciones`: tabla `retencion` y `proveedor.retencion_iva_pct` (el % que se le retiene, 0/75/100, editable en la ficha del proveedor y propuesto al aplicar la retención). **Dos sentidos:** *practicada* (nosotros, agente de retención, se la hacemos a un proveedor sobre una factura de compra; lo retenido se debe enterar al fisco) y *sufrida* (un cliente nos la hace sobre una factura de venta; es crédito a nuestro favor). Servicio `src/lib/retenciones/servicio.ts`. **Una retención es una parte de la factura «pagada» sin dinero:** baja su saldo con un UPDATE atómico (`saldo ≥ monto`), con la **tasa de la factura original**, así los bolívares de la CxC/CxP y de la retención cuadran. IVA = % sobre el IVA de la factura; ISLR = % sobre la base imponible (o una menor) con concepto. Una sola retención vigente por impuesto y factura (índice único parcial); comprobantes únicos (el nuestro: IVA `AAAAMM` + 8 dígitos, ISLR `RI-…`, autogenerado; el del cliente lo escribe quien registra, único por cliente e impuesto). Una factura con retenciones vigentes no se anula; anular una retención devuelve el saldo y genera el asiento inverso.
  Contabilidad automática: practicada = Debe CxP / Haber *Retenciones de IVA o ISLR por pagar*; sufrida = Debe *IVA o ISLR retenido por clientes* / Haber CxC (cuatro conceptos nuevos con cuentas propuestas 2.1.03, 2.1.04, 1.1.05 y 1.1.06). **Libros fiscales:** el libro de ventas y el de compras llevan ahora las columnas *Nº comprobante de retención de IVA* e *IVA retenido Bs.* en la fila de la factura, y el **resumen de IVA** muestra lo retenido por clientes, la cuota después de retenciones soportadas y lo retenido a proveedores por enterar. Reporte nuevo **Retenciones de IVA e ISLR** (practicadas o sufridas, por período, con totales en USD y Bs.).
  Pantallas: `/cxp/retenciones` y `/cxc/retenciones` (lista, detalle imprimible con anular), botón «Aplicar retención» en la factura del proveedor y «Retención sufrida» en la factura de venta, y las retenciones listadas dentro de cada factura.
  Verificado por script con contabilidad automática: porcentaje fuera de rango, segunda retención del mismo impuesto, base ISLR mayor a la factura, comprobante vacío y anular facturas con retenciones se rechazan; IVA 75 % sobre 32 = 24 USD y ISLR 2 % sobre 200 = 4 USD bajan el saldo de la factura de compra, y las sufridas el de la venta; el balance cuadra y las cuentas 2.1.03/2.1.04/1.1.05/1.1.06 reflejan 898,96 / 149,83 / 449,48 / 112,37 Bs.; los libros, el resumen y el reporte coinciden; al anular todo, saldos y cuentas vuelven a cero. En pantalla: 75 % propuesto desde el proveedor, comprobante de 14 dígitos autogenerado, y una retención sufrida de 12,00 USD deja el saldo de la factura en 104,00. Datos de prueba borrados.
  **Nota de redondeo:** al repartir una factura entre cobros/pagos/retenciones cada parte se redondea a centavos, por lo que la CxC/CxP contable puede diferir 0,01 Bs. de `saldo × tasa`. **Pendiente:** **enterar las retenciones practicadas al fisco** (pago con asiento y marca de «enterada»), datos de la empresa (RIF, razón social y dirección) para que el comprobante lleve el encabezado de agente de retención, comprobante en PDF, retenciones sobre pagos parciales o por varias facturas a la vez, tabla de conceptos y porcentajes de ISLR (decreto 1.808), declaración y archivos de carga del SENIAT, retención de IVA sobre notas de crédito/débito, y ARC anual.
- **2026-11-21 · Notas de crédito y de débito:** migración `…150000_notas`: `nota_venta` (+ `nota_venta_linea`) y `nota_compra`, y las facturas de venta y de proveedor ganan `ajuste` (créditos − débitos): **la factura no se toca**, lo que se debe es `total + ajuste` (el `CHECK` del saldo pasó a `0 ≤ saldo ≤ total + ajuste`). Servicio `src/lib/notas/servicio.ts`; la nota usa **la tasa de la factura original** para que las cuentas por cobrar/pagar suban o bajen exactamente los mismos bolívares.
  **Venta:** nota de crédito por **devolución** (cantidades por línea, máximo lo vendido menos lo ya devuelto, mismo precio/descuento/IVA; la mercancía vuelve al almacén como ajuste sobrante al costo con que salió, sin alterar el costo promedio), nota de crédito por **ajuste de monto** (base + alícuota) y nota de **débito** por cargo. Un crédito solo procede si el saldo alcanza (UPDATE atómico `saldo ≥ total`): si la factura ya se cobró hay que anular antes el cobro. Una factura con notas vigentes no se anula. **Compra:** nota de crédito o de débito del proveedor por montos (nº de nota del proveedor único por proveedor; no mueve inventario). **Anular** una nota revierte saldo, inventario y asiento (un débito ya cobrado no se deshace).
  Contabilidad automática: crédito de venta = Debe Ventas + IVA débito / Haber CxC (y, si devuelve, Debe Inventario / Haber Costo de ventas); débito = lo inverso; compras igual con CxP, Compras e IVA crédito; la anulación genera el asiento inverso. **Libros fiscales:** las notas aparecen en el libro de ventas y en el de compras (créditos en negativo, débitos en positivo, con la factura que afectan) y en el resumen de IVA.
  Pantallas: `/facturacion/notas` y `/cxp/notas` (lista con filtros), alta desde la factura (botones «Nota de crédito» y «Nota de débito» en su detalle), detalle con anular y las notas listadas dentro de la factura (con el ajuste y el saldo).
  Verificado por script con contabilidad automática: devolver más de lo vendido o de lo ya devuelto, sin líneas, alícuota inexistente, crédito mayor al saldo (también con un cobro previo) y anular una factura con notas se rechazan; devolución de 300 tornillos + 1 martillo (43,50 USD) mueve el stock y el saldo; el libro de ventas y el de compras con notas **concilian al centavo** con IVA débito, ventas, IVA crédito y CxP de la contabilidad; el balance cuadra; al anular todas las notas el saldo, el ajuste y el stock vuelven al original y los saldos contables a cero. En pantalla: crédito por devolución de 400 tornillos = −46,40 USD (−1.738,00 Bs. en el libro) y débito del proveedor 25 + 16 % = 29,00 USD. Datos de prueba borrados.
  **Pendiente:** registrar el nº fiscal y de control de la nota de venta (las columnas ya existen); notas de crédito que excedan el saldo (saldo a favor del cliente/proveedor, aplicable a otras facturas o reembolsable); devolución a proveedor con salida de inventario; notas sobre facturas de importación; PDF; **retenciones de IVA/ISLR**.
- **2026-11-21 · Libros fiscales de IVA:** la factura gana `numero_control` (y `numero_fiscal` pasa a ser único) — migración `…140000_libros_fiscales`; en el detalle de la factura se registran **una sola vez** el número de factura fiscal y el de control (único, no se cambia, queda en auditoría). Tres reportes nuevos en el grupo **Fiscal** de `/reportes`, con impresión y CSV: **Libro de ventas** (fecha, RIF, razón social, nº de factura fiscal —o el interno FAC-… si aún no se registró—, nº de control, total con IVA, exentas, **base e IVA por cada alícuota presente**), **Libro de compras** (mismas columnas sobre las facturas de proveedor) y **Resumen de IVA** (débito fiscal − crédito fiscal = IVA a pagar o excedente de crédito). Las facturas anuladas se listan con montos en cero.
  Cada documento entra con su tasa congelada y se reparte por alícuota **en centavos enteros** de modo que las bases y el IVA suman exactamente lo que contabilizó el asiento automático.
  Verificado con tres alícuotas en una misma factura (16 %, 8 % y exento), facturas anuladas y compras con y sin IVA, y **conciliado contra la contabilidad al centavo**: IVA débito (2.1.02) = IVA del libro de ventas (929,64); ventas (4.1.01) = bases del libro (6.572,45); IVA crédito (1.1.04) = IVA del libro de compras (1.799,80); cuentas por pagar (2.1.01) = total del libro de compras (16.794,88). Registro de números fiscales probado: duplicado, formato inválido, cambio de uno ya registrado y factura anulada, rechazados; en pantalla quedan fijos. Datos de prueba borrados.
  **Pendiente / revisar con el contador:** el formato y columnas exactos que exija el SENIAT para cada cliente; **retenciones de IVA** (columna y comprobantes, de clientes y a proveedores); compras con **varias alícuotas** o importaciones (la factura de proveedor guarda un solo IVA y la alícuota se deduce por proporción); ventas a no contribuyentes o por exportación; **notas de crédito/débito** en los libros; libros en **PDF** con la numeración y el sellado que se requiera; correlativo de factura fiscal sin saltos (lo asigna la máquina o imprenta); ARC y declaración de ISLR.
- **2026-11-21 · Reportes:** módulo `/reportes` con un **catálogo de reportes** (`src/lib/reportes/registro.ts`): cada reporte es una función que devuelve un resultado genérico (columnas, filas, totales, notas) y una entrada con sus parámetros; **la pantalla, la impresión y la descarga CSV salen de la misma consulta**, así lo que se ve y lo que se descarga no puede diferir. Los parámetros de la URL se validan (lo inválido toma el valor por defecto). Exportar a Excel genera CSV con `;` y coma decimal, UTF-8 con BOM (se abre bien en Excel en español) y exige el permiso `reportes.exportar`. «Imprimir» usa la impresión del navegador (los filtros y botones se ocultan).
  Reportes: **Ventas, costo y margen** (por cliente, producto, día o mes; solo facturas emitidas; costo promedio al facturar), **Inventario valorado** (por producto o categoría y por almacén, a costo promedio), **Antigüedad de CxC y de CxP** (resumen por tramos o detalle por factura), **Balance general** (Activo = Pasivo + Patrimonio, con el resultado del ejercicio aún no cerrado y aviso si no cuadra) y **Estado de resultados** (ingresos, costos, gastos y utilidad del período), los dos últimos en bolívares desde el libro contable.
  Verificado con datos reales del demo (2 facturas, un cobro parcial, una factura de proveedor y un gasto, con la contabilización automática activa): las ventas por cliente, producto y día dan 180,00 USD sin IVA / 208,80 con IVA / 7.820,97 Bs.; el costo 91,80 y el margen 88,20 coinciden con el cálculo a mano; la antigüedad de CxC 168,80 y de CxP 348,00 coinciden con los saldos; el inventario valorado 2.321,40 coincide con Σ existencia × costo promedio; el balance cuadra (activo 112.417,40 = pasivo 14.113,71 + patrimonio 98.303,69) y el estado de resultados da 6.742,22 de ingresos, 3.438,53 de costos y 5.000,00 de gastos → pérdida 1.696,31 igual que el resultado del balance; el CSV baja con BOM y un reporte inexistente da 404. Datos de prueba borrados.
  **Pendiente:** exportar a Excel real (`.xlsx`) y PDF con membrete; más reportes (compras por proveedor, ventas por vendedor/categoría, productos sin movimiento y bajo mínimo, kardex por producto, estado de cuenta de un cliente o proveedor imprimible, flujo de caja y conciliación bancaria, libro diario, libros fiscales de compras y ventas, ARC); comparativos entre períodos y gráficos; programar y enviar reportes por correo; reportes de auditoría (quién cambió qué).
- **2026-11-21 · Contabilidad automática:** migración `…130000_contabilidad_automatica`: `config_contable` (interruptor), `cuenta_concepto` (qué cuenta usa cada concepto), `cuenta_tesoreria.cuenta_contable_id` y `factura_compra.tasa_usd` (la factura del proveedor ahora congela la tasa del día; exige tasa cargada). Un índice único parcial impide que un documento genere dos veces su asiento.
  `src/lib/contabilidad/automatico.ts`: **cada documento genera su asiento dentro de su propia transacción** (o quedan los dos o ninguno): **factura de venta** (Debe CxC / Haber Ventas + IVA débito; Debe Costo de ventas / Haber Inventario al costo promedio), **cobro** (Debe caja/banco / Haber CxC a la tasa de cada factura; la diferencia va a *Diferencial cambiario*), **factura de proveedor** (Debe Compras + IVA crédito / Haber CxP) y **pago** (Debe CxP a la tasa de cada factura / Haber caja o banco; diferencial cambiario). Todo en bolívares con la tasa congelada del documento. **Anular** no borra: genera el **asiento inverso** del original (que queda en el historial) y solo si el original existe. Si el período del documento está cerrado el asiento se fecha hoy; si el de hoy también lo está, el documento se rechaza completo. Una cuenta sin asignar, sin tasa o un período cerrado revierten el documento entero.
  Pantalla `/contabilidad/configuracion`: interruptor «Contabilizar automáticamente» (solo se activa con los 9 conceptos y todas las cajas/bancos activos asignados), cuenta por concepto y cuenta contable de cada caja/banco. Los clientes nuevos nacen con el plan base, los conceptos propuestos y las cajas ya ligadas a *1.1.01 Caja y bancos*; la contabilización queda **apagada** hasta que el contador la active. Solo se contabiliza lo que ocurra después de activarla.
  Verificado por script con el ciclo completo (apagada no genera nada; no deja activar con un concepto o una caja sin cuenta; factura, cobros en USD y en Bs., factura de proveedor y pagos generan asientos correctos y el balance cuadra; diferencial cambiario en ganancia y en pérdida con tasas distintas; al anular todo los saldos vuelven a cero salvo lo no anulado; una cuenta sin asignar o un período cerrado dejan sin hacer la factura y el stock intacto) y en pantalla (activar y desactivar guarda).
  **Pendiente:** contabilizar documentos anteriores a la activación; asientos de recepciones de compra (hoy el inventario entra a los libros con la factura del proveedor, no con la recepción, así que puede haber diferencias con el kardex hasta que se facture); movimientos manuales de tesorería (ingresos, egresos, transferencias) y comisiones; notas de crédito/débito y retenciones (cuando existan); cuentas por concepto distintas por producto/categoría o por cliente; asiento de cierre del ejercicio y estados financieros.
- **2026-11-21 · Contabilidad (núcleo):** modelo `cuenta_contable` (jerárquica por código con puntos, tipo heredado del padre, «movimiento» vs. «agrupa»), `periodo_contable`, `asiento` y `asiento_linea` — migración `…120000_contabilidad`. Libros en **bolívares**, partida doble. **Un asiento solo existe si cuadra:** lo valida el servicio (centavos enteros, máximo 2 decimales, una sola columna por línea, solo cuentas de movimiento activas, fecha no futura) y, como segunda barrera, un **trigger diferido de la base** (`asiento_linea_cuadra`) rechaza al confirmar cualquier asiento con debe ≠ haber, aunque se salte el servicio.
  Los asientos no se editan: se **anulan** con motivo (quedan en el historial pero no suman en los reportes) y se registra otro. Un **período cerrado** no admite asientos ni anulaciones; se cierra y reabre desde `/contabilidad/periodos` (el período se crea abierto al primer asiento). Plan de cuentas con alta/edición/baja y reglas (código bajo el padre, el padre no puede recibir asientos, no se elimina una cuenta con hijas o movimientos). Cada cliente nuevo nace con un plan base de 29 cuentas (`scripts/lib/plan-cuentas-base.ts`), editable por su contador.
  Pantallas: `/contabilidad` (plan de cuentas), `/contabilidad/asientos` (lista, nuevo con totales en vivo y bloqueo si no cuadra, detalle con anular), `/contabilidad/mayor` (saldo inicial, movimientos y saldo corrido; una cuenta de agrupación incluye a sus hijas), `/contabilidad/balance` (balance de comprobación por rango, las cuentas de agrupación suman a sus hijas, totales y aviso de cuadre) y `/contabilidad/periodos`.
  Verificado por script (descuadre, una línea, debe y haber juntos, 3 decimales, cuenta de agrupación y fecha futura rechazados; el trigger rechaza un asiento descuadrado insertado directo; balance y mayor con saldos iniciales y corridos correctos; cierre/reapertura de período; reglas del plan de cuentas) y en navegador (asiento de 3 líneas: Caja 1.000 / Ventas 862,07 / IVA 137,93; el formulario muestra «Diferencia 137,93» y bloquea el botón hasta cuadrar; el balance cuadra; cerrar el período quita el botón Anular).
  **Pendiente (lo más importante: asientos automáticos):** generar el asiento desde facturas, notas, compras/recepciones (inventario), facturas de proveedor, cobros, pagos y movimientos de tesorería, con una tabla de «cuentas por concepto» configurable; asiento de cierre del ejercicio (resultado del ejercicio a resultados acumulados); estados financieros (balance general y estado de resultados); libro diario impreso; centros de costo; contabilidad en divisa o ajuste por inflación si el cliente lo exige; importar el plan de cuentas desde Excel; exportar a Excel/PDF.
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
  **Pendiente:** retenciones de IVA/ISLR (comprobantes), facturas del proveedor en bolívares, anticipos a proveedores, notas de débito/crédito del proveedor, programación de pagos por vencimiento, y cargar los gastos de importación.
- **2026-11-21 · Cuentas por cobrar:** la factura ahora lleva `dias_credito`, `fecha_vencimiento` y `saldo` (USD); modelo `cobro`/`cobro_aplicacion` (migración `…080000_cxc`, con `CHECK`: saldo entre 0 y el total, montos positivos, moneda USD/VES coherente con tasa), servicio `src/lib/cxc/servicio.ts` y pantallas `/cxc` (saldos por cliente con antigüedad por tramos), `/cxc/cliente/[id]` (estado de cuenta), `/cxc/cobros` (lista), `/cxc/cobros/nuevo?cliente=ID` y detalle con anular.
  Un cobro reparte lo recibido entre las facturas abiertas del cliente; todo se lleva en USD: si paga en Bs., se guarda el monto en Bs. (USD × tasa de hoy) y la tasa. El saldo baja con un `UPDATE` atómico condicionado (`saldo >= monto`). Anular un cobro restituye lo aplicado; una factura con cobros vigentes no se anula hasta anular esos cobros.
  Verificado por script (cliente ajeno y exceso rechazados; dos cobros simultáneos de 60 sobre 80 → solo uno; anulaciones; factura anulada no se cobra) y en navegador (factura a 15 días vence 06/12; cobro de 100 USD en Bs. = 3.745,68; anular devuelve el saldo a 208,80).
  **Pendiente:** anticipos y pagos sin factura (con Tesorería), abonos en varias monedas en un mismo recibo, notas de crédito/débito, retenciones, intereses de mora, recibo imprimible/PDF y cobranza (recordatorios).
- **2026-11-21 · Facturación (factura administrativa):** modelo `factura`/`factura_linea` (migración `…070000_facturacion`, con `CHECK`), servicio `src/lib/facturacion/servicio.ts` y pantallas `/facturacion` (lista, nueva directa o `?pedido=ID`, detalle con anular y motivo). Botón «Facturar» en el pedido confirmado.
  Emitir = una transacción: crea la factura (número FAC-xxxxxx, tasa USD congelada, total Bs.), guarda el costo promedio de cada línea (margen futuro) y descuenta el almacén elegido vía `aplicarMovimiento` (SALIDA). Factura directa respeta lo reservado por pedidos confirmados; la de un pedido pasa el pedido a FACTURADO y consume su reserva. Anular exige motivo, devuelve la mercancía como ajuste sobrante (no cambia el costo promedio) y reabre el pedido (CONFIRMADO). Una factura emitida no se edita.
  Verificado por script (reserva respetada, dos facturaciones simultáneas del mismo pedido → una sola, anulaciones, cuadre de Bs.) y en navegador (50 > 40 disponibles rechazado; 5 × 7,50 + IVA 16 % = 43,50 USD = 1.629,37 Bs.; anulación y kardex 40→35→40).
  **Pendiente:** número fiscal e integración con la impresora/máquina fiscal (campo `numero_fiscal` listo), notas de crédito/débito, retenciones de IVA/ISLR, POS, descuentos por perfil, factura en PDF/Excel y libro de ventas.
- **2026-11-21 · Pedidos de venta:** modelo `pedido_venta`/`pedido_venta_linea` (migración `…060000_pedidos`, con `CHECK`), servicio `src/lib/pedidos/servicio.ts` y pantallas `/pedidos` (lista, nuevo, editar, detalle con confirmar y anular).
  **Reserva sin columna:** lo reservado de un producto es la suma de sus líneas en pedidos CONFIRMADOS; disponible = existencia total − reservado. Confirmar toma un candado por producto (`pg_advisory_xact_lock`), valida disponibilidad, exige tasa USD cargada y la congela en el pedido (muestra Bs.). Respeta `precioMaximoPublico`.
  Verificado: dos confirmaciones simultáneas de 3.000 sobre 5.000 → solo una pasa; anular libera la reserva; no se edita ni anula dos veces; en pantalla 4.000 × 0,09 + IVA 16 % = 417,60 USD = 15.641,96 Bs. a 37,45678912.
  **Pendiente:** reserva por almacén, lista de precios por cliente/condición de pago, y descuentos por perfil.
- **2026-11-21 · Compras con pantallas:** `/compras` (lista con filtro por número/proveedor/estado), `/compras/nueva` y `/compras/[id]/editar` (líneas con buscador de productos y totales en vivo; el servidor recalcula), `/compras/[id]` (detalle, emitir, anular, registrar recepción parcial o total, historial de recepciones). Permisos: crear/editar (emitir y recibir) /eliminar (anular).
  Verificado en navegador: crear, emitir, sobre-recepción rechazada, recepción parcial 40 + 60 → orden «Recibida» y kardex 36→76→136. **Pendiente:** probar editar/anular en pantalla y concurrencia de recepciones; los números de recepción pueden saltar (la secuencia no se revierte si la recepción falla).
- **2026-11-20 · Compras (modelo y servicio):** hecho el modelo (`orden_compra`, `orden_compra_linea`, `recepcion`, `recepcion_linea`, con `CHECK`), los cálculos (`src/lib/compras/calculos.ts`) y el servicio transaccional
  (`src/lib/compras/servicio.ts`: guardar orden, emitir, anular, recibir). La recepción entra al inventario con el costo neto de la orden vía `aplicarMovimiento()`. Migración aplicada a los clientes.
  (Las pantallas, permisos y pruebas que faltaban se hicieron el 2026-11-21: ver la entrada de arriba.) Órdenes solo en USD por ahora.

## 12. Pendientes consolidados

Reúne lo que cada módulo dejó fuera y lo que quedó sin verificar. Prioridad: **A** = bloquea operar con clientes reales, **M** = importante pero hay alternativa, **B** = mejora. Al cerrar un punto, bórralo aquí y de la entrada del módulo.

### 12.1 Deuda técnica y cosas sin verificar
- **A · Pruebas automatizadas permanentes.** Todo lo verificado (concurrencia, transacciones, cuadre de saldos) se probó con scripts temporales que se borraron. Armar una suite que corra en CI contra una base de pruebas: reservas, inventario, cobros/pagos, tesorería, anulaciones.
- **A · Permisos de usuarios que no son administradores.** Las acciones de anular, convertir, recibir, cobrar y pagar se probaron solo con el administrador. Verificar `ver/crear/editar/eliminar` por módulo con perfiles limitados (y que un módulo apagado al cliente no se pueda usar por URL).
- **M · Anular una factura desde el navegador:** en una prueba el botón no la anuló y se anuló por script; en Facturación sí funcionó antes. Investigar (probablemente el `prompt` del navegador de pruebas, pero no está confirmado).
- **M · Selector de cuenta en los formularios de cobro y pago:** verificado por script y `tsc`, no en pantalla (el demo no tenía facturas con saldo).
- **M · Sin probar de punta a punta:** suspender/reactivar un cliente, entrar por subdominio real, editar y eliminar en varios maestros, un traslado exitoso en pantalla (el demo tiene un solo almacén), editar/anular una orden de compra y recepciones simultáneas.
- **M · Huecos en los correlativos.** `FAC-`, `PED-`, `COT-`, `COB-`, `PAG-`, `REC-` usan secuencias de la base: si una transacción falla, el número se salta. Para documentos internos es aceptable; **para el número fiscal de la factura no** (ver 12.2).
- **M · Las migraciones no son atómicas:** si una falla a la mitad quedan aplicados los pasos anteriores (pasó dos veces); para recuperarla hay que deshacer lo parcial a mano y borrar su fila de `_prisma_migrations`. Hacer las migraciones idempotentes (`IF NOT EXISTS`) o envolverlas en `BEGIN/COMMIT`.
- **M · Migraciones:** aplicarlas siempre con el rol migrador (`npm run db:migrar:todos` sin `MIGRATION_DATABASE_URL` de administrador exportada); ya pasó una vez que una tabla quedó con dueño `postgres`. Agregar una verificación en `migrar-todos` que lo detecte.
- **B · Limpieza:** la cuenta demo `BCO-VES` conserva movimientos de prueba; un comentario con redacción incorrecta en `cotizaciones/[id]/editar/page.tsx`; los cobros y pagos anteriores a Tesorería quedaron sin cuenta (solo existen en datos de prueba).

### 12.2 Fiscal y legal (confirmar con el contador de cada cliente)
- **A · Impresora/máquina fiscal:** prueba de concepto del agente local, número fiscal en la factura (campo `numero_fiscal` ya existe) y **correlativo fiscal sin saltos**, que debe asignarlo la máquina o una secuencia propia protegida, no la secuencia de la base.
- **M · Notas de crédito/débito (resta):** nº fiscal y de control de la nota de venta, saldo a favor cuando la nota excede el saldo, devolución a proveedor con salida de inventario y PDF. (El núcleo de venta y compra, con inventario, contabilidad y libros, ya está.)
- **A · Retenciones de IVA e ISLR** (comprobantes de retención de clientes y a proveedores), y su efecto en cobros y pagos.
- **A · Libros de compras y de ventas**, ARC y demás reportes fiscales.
- **M · Facturas de proveedor en bolívares** y órdenes de compra en bolívares (hoy todo es USD con la tasa del día).
- **M · Revisar con el contador** si aplican cargos adicionales a pagos en divisas (por ejemplo IGTF) y otras normas vigentes antes del primer cliente; hoy no están modeladas.

### 12.3 Ventas y cobranza
- **A · Punto de venta (POS):** venta rápida con caja, cierre y arqueo; depende del agente fiscal.
- **M · Listas de precios por cliente o condición de pago, descuentos por perfil, vendedor y comisiones.**
- **M · PDF y envío por correo** de cotización, pedido, factura y recibo de cobro.
- **M · Anticipos y pagos sin factura** (de clientes y a proveedores); cobro con varias monedas en un solo recibo.
- **M · Cobranza:** recordatorios de mora, intereses de mora, estado de cuenta imprimible.
- **B · Convertir una cotización directo en factura**, versiones de cotización, seguimiento comercial (probabilidad de cierre).
- **B · Reserva por almacén** (hoy la reserva es global por producto).

### 12.4 Compras, importaciones y pagos
- **A · Importaciones:** liquidación con gastos de importación y su efecto en el costo del producto (módulo sin empezar).
- **M · Compras sugeridas** (por mínimos, ventas y proveedor) y condiciones de pago por proveedor.
- **M · Programación de pagos por vencimiento** y notas de débito/crédito del proveedor.
- **M · Número de recepción:** puede saltar cuando una recepción falla.

### 12.5 Inventario y productos
- **M · Conteo físico con conciliación**, reporte de kardex por producto y fecha, exportar a Excel.
- **M · Cambio masivo de precios, promociones, listas de precios, etiquetas y códigos de barras, importación masiva desde Excel.**
- **M · Precio en bolívares** en la ficha del producto (con la tasa del día).
- **B · Lotes y vencimientos** y costo por lote, solo si el cliente los usa.
- **B · Regla de presentación principal única por producto** (sin validar todavía).

### 12.6 Tesorería y bancos
- **M · Cambio de divisas** entre cuentas de distinta moneda.
- **M · Importar el estado de cuenta del banco** y conciliar automáticamente; cheques emitidos y en tránsito.
- **M · Arqueo y cierre de caja**; comisiones bancarias automáticas.
- **B · Reportes de tesorería** (flujo de caja, saldos por fecha).

### 12.7 Plataforma como servicio (alquiler)
- **A · Respaldos por cliente** (`pg_dump` programado y prueba de restauración) y plan de recuperación.
- **A · Facturación del alquiler** y planes (qué módulos y qué límites incluye cada plan).
- **A · Panel del proveedor restringido a `admin.<dominio>`** y endurecimiento (límite de intentos, auditoría del panel).
- **M · Carga automática de la tasa desde el BCV** (tarea programada por cliente) y otras divisas con su fuente.
- **M · Monitoreo** (errores, rendimiento, espacio por cliente) y despliegue (Docker/CI).

### 12.8 Módulos y fases sin empezar
- **A · Contabilidad (resta):** asientos automáticos de recepciones de compra y de movimientos manuales de tesorería, contabilizar lo anterior a la activación, cierre del ejercicio, estados financieros (balance general y estado de resultados), libro diario y exportación. Ya están el plan de cuentas, asientos manuales, mayor, balance de comprobación, períodos y los asientos automáticos de factura, cobro, factura de proveedor y pago.
- **A · Reportes (resta lo fiscal restante y lo gerencial avanzado):** ARC y retenciones en los libros, `.xlsx`/PDF con membrete, kardex por producto, estado de cuenta imprimible, flujo de caja, compras por proveedor, ventas por vendedor o categoría, comparativos y gráficos, y los equivalentes de los Crystal Reports de Lebrun aún no cubiertos. Ya están ventas/costo/margen, inventario valorado, antigüedad de CxC/CxP, balance general y estado de resultados.
- **A · Datos, paralelo y corte:** importación repetible desde el MySQL de Lebrun (clientes, proveedores, productos, existencias, saldos), operación en paralelo por empresa, capacitación y plan de vuelta atrás (fase 12 del plan).
