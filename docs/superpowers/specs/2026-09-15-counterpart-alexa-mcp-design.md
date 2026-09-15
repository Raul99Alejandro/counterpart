# Counterpart — Diseño técnico (track Alexa+)

- **Fecha:** 2026-09-15
- **Estado:** borrador para revisión
- **Hackathon:** Build, Ship, Shape: Amazon Developer Hackathon — track **Alexa+**, mini-retos **AWS Builder** y **Open Source**
- **Cierre de submissions:** 23 oct 2026, 12:00 PM PT · **Entrega objetivo de este proyecto:** 26 sep 2026

---

## 1. Resumen

Counterpart es un servidor MCP self-hosted que le permite a Alexa+ operar el día a día de un negocio pequeño que trabaja con órdenes: abrir y avanzar órdenes, agregar partidas, consultar y reordenar inventario, cobrar y ver cómo va el día.

Un **núcleo genérico** se configura con **perfiles de negocio**. Cada perfil genera tools con el vocabulario de ese negocio, para que el modelo elija la tool correcta. Se entrega con dos perfiles sobre el mismo motor: **taller mecánico** y **pastelería de pedidos**.

---

## 2. Contexto y restricciones

### 2.1 Lo que exige el track

- Regla: *"Build a working Agent Skill or a self-hosted MCP server, implementing MCP spec version (minimum acceptable version is 2025-11-25)."*
- El video debe mostrar el proyecto funcionando. *"Judges are not required to test the Project"*: pueden juzgar solo con la descripción, las imágenes y el video.
- Cuatro criterios con igual peso: Tech Implementation, Design, Potential Impact, Quality of Idea. El rubro distingue implementaciones obvias de innovadoras.

### 2.2 El MCP Toolkit de Alexa+ no está disponible

- `npm view @alexa-ai/cli` → **404 en npm público** (verificado 2026-09-15). La guía oficial de instalación lo sirve desde CodeArtifact (us-west-2), un registro privado.
- Otro participante del hackathon documenta en su repo que el Toolkit y el CLI están *"limited to select partners"*.
- Aun con acceso: disponible solo en EE.UU., sin soporte para Windows y con Node 24+ obligatorio.

**Consecuencia de diseño:** el servidor cumple los requisitos de Alexa+ (spec 2025-11-25, Streamable HTTP, requisitos funcionales de add-ons, MCP Apps), pero el demo usa una superficie que no depende del Toolkit (§10).

### 2.3 Requisitos funcionales de add-ons de Alexa+ que se adoptan

- Toda tool en `tools/list` funciona al invocarla (requisito 13). Nada a medio construir se publica.
- `inputSchema` válido con todos los parámetros requeridos declarados.
- Descripciones claras, **una intención distinta por tool**, con sinónimos, abreviaturas y variantes; sin jerga técnica ni nombres internos.
- Identificadores estables en las respuestas para encadenar pasos.
- Errores por el contrato MCP (`isError: true`); nunca payloads malformados ni caídas del proceso.

### 2.4 Restricciones propias

- **Código, esquema y datos 100% nuevos y propios.** No se reutiliza nada de proyectos de clientes. Repo público con licencia MIT.
- Demo en inglés (en-US) con negocios ficticios de EE.UU.
- Presupuesto de AWS: los $150 en créditos del hackathon.

---

## 3. Objetivos y no-objetivos

**Objetivos**

1. Nueve tools funcionales por perfil, con dos perfiles sobre el mismo núcleo.
2. Demo por voz en una superficie Alexa real (Echo o simulador de la consola) y visuales con MCP Apps.
3. Despliegue en AWS documentado para calificar al mini-reto AWS Builder.
4. Robustez en vivo: referencias habladas, errores que se pueden decir en voz alta, escrituras idempotentes.

**No-objetivos del MVP**

- OAuth / account linking (diseño documentado en §14, no se construye).
- Elicitation.
- Editar o quitar partidas; reabrir órdenes cerradas.
- Avisos a clientes (SMS, email), múltiples sucursales, roles de empleados.
- Integraciones con POS o pagos reales; idiomas distintos del inglés.
- Recetas de varios niveles (solo `consumes` de un nivel, §7.4).

---

## 4. Producto

### 4.1 Perfiles del demo

| | Taller | Pastelería |
|---|---|---|
| Negocio ficticio | Oak Street Auto | Sweet Crumb Bakery |
| Orden | work order | cake order |
| Activo | vehicle: year, make, model (obligatorios), plate (opcional) | — |
| Campos propios de la orden | — | flavor y size (obligatorios), inscription (opcional) |
| Fecha de entrega (`due`) | opcional | obligatoria |
| Etapas | estimate → approved → in_bay → waiting_on_parts → ready_for_pickup → picked_up | ordered → baking → decorating → ready → picked_up |
| Se cierra desde | ready_for_pickup | ready |
| Inventario | parts & fluids | ingredients & supplies |

### 4.2 Las nueve tools

| # | Intención | Taller | Pastelería | Frase ejemplo (taller) | Tipo |
|---|---|---|---|---|---|
| 1 | Resumen del día | `get_shop_snapshot` | `get_bakery_snapshot` | "How's the shop looking today?" | lectura · UI |
| 2 | Buscar órdenes | `find_work_orders` | `find_cake_orders` | "What's waiting on parts?" | lectura |
| 3 | Abrir orden | `open_work_order` | `take_cake_order` | "Open a work order for Dana Lee's 2019 Civic, front brakes" | escritura |
| 4 | Cambiar etapa | `move_work_order_stage` | `move_cake_order_stage` | "Move the Civic to in the bay" | escritura |
| 5 | Agregar partida | `add_parts_or_labor` | `add_to_cake_order` | "Add front brake pads to the Civic" | escritura |
| 6 | Consultar inventario | `check_parts_stock` | `check_ingredients` | "Do we have 5W-30?" | lectura |
| 7 | Reordenar | `reorder_parts` | `reorder_ingredients` | "Reorder whatever's low" | escritura |
| 8 | Cobrar y cerrar | `close_out_work_order` | `close_out_cake_order` | "Close out the F-150, they paid by card" | escritura |
| 9 | Reporte de ventas | `sales_report` | `sales_report` | "How did we do this week compared to last week?" | lectura · UI |

### 4.3 Guion del demo (≤ 3 min, borrador)

1. **0:00–0:20** — El problema: el mecánico tiene las manos ocupadas y el sistema está en una PC al fondo del taller.
2. **0:20–1:30** — Taller por voz: *"What's waiting on parts?"* → *"Add front brake pads to the Civic"* → *"Move the Civic to in the bay"* → *"Close out the F-150, they paid by card."*
3. **1:30–1:55** — Visual: dashboard del día y gráfica de ventas (MCP Apps).
4. **1:55–2:35** — Mismo servidor, otro perfil: *"How many cakes are due Saturday?"* → *"Take a cake order for Priya Shah, a 10-inch chocolate cake, due Saturday"* → *"Reorder whatever's low."*
5. **2:35–3:00** — Arquitectura en AWS y cierre.

---

## 5. Arquitectura

```
  Echo o simulador de la consola de Alexa
          │ voz
          ▼
  Alexa Skill (bridge) ──► agente Strands en Bedrock AgentCore (Nova 2 Lite)
                                   │ MCP · Streamable HTTP · Authorization: Bearer
                                   ▼
          ┌────────────────── Counterpart (ECS Express Mode) ──────────────────┐
          │ http/    /ping · /mcp · auth por token · sesión por negocio         │
          │ tools/   registra las 9 tools del perfil del negocio en su sesión   │
          │ domain/  reglas puras: órdenes · inventario · referencias · reportes│
          │ ui/      MCP Apps: snapshot · sales report                          │
          │ store/   DynamoStore ─────────────────────────► DynamoDB            │
          └─────────────────────────────────────────────────────────────────────┘

  Visuales en el video: basic-host de ext-apps ──► mismo /mcp
```

### 5.1 Unidades

Cada unidad tiene una responsabilidad, una interfaz y dependencias explícitas. `domain/` no hace I/O y se prueba sin mocks.

| Unidad | Responsabilidad | Interfaz principal | Depende de |
|---|---|---|---|
| `profiles/` | Cargar y validar perfiles YAML | `loadProfile(id): Profile` | zod, yaml |
| `domain/` | Reglas de negocio puras | funciones puras sobre tipos | tipos de `profiles` |
| `store/` | Persistencia | interfaz `Store`; `DynamoStore`, `MemoryStore` | AWS SDK v3 |
| `speech/` | Texto hablable en inglés | funciones `say` que devuelven `string` | tipos de `profiles` |
| `tools/` | Registrar las 9 tools de un perfil en un `McpServer` | `registerTools(server, ctx)` | domain, store, speech, ui |
| `ui/` | Dos MCP Apps en HTML de un solo archivo | recursos `ui://counterpart/*.html` | ext-apps |
| `http/` | Express: `/ping`, `/mcp`, autenticación, sesiones | `createApp(deps)` | `@modelcontextprotocol/node` |
| `seed/` | Datos ficticios deterministas por perfil | `seed(store, profileId)` | domain, store |
| `infra/` | Imagen, tabla, despliegue, tokens | scripts | Docker, AWS CLI |

### 5.2 Estructura del repo

```
counterpart/
├── src/
│   ├── http/       app.ts · auth.ts · sessions.ts
│   ├── tools/      register.ts · snapshot.ts · find.ts · open.ts · move.ts
│   │               add-line.ts · stock.ts · reorder.ts · close-out.ts · sales-report.ts
│   ├── domain/     orders.ts · inventory.ts · resolver.ts · reports.ts · money.ts · dates.ts
│   ├── profiles/   schema.ts · load.ts · auto-repair.yaml · bakery.yaml
│   ├── store/      store.ts · dynamo.ts · memory.ts
│   ├── speech/     say.ts
│   └── ui/         snapshot/ · sales-report/
├── seed/           auto-repair.ts · bakery.ts
├── infra/          Dockerfile · create-table.sh · deploy.sh · create-token.ts
├── test/           unit/ · integration/ · golden/
└── docs/           aws-builder.md · friction-log.md · product-feedback.md · demo-script.md
```

---

## 6. Stack

| Pieza | Elección | Motivo |
|---|---|---|
| Runtime | Node.js 24 LTS (imagen `node:24-slim`) | LTS vigente |
| Lenguaje | TypeScript, ESM, `strict` | El SDK de MCP Apps es TypeScript |
| MCP | `@modelcontextprotocol/server` y `@modelcontextprotocol/node` **2.0.0** | ext-apps 2.0.0 exige el SDK v2 |
| MCP Apps | `@modelcontextprotocol/ext-apps` **2.0.0** | UI dentro de la conversación |
| Validación | zod ^4.2 (`zod/v4`) | Peer de ext-apps; Standard Schema en el SDK v2 |
| HTTP | Express | Patrón de los ejemplos oficiales del SDK |
| Datos | DynamoDB on-demand; DynamoDB Local en Docker para pruebas | Serverless, capa gratuita |
| UI | Vite, empaquetado en un solo HTML; gráficas en SVG propio | Sin librería de charts |
| Pruebas | vitest | — |

**Versiones exactas** (sin `^`) en `package.json` para los paquetes de MCP: el SDK v2 acaba de salir.

**Plan B de versiones (verificado en npm el 2026-09-15):** `@modelcontextprotocol/sdk` 1.30.0 (`LATEST_PROTOCOL_VERSION = "2025-11-25"`) + `@modelcontextprotocol/ext-apps` 1.7.5 (peer `@modelcontextprotocol/sdk ^1.29.0`). Se activa si el spike 2 o el 3 encuentran un bloqueo en v2.

---

## 7. Diseño detallado

### 7.1 Sesiones y autenticación

1. El cliente envía `POST /mcp` con `Authorization: Bearer <token>` y un `initialize`.
2. `auth.ts` calcula el SHA-256 del token y busca `TOKEN#<hash>` → `businessId`. Si falta el token o no existe → **HTTP 401**, sin crear sesión.
3. Se cargan el negocio y su perfil; se crea un `McpServer`, se registran las tools del perfil y se conecta un `NodeStreamableHTTPServerTransport` con `sessionIdGenerator: randomUUID`.
4. Las peticiones con `mcp-session-id` se enrutan a su transporte. **Cada petición revalida el token y exige que pertenezca al mismo negocio que la sesión**: un session id sin su token no sirve.
5. Las sesiones inactivas por más de 30 minutos se cierran. El mapa de sesiones vive en memoria, por eso el servicio corre con **una sola tarea** (§8).

**Tokens:** 32 bytes aleatorios en base64url generados por `infra/create-token.ts`. En DynamoDB solo se guarda el hash. El valor en claro se muestra una vez y se guarda en Secrets Manager para el bridge.

**Modo local sin token** (por si basic-host no permite enviar headers): `COUNTERPART_DEV_BUSINESS=<bizId>` solo se acepta si el servidor escucha en `127.0.0.1`. Si se combina con cualquier otra interfaz, el proceso se niega a arrancar.

### 7.2 Perfiles

Archivos YAML validados con zod al arrancar. Un perfil inválido detiene el arranque con el error exacto. Un perfil define la **forma** del negocio; precios, inventario y clientes son **datos** y viven en DynamoDB.

```yaml
id: auto-repair
nouns: { order: work order, orders: work orders, item: part, items: parts, customer: customer }
synonyms:
  order: [repair order, RO, ticket, job]
  item: [part, fluid, supply]
toolNames:
  snapshot: get_shop_snapshot
  find: find_work_orders
  open: open_work_order
  move: move_work_order_stage
  addLine: add_parts_or_labor
  stock: check_parts_stock
  reorder: reorder_parts
  closeOut: close_out_work_order
  salesReport: sales_report
stages:
  - { id: estimate, label: estimate }
  - { id: approved, label: approved }
  - { id: in_bay, label: in the bay }
  - { id: waiting_on_parts, label: waiting on parts }
  - { id: ready_for_pickup, label: ready for pickup }
  - { id: picked_up, label: picked up }
closedStage: picked_up
closeFrom: [ready_for_pickup]
asset:
  noun: vehicle
  fields:
    - { id: year, type: integer, required: true }
    - { id: make, type: string, required: true }
    - { id: model, type: string, required: true }
    - { id: plate, type: string, required: false }
  spokenAs: "{year} {make} {model}"
orderFields: []
due: optional
```

**Reglas de validación**

- `toolNames` únicos dentro del perfil y con formato `^[a-z][a-z0-9_]{2,63}$`.
- `closedStage` pertenece a `stages`; `closeFrom` es subconjunto de `stages` sin `closedStage`.
- Los marcadores de `spokenAs` son ids de `asset.fields`.
- `due: required` hace obligatorio `due` en la tool de abrir orden.

**Generación de tools:** los `inputSchema` se construyen desde el perfil (campos del activo, `orderFields`, `stages` como enum). Los nombres salen de `toolNames`. Las descripciones se generan con plantillas en inglés a partir de `nouns` y `synonyms`; por ejemplo, para abrir orden: *"Open a new work order (also called a repair order, RO, ticket or job) for a customer and their vehicle. Use this when the user wants to start a new job."*

### 7.3 Modelo de datos (DynamoDB, tabla única `counterpart`)

| Entidad | PK | SK | Atributos principales |
|---|---|---|---|
| Token | `TOKEN#<sha256>` | `TOKEN` | businessId, createdAt |
| Negocio | `BIZ#<bizId>` | `META` | name, profileId, timezone, currency, taxRate, nextOrderNumber, version |
| Cliente | `BIZ#<bizId>` | `CUST#<custId>` | name, nameNormalized, phone? |
| Activo | `BIZ#<bizId>` | `ASSET#<assetId>` | customerId, fields{}, spokenLabel |
| Orden | `BIZ#<bizId>` | `ORD#<orderId>` | number, customerId, assetId?, stage, fields{}, dueOn?, description?, lines[], subtotalCents, taxCents, totalCents, stageHistory[], createdAt, closedAt?, version |
| Ítem | `BIZ#<bizId>` | `ITEM#<itemId>` | name, synonyms[], kind (part · labor · product · ingredient · supply), unit, priceCents, taxable, stocked, onHand, reorderPoint, reorderQty, supplierId?, consumes{itemId: qty}, version |
| Proveedor | `BIZ#<bizId>` | `SUP#<supId>` | name |
| Orden de compra | `BIZ#<bizId>` | `PO#<poId>` | supplierId, lines[{itemId, qty}], status (open · received), createdAt |
| Cobro | `BIZ#<bizId>` | `PAY#<YYYY-MM-DD>#<payId>` | orderId, amountCents, method, paidAt |

- **Sin índices secundarios.** Órdenes: `Query PK = BIZ#<id> AND begins_with(SK, "ORD#")` y filtro en memoria (un negocio pequeño tiene cientos de órdenes). Cobros por rango: `SK BETWEEN "PAY#<desde>" AND "PAY#<hasta>~"`, con la fecha en la zona horaria del negocio.
- **Concurrencia:** negocio, órdenes e ítems llevan `version`; escrituras condicionales (`version = :expected`) con un reintento ante conflicto.
- **Número de orden:** `nextOrderNumber` se incrementa con escritura condicional sobre `META`.
- **Toda escritura que toca varios registros es transaccional** (`TransactWriteItems`): agregar partida (orden + ítems descontados) y cerrar (orden + cobro). Así el mensaje de error interno ("Nothing was changed") siempre es verdad.
- `lines[]` vive dentro de la orden, con un tope de 50 partidas, muy por debajo del límite de 400 KB por registro.

### 7.4 Reglas de dominio

- **Clientes y activos:** al abrir una orden, el cliente se busca por `nameNormalized` exacto y se crea si no existe. El activo se busca por cliente + campos obligatorios y se crea si no existe. Si el perfil tiene activo, el activo es obligatorio.
- **Etapas:** mover acepta cualquier etapa excepto `closedStage`, a la que solo se llega cerrando. Una orden cerrada no se mueve. Retroceder está permitido a propósito, para corregir por voz ("back to in the bay").
- **Partidas:** precio del catálogo × cantidad (en mano de obra, la cantidad son horas). Si el ítem es `stocked`, descuenta `onHand`; lo que no alcance queda como `backordered` en la partida y la respuesta lo dice ("only 1 in stock, 1 backordered"). `onHand` nunca es negativo. El ítem se identifica con el algoritmo de §7.5 aplicado a nombre y sinónimos del catálogo.
- **`consumes` (un nivel):** agregar "Oil change" descuenta 1 oil filter y 5 qt de 5W-30; agregar "10-inch round cake" descuenta 1 cake box y 1 cake board.
- **Impuestos:** `taxRate` del negocio sobre el subtotal de partidas `taxable`, redondeado half-up una sola vez por orden.
- **Reorden:** sin ítem, toma todos los `stocked` con `onHand <= reorderPoint`. Cantidad = `reorderQty` + suma de `backordered` en órdenes abiertas. Agrupa por proveedor en órdenes de compra. Los ítems con orden de compra abierta se omiten y se reportan.
- **Cierre:** solo desde `closeFrom`. Registra un cobro por el total con método `cash`, `card` o `check`, y mueve la orden a `closedStage`.
- **Dinero:** centavos enteros en todo el sistema; formato "$412.50" solo al hablar o mostrar.
- **Fechas:** `due` acepta `today`, `tomorrow`, un día de la semana (su próxima ocurrencia, incluyendo hoy) o `YYYY-MM-DD`, resuelto en la zona horaria del negocio. Periodos del reporte: `today`, `yesterday`, `this_week`, `last_week`, `this_month`, `last_month`; semanas de lunes a domingo.

### 7.5 Referencias habladas (`domain/resolver.ts`)

Entrada: texto libre ("the Civic", "Dana's", "order 42"). Candidatas: órdenes no cerradas + órdenes cerradas hoy (para que cerrar dos veces sea idempotente).

1. **Normalizar:** minúsculas; quitar puntuación y `'s`; quitar palabras vacías (`the, a, an, mr, mrs, ms, number, no`) y los sustantivos del perfil (`work`, `order`, `cake`, etc.).
2. **Número:** si queda un número que coincide con `number` de una candidata, se elige esa.
3. **Puntaje** por candidata = tokens de la consulta que aparecen en nombre del cliente, `spokenLabel`, placa, campos de la orden o descripción ÷ tokens de la consulta. Los tokens de 5 o más letras toleran distancia de edición 1 ("camery" → "camry").
4. **Decisión:** si la consulta queda vacía o el mejor puntaje es menor a 0.5 → `NOT_FOUND`. Si el segundo está a 0.15 o menos del primero → `AMBIGUOUS` con hasta 5 candidatas. Si no → la mejor.

### 7.6 Entradas por tool

| Tool | Entradas |
|---|---|
| snapshot | ninguna |
| find | `query?` (texto libre), `stage?` (enum de etapas), `due?` (§7.4). Sin filtros: órdenes abiertas. Lista de máximo 10, pero `structuredContent.total` siempre trae el conteo completo |
| open | `customerName`, `customerPhone?`, `asset` (campos del perfil; solo si el perfil tiene activo), campos de `orderFields`, `due` (según el perfil), `description?` |
| move | `order` (referencia hablada), `stage` (enum) |
| addLine | `order`, `item` (nombre o sinónimo), `quantity?` (1 por defecto) |
| stock | `item?`; sin ítem, lista lo que está bajo |
| reorder | `item?`; sin ítem, reordena todo lo que está bajo |
| closeOut | `order`, `paymentMethod` (`cash` · `card` · `check`) |
| salesReport | `period` (enum de §7.4), `compare?` (`true` por defecto: contra el periodo anterior) |

### 7.7 Contrato de respuesta

- **`content[0].text`:** una o dos oraciones en inglés, sin markdown, que se puedan decir en voz alta. Dinero como "$412.50". Las órdenes se mencionan por número ("work order 42"), que es su identificador hablable.
- **`structuredContent`** con `outputSchema` declarado en cada tool: ids estables (`orderId`, `number`) y los datos que usan las UIs.
- **Anotaciones MCP:** las lecturas llevan `readOnlyHint: true`; mover, cerrar y reordenar llevan `idempotentHint: true`.
- **Errores de dominio:** `isError: true` con **solo texto** (sin `structuredContent`), que dice qué pasó y qué hacer. Las candidatas se enumeran por número (hasta 5) para que el usuario elija hablando.

| Código | Cuándo | Texto de ejemplo |
|---|---|---|
| `NOT_FOUND` | referencia sin coincidencia | "I couldn't find an open work order for 'Accord'. Open ones are work orders 41, 44 and 47." |
| `AMBIGUOUS` | §7.5 | "I found two Camrys: work order 41 for Dana Lee and work order 57 for Mark Ortiz. Which one?" |
| `UNKNOWN_ITEM` | el ítem no está en el catálogo | "I don't have 'blinker fluid' in the parts list. Closest matches are brake fluid and washer fluid." |
| `INVALID_STAGE` | orden cerrada, o intento de mover a la etapa de cierre | "Work order 42 is already picked up, so it can't be moved." / "To finish a work order, close it out instead." |
| `CANNOT_CLOSE` | la etapa actual no está en `closeFrom` | "Work order 42 is still in the bay. Move it to ready for pickup first." |
| `CONFLICT` | conflicto de versión tras el reintento | "Someone else just updated that work order. Please try again." |
| `INTERNAL` | cualquier otra excepción (se registra con `requestId`) | "Something went wrong on my end. Nothing was changed." |

Los parámetros inválidos los rechaza el SDK con el `inputSchema`; nunca tumban el proceso.

### 7.8 Idempotencia

| Tool | Regla |
|---|---|
| open | Si existe una orden del mismo cliente, con el mismo activo y campos, creada hace menos de 2 minutos, se devuelve esa |
| move | Mover a la etapa actual no cambia nada y responde éxito |
| closeOut | Una orden ya cerrada devuelve el recibo existente sin registrar otro cobro |
| reorder | Los ítems con orden de compra abierta se omiten |
| addLine | Sin deduplicación: repetir "add another oil filter" es legítimo |

### 7.9 MCP Apps

| Recurso | Tool | Contenido |
|---|---|---|
| `ui://counterpart/snapshot.html` | snapshot | ventas de hoy vs. el mismo día de la semana pasada; órdenes por etapa; vencimientos de hoy; inventario bajo |
| `ui://counterpart/sales-report.html` | salesReport | ventas diarias del periodo vs. el anterior; total; ticket promedio; top 5 ítems |

- Registro con `registerAppTool` / `registerAppResource` de ext-apps. La ruta exacta de import en la 2.0.0 se confirma en el spike 3.
- La UI recibe los datos por `structuredContent` (`app.ontoolresult`).
- **El texto de `content` siempre basta por sí solo:** el bridge y los dispositivos sin pantalla no muestran UI.

### 7.10 HTTP y operación

- `GET /ping` → `200 ok` (ruta de health check por defecto de ECS Express Mode).
- `POST`, `GET` y `DELETE` en `/mcp` → transporte de la sesión.
- Los streams SSE abiertos envían keep-alive cada 15 segundos o menos; el idle timeout del balanceador sube a 300 s. El mecanismo exacto se valida en el spike 2.
- Logs JSON a stdout (CloudWatch): `requestId`, `sessionId`, `businessId`, tool, duración y código de error. Nunca tokens ni datos personales completos.
- En `SIGTERM`: cerrar sesiones y transportes antes de salir.

---

## 8. Hosting e infraestructura (us-east-1)

Todo vive en us-east-1, la región que exige el bridge para Bedrock.

| Recurso | Configuración |
|---|---|
| ECR | repositorio `counterpart` |
| ECS Express Mode | un servicio, 0.25 vCPU / 0.5 GB, puerto 3000, health check `/ping`, **mínimo y máximo 1 tarea** |
| Balanceador (lo crea Express Mode) | HTTPS; idle timeout 300 s |
| DynamoDB | tabla `counterpart`, on-demand |
| Secrets Manager | tokens de los negocios demo para el bridge |
| CloudWatch Logs | retención de 14 días |

- **Despliegue:** `infra/deploy.sh` construye la imagen, la sube a ECR y crea el servicio con `aws ecs create-express-gateway-service` la primera vez, o actualiza la imagen en los despliegues siguientes.
- **Requisito de Express Mode:** VPC por defecto con al menos 2 subnets públicas en 2 zonas de disponibilidad.
- **Una sola tarea es una decisión consciente:** las sesiones viven en memoria. Escalar requiere sesiones compartidas o modo stateless; queda documentado en el README.
- **Costo estimado:** ~$25–35 al mes (balanceador + Fargate; DynamoDB y logs casi $0), más las invocaciones de Bedrock del bridge. Entra en los $150 de créditos hasta el 3 de diciembre.

---

## 9. Datos semilla

Deterministas (semilla fija) y regenerables con `npm run seed -- <perfil>`.

- **Taller:** 40 ítems (12 de mano de obra, 28 partes y fluidos; 5 por debajo del punto de reorden), 3 proveedores, 25 clientes con vehículo, 12 órdenes abiertas repartidas en todas las etapas, 30 días de cobros con patrón semanal. Exactamente un Civic y una F-150 (los del guion) y dos Camry (para probar ambigüedad).
- **Pastelería:** 30 ítems (productos, ingredientes e insumos; 4 bajos), 2 proveedores, 20 clientes, 10 órdenes abiertas con `due` en los próximos 7 días (3 para el sábado), 30 días de cobros.

---

## 10. Superficies de demo

### 10.1 Voz: alexa-skill-mcp-bridge

- Proyecto open source (`github.com/KayLerch/alexa-skill-mcp-bridge`). Una Alexa Skill hace de add-on y un agente Strands en Bedrock AgentCore (Amazon Nova 2 Lite) emula el orquestador de Alexa+. Llama a Counterpart por Streamable HTTP con el token guardado en Secrets Manager.
- **Track A** (agente local) para iterar las frases de oro. **Track C** (Skill) para el video, en un Echo o en el simulador de la consola de Alexa.
- Limitaciones conocidas: sin UI, sin OAuth, solo inglés, y el modelo no es el de Alexa+. El propio README advierte que reproduce *"the mechanics of an Alexa+ MCP client, not Alexa's own model judgment."*
- Cómo cambiar de negocio durante el video (actualizar el secreto o tener dos despliegues del bridge) se decide en el spike 4.

### 10.2 Visual: basic-host de ext-apps

Desde `examples/basic-host` del repo de ext-apps: `SERVERS='["http://localhost:3000/mcp"]' npm start` y abrir `http://localhost:8080`. En el video se presenta como la UI de MCP Apps que Alexa+ muestra en dispositivos con pantalla, sin hacerla pasar por una captura de Alexa+.

### 10.3 Criterio de corte

Si el spike 1 o el 4 no funcionan al terminar el día 1, la voz pasa a una web app propia con un agente en Bedrock que llama a Counterpart: la *"simulated Alexa+ experience"* que aceptan las reglas. **El servidor no cambia.**

---

## 11. Pruebas

1. **Unitarias (vitest):** esquema de perfiles (válidos e inválidos); generación de tools e `inputSchema` por perfil; resolver con tabla de casos (número, nombre, posesivo, error de dedo, ambigüedad, consulta vacía); transiciones de etapa; `consumes` y backorder; impuestos y redondeo; resolución de `due` y de periodos alrededor de cambios de semana, de mes y de zona horaria.
2. **Integración:** `Client` ↔ `McpServer` con `InMemoryTransport.createLinkedPair()`. Las 9 tools de cada perfil contra `MemoryStore` y contra `DynamoStore` sobre DynamoDB Local (Docker). Incluye idempotencia, conflictos de versión simulados y respuestas de error.
3. **Contrato HTTP:** servidor real en local. `initialize` negocia `protocolVersion: "2025-11-25"`; sin token → 401; token de otro negocio con un session id válido → rechazado. Revisión manual con MCP Inspector.
4. **Frases de oro:** `test/golden/<perfil>.yaml` con ~20 frases por perfil, cada una con la tool esperada y sus argumentos clave, corridas contra el Track A del bridge. **Meta antes de grabar: 18 de 20 o más por perfil.** Si fallan, se ajustan descripciones y sinónimos, no la lógica.

---

## 12. Spikes (día 1)

Un MCP de juguete con una sola tool (`ping_shop`) sobre el stack elegido (SDK v2).

| # | Qué | Criterio de éxito |
|---|---|---|
| 1 | Bridge Track A contra el juguete en local | El agente llama `ping_shop` y responde. Confirma el acceso a Bedrock / Nova 2 Lite y el formato con el que el bridge envía el token |
| 2 | Juguete desplegado en ECS Express Mode | La URL HTTPS del servicio responde en `/mcp`; `initialize` negocia 2025-11-25; un stream SSE sigue vivo después de 60 s |
| 3 | UI trivial con ext-apps 2.0.0 en basic-host | La UI muestra datos de la tool. Confirma los imports de v2 y si basic-host puede enviar headers de autenticación |
| 4 | Bridge Track C (Skill) contra el juguete desplegado | Respuesta hablada en el simulador de la consola. Define cómo cambiar de negocio en el video |

Corte: §10.3. Si el 2 o el 3 fallan por el SDK v2 → plan B de versiones (§6).

---

## 13. Entregables del hackathon

- **README:** qué es, arquitectura, cómo correr en local (Docker + DynamoDB Local + seed + basic-host), cómo desplegar y cómo conectar el bridge.
- **LICENSE:** MIT.
- **`docs/aws-builder.md`:** servicios de AWS usados, por qué y diagrama (ECS Express Mode, ECR, DynamoDB, Secrets Manager, CloudWatch; Bedrock, AgentCore y Lambda del bridge).
- **`docs/friction-log.md`** (hasta +10%), que se llena mientras se construye. Entradas iniciales: el CLI de Alexa+ no es público; el CLI no soporta Windows y exige Node 24+; Cognito omite `code_challenge_methods_supported`; App Runner cerró a clientes nuevos.
- **`docs/product-feedback.md`**.
- **Video ≤ 3 min** según §4.3, en YouTube.
- **Devpost:** track Alexa+; mini-retos AWS Builder y Open Source.

---

## 14. Siguiente paso documentado: account linking

Para publicar en Alexa+ real con datos separados por negocio:

- Cognito como servidor OAuth 2.1 con PKCE S256 y refresh tokens.
- Counterpart sirve `/.well-known/oauth-protected-resource` (`resource`, `authorization_servers`, `scopes_supported`) y responde 401/403 cuando falta un token válido.
- Como Cognito omite `code_challenge_methods_supported`, Counterpart publica su propio documento de metadatos del servidor de autorización, con `["S256"]` y los endpoints de Cognito, y es ese documento el que figura en `authorization_servers`.
- El `sub` del token OAuth se mapea a `businessId` en lugar del hash de token actual.

---

## 15. Riesgos

| Riesgo | Mitigación |
|---|---|
| El bridge no despliega o Bedrock niega acceso al modelo | Corte de §10.3 al terminar el día 1 |
| El SDK v2 recién salido trae bugs | Versiones exactas; spikes 2 y 3; plan B con v1.30 + ext-apps 1.7.5 |
| Nova 2 Lite elige mal las tools (no es el modelo de Alexa+) | Frases de oro; sinónimos y descripciones; umbral de 18/20 |
| El autoescalado de Express Mode rompe las sesiones en memoria | Mínimo y máximo de 1 tarea |
| Amazon abre el Toolkit durante el hackathon | El servidor ya cumple; publicar requiere §14 |
| No alcanza el tiempo antes del 26 sep | Recortes en este orden: (1) UI del reporte de ventas, que queda en texto; (2) `consumes`; (3) impuestos. **Nunca se recortan:** los 2 perfiles, las 9 tools y el demo por voz |

---

## 16. Hitos (15–26 sep)

| Día | Hito |
|---|---|
| 1 | Spikes 1–4 |
| 2–3 | `profiles` + `domain` + `MemoryStore`, con pruebas primero |
| 4–5 | `tools` + `http` + `DynamoStore` + semillas |
| 6 | MCP Apps |
| 7 | Despliegue + bridge + frases de oro |
| 8 | README, docs, video y submission en Devpost |

---

## 17. Prerrequisitos fuera del código

- Cuenta de AWS y solicitud de los $150 en créditos del hackathon.
- AWS CLI v2 (hoy no está instalado) con perfil en us-east-1.
- Acceso habilitado al modelo Amazon Nova 2 Lite en Bedrock (us-east-1).
- Cuenta de desarrollador de Amazon (Alexa) y ASK CLI.
- Node.js 24 LTS en local (hoy 22.23; el bridge funciona con 22.18+, así que basta con actualizar a 24).
- Docker Desktop (ya instalado) y cuenta de GitHub para el repo público (`gh` ya instalado).
