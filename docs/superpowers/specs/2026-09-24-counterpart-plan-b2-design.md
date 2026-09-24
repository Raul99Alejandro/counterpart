# Counterpart — Plan B2: despliegue, voz y negocios configurables por voz

- **Fecha:** 2026-09-24
- **Estado:** borrador para revisión
- **Base:** [`2026-09-15-counterpart-alexa-mcp-design.md`](2026-09-15-counterpart-alexa-mcp-design.md) (el "spec base"). Este documento lo **extiende**; donde contradice al spec base, manda este.
- **Entradas:** [`../../plan-b-carryover.md`](../../plan-b-carryover.md) (estado tras el Plan B1) y [`../../demo-script.md`](../../demo-script.md).
- **Cierre de submissions:** 23 oct 2026, 1:00 PM CST.

---

## 1. Resumen

El Plan B1 dejó Counterpart completo en local: dos perfiles, nueve tools por perfil, dos MCP Apps y 195 pruebas en verde. El Plan B2 lo lleva a producción y al demo, en dos etapas:

- **Etapa 1, envío temprano (~25–30 sep):** Counterpart desplegado en AWS con ECS Express Mode, dos Skills de Alexa (una por negocio) sobre `alexa-skill-mcp-bridge`, frases de oro contra Nova 2 Lite, video y envío en Devpost.
- **Etapa 2, mejoras sobre lo enviado (~1–8 oct):** negocios configurables sin programar, un **asistente de configuración por voz**, la deuda abierta del Plan B1, interoperabilidad con `basic-host`, y video y envío actualizados.

La Etapa 1 deja un envío válido por sí sola. La Etapa 2 solo lo mejora: Devpost permite editar hasta el cierre.

## 2. Decisiones tomadas

| Decisión | Elección | Motivo |
|---|---|---|
| Alcance | Completo: incluye la deuda abierta del Plan B1 | Calidad del código juzgada en el repo público |
| Calendario | Enviar temprano y seguir mejorando | Un fallo tardío no deja el track sin envío |
| Superficie de voz | Simulador de la consola de Alexa | No hay Echo; el spec base ya lo acepta (§10.1) |
| Cambio de negocio en el video | Una Skill por negocio | Así funciona Alexa+ real: cada negocio instala su add-on |
| Despliegue | Scripts con AWS CLI (`infra/deploy.sh`, `infra/teardown.sh`) | Express Mode crea servicio, balanceador y HTTPS en un comando; el spec base §8 ya lo eligió |
| Negocios nuevos | Perfil y catálogo como datos, sin código | El "un motor, cualquier negocio" se demuestra, no se promete |
| Asistente de configuración | Por voz, con vista del borrador como MCP App | Lo más fácil para el usuario; la vista web es opcional |
| Plan de la cuenta AWS | Plan de pago, justo antes del primer despliegue | Bedrock AgentCore es exclusivo del plan de pago, y ese plan es el único que acepta créditos promocionales |

## 3. Arquitectura

```
  Simulador de la consola de Alexa (voz)
     ├─ "open oak street auto"       ─► Skill + bridge #1 ─┐
     ├─ "open sweet crumb bakery"    ─► Skill + bridge #2 ─┤  Lambda + agente Strands
     └─ "open <negocio nuevo>"       ─► Skill + bridge #3 ─┘  en AgentCore (Nova 2 Lite)
                                                             │ MCP · Streamable HTTP · Bearer
                                                             ▼
        ┌──────────────── Counterpart (ECS Express Mode, 1 tarea) ────────────────┐
        │ http/    /ping · /mcp · token → negocio · allowedHosts · tope de sesiones│
        │ tools/   negocio activo → sus 9 tools · negocio en blanco → tools de alta│
        │ setup/   borrador con Nova 2 Lite (Bedrock) · validación · activación    │
        │ ui/      snapshot · sales report · borrador de configuración             │
        │ store/   DynamoStore ────────────────────────────────► DynamoDB          │
        └───────────────────────────────────────┬─────────────────────────────────┘
                                                ▼
                                   CloudWatch Logs (JSON por línea)

  Vista web de las MCP Apps: basic-host de ext-apps ──► el mismo /mcp
```

Cambios de fondo respecto al spec base:

1. **El perfil de un negocio es un dato, no un archivo.** Vive en DynamoDB junto al negocio. Los YAML de `src/profiles/` pasan a ser **plantillas**: se siembran desde ahí y el servidor ya no los lee en tiempo de petición.
2. **Un negocio tiene estado:** `blank` (recién creado, solo expone las tools de alta) o `active` (expone sus nueve tools).
3. **Counterpart llama a Bedrock**, solo desde `setup/`. El resto del servidor sigue sin IA.

## 4. Etapa 1: envío temprano

### 4.1 Paso 0: prerrequisitos fuera del código

- La cuenta de AWS pasa al **plan de pago**. Lo hace el dueño de la cuenta; ningún script lo hace.
- Ya verificado el 2026-09-24: Nova 2 Lite responde en us-east-1 **solo a través de un inference profile**. `amazon.nova-2-lite-v1:0` devuelve `ValidationException`; se usa **`us.amazon.nova-2-lite-v1:0`**, que es también el valor por defecto del bridge.
- La VPC por defecto tiene subnets públicas en 6 zonas de disponibilidad: cumple el requisito de Express Mode (spec base §8).

### 4.2 Spikes (medio día, antes de construir)

| # | Qué | Criterio de éxito | Si falla |
|---|---|---|---|
| S1 | Imagen real de Counterpart en ECS Express Mode | La URL HTTPS responde `/ping`; `initialize` negocia `2025-11-25`; un stream SSE sigue vivo a los 60 s | Revisar el keep-alive y el idle timeout (spec base §7.10) antes de seguir |
| S2 | Dos despliegues del bridge en la misma cuenta | Dos stacks y dos Skills independientes, cada una con su URL de MCP y su secreto | Una sola Skill; se cambia de negocio con un corte en el video |
| S3 | Bridge con `features.catchAll` contra un servidor cuyo `tools/list` cambia después del despliegue de la Skill | Una frase que no casa con ninguna intención del modelo de voz llega al agente y este llama la tool nueva | El negocio nuevo usa `toolIntents: false`, o se regenera y redespliega su Skill tras activarlo |
| S4 | Latencia de generar un borrador con Nova 2 Lite (perfil + catálogo) | Medir p50 y p95 | Confirma o descarta el diseño asíncrono de §5.3 |

S3 y S4 alimentan la Etapa 2, pero se prueban el día 1: si alguno cambia el diseño, se sabe antes de construir.

### 4.3 Despliegue (`infra/deploy.sh`, `infra/teardown.sh`)

Scripts en bash (en Windows corren con Git Bash), con perfil y región por variables de entorno. Idempotentes: correrlos dos veces no duplica nada.

**`deploy.sh`:**

1. Crea, si no existen: el repositorio de ECR `counterpart`, la tabla `counterpart` (on-demand, con TTL en el atributo `expiresAt` para los borradores), el grupo de logs con retención de 14 días y los roles de IAM.
2. **Rol de la tarea con mínimo privilegio:** lectura y escritura solo sobre la tabla `counterpart`, y `bedrock:InvokeModel` solo sobre el inference profile de Nova 2 Lite y sus modelos de destino.
3. Construye la imagen, la etiqueta con el commit y la sube a ECR.
4. La primera vez, `aws ecs create-express-gateway-service` (0.25 vCPU / 0.5 GB, puerto 3000, health check `/ping`, mínimo y máximo 1 tarea). Las siguientes, actualiza la imagen.
5. Lee el hostname que asignó Express Mode y lo pasa como `COUNTERPART_ALLOWED_HOSTS` en una segunda actualización. El hostname solo se conoce después de crear el servicio.
6. Corre `infra/smoke.ts` contra la URL pública (§4.6).

**`teardown.sh`:** borra el servicio de Express Mode (y con él el balanceador), el repositorio de ECR, los secretos, el grupo de logs y la tabla. Al final lista lo que quedó, con una consulta por tipo de recurso, y falla si queda algo. Los stacks del bridge se bajan con su propio `cdk destroy`, y el script lo recuerda al terminar.

**El apagado se prueba en la Etapa 1:** desplegar, bajar, verificar que no quedó nada y volver a desplegar.

### 4.4 Seguridad antes de exponer el servicio

- **`allowedHosts`** en `createMcpExpressApp`, desde `COUNTERPART_ALLOWED_HOSTS`. Sin la variable en producción (`NODE_ENV=production`), el proceso **se niega a arrancar**, igual que ya hace con `COUNTERPART_STORE`.
- **Tokens reales:** `npm run token -- <bizId>` contra la tabla remota guarda solo el hash (ya existe) y ahora además escribe el valor en claro en Secrets Manager, en `counterpart/<bizId>/token`, que es de donde lo lee el bridge. El valor no se imprime en la terminal. Los `DEMO_TOKENS` nunca se instalan en la tabla remota (ya garantizado en B1).
- **Tope de sesiones por token:** 10 sesiones abiertas por negocio. La número 11 recibe HTTP 429 y un log `warn`. Las sesiones inactivas siguen cerrándose a los 30 minutos.
- **Logs a CloudWatch:** stdout del contenedor, que es donde ya escribe `log.ts`. Nunca tokens ni la petición completa (ya garantizado en B1).

### 4.5 Voz

- Un clon del bridge **fuera del repo de Counterpart**: es de terceros (Apache-2.0) y tiene su propio ciclo de despliegue. Se configura por `.env`, un despliegue por negocio: `BRIDGE_MCP_URL` es la URL pública de `/mcp`, `mcp.auth.type` es `bearer` y `BRIDGE_MCP_SECRET_NAME` es `counterpart/<bizId>/token`.
- Nombres de invocación: `oak street auto` y `sweet crumb bakery`.
- La configuración exacta de cada despliegue se documenta en el README de Counterpart, en la sección "Connect the Alexa bridge" (spec base §13).
- Las siete frases del guion se prueban en el simulador antes de grabar.

### 4.6 Frases de oro

- Un runner (`npm run golden -- <perfil>`) lee `test/golden/<perfil>.yaml` y manda cada frase **en orden, en una sola sesión y con semilla fresca** al agente del bridge en modo local (Track A). Compara la tool elegida y sus argumentos clave con lo esperado y deja un informe con aciertos y fallos.
- Si el Track A no se puede manejar desde un script, el runner llama a Nova 2 Lite por la API Converse de Bedrock con el mismo `tools/list` y el mismo prompt de sistema del bridge. El informe dice cuál de los dos modos se usó.
- **Meta: 18 de 20 o más por perfil.** Lo que falle se corrige en descripciones y sinónimos de las tools, nunca en las frases.
- Si Nova 2 Lite no llega a la meta después de dos rondas de ajustes, se usa el modelo alternativo que el bridge ya documenta (`fallbackModelId`, Claude Haiku 4.5 en Bedrock), y se anota en el friction log.

### 4.7 Humo remoto

`infra/smoke.ts` se amplía para correr contra la URL pública:

- `/ping` responde 200;
- sin token → 401;
- con token → `initialize` negocia `2025-11-25` y `tools/list` trae las nueve tools del perfil;
- un session id usado con el token de otro negocio → 404;
- una llamada de lectura por negocio responde con texto hablable.

### 4.8 Video y envío (Etapa 1)

- El guion de [`demo-script.md`](../../demo-script.md) se mantiene. Cambia solo el paso 5: el diagrama muestra la arquitectura desplegada de §3.
- Se completan `docs/aws-builder.md` (servicios, motivo y diagrama), `docs/friction-log.md` y `docs/product-feedback.md`, más la sección de despliegue y la del bridge en el README.
- Video ≤ 3 min en YouTube. Envío en Devpost: track Alexa+, mini-retos AWS Builder y Open Source.

## 5. Etapa 2: negocios configurables por voz

### 5.1 Negocio sin programar

**Modelo de datos (se suma al §7.3 del spec base):**

| Entidad | PK | SK | Atributos |
|---|---|---|---|
| Negocio | `BIZ#<bizId>` | `META` | los del spec base, más `status` (`blank` · `active`) y **sin** `profileId` |
| Perfil | `BIZ#<bizId>` | `PROFILE` | `profile` (JSON validado con `parseProfile`), `source` (`template:<id>` · `assistant`), `version` |
| Borrador | `BIZ#<bizId>` | `DRAFT` | `description`, `state` (`generating` · `ready` · `failed`), `profile?`, `catalog?`, `error?`, `createdAt`, `expiresAt` (TTL de 24 h) |

- Todo negocio existente se migra a `status: active`, con su perfil copiado de la plantilla. La siembra lo hace así desde el principio.
- **El servidor carga el perfil desde el store** al abrir la sesión y lo cachea por `(bizId, version)`. Esto cierra también la deuda de B1 de "leer y parsear el YAML en cada petición".

**Paquete de negocio**, una carpeta por negocio en `seed/businesses/<bizId>/`:

- `business.yaml`: nombre, zona horaria, tasa de impuesto, número de orden inicial y la plantilla de perfil (o un perfil propio);
- `catalog.yaml`: ítems (nombre, sinónimos, tipo, unidad, precio, gravable, stock, punto y cantidad de reorden, proveedor, `consumes`) y proveedores.

Lo que no es configuración (clientes, órdenes abiertas y 30 días de cobros) lo sigue generando la siembra de forma determinista a partir del catálogo. Así un negocio nuevo sale con historia para las gráficas sin escribir código. Los clientes y activos fijos del guion (Dana Lee y su Civic, Nina Patel y su CX-5, etc.) se mueven a un `demo.yaml` opcional del paquete.

**Comandos nuevos:**

- `npm run business:check -- <carpeta>` valida el paquete con los mismos esquemas del servidor y dice el campo exacto y cómo arreglarlo.
- `npm run business:add -- <carpeta>` lo siembra y emite su token (§4.4).
- `npm run business:new -- <bizId> "<nombre>"` crea un negocio **en blanco** con su token, para el asistente (§5.2).

**Guía:** `docs/add-a-business.md`, "agrega tu negocio en 15 minutos". Incluye un tercer paquete de ejemplo, creado a mano sin tocar código, que sirve de prueba.

### 5.2 Asistente de configuración: flujo

Un negocio `blank` expone **solo** tres tools, con el mismo contrato de respuesta del §7.7 del spec base (texto hablable + `structuredContent`):

| Tool | Entrada | Qué hace |
|---|---|---|
| `set_up_my_business` | `description` (texto libre) | Arranca la generación del borrador y responde de inmediato: *"I'm drafting your setup. Ask me what I came up with in a few seconds."* |
| `review_business_setup` | ninguna | Si el borrador está listo, lo resume en dos oraciones (tipo de negocio, etapas, número de ítems) y pregunta si se activa. Si sigue generándose, lo dice. Si falló, dice qué faltó y pide más detalle. Lleva la UI `ui://counterpart/setup.html` |
| `activate_business_setup` | `confirm` (booleano) | Con `true`, escribe perfil y catálogo, pone `status: active` y responde cómo empezar (*"Your flower shop is ready. Try: what orders are due today?"*). Con `false`, descarta el borrador |

- **Seguridad:** las tools de alta solo existen en negocios `blank` y solo escriben en el negocio del token. No hay tool que cree negocios: eso lo hace el operador con `business:new`. En un negocio `active`, las tools de alta no existen.
- **Tope de costo:** 5 borradores por negocio por hora. El sexto responde que espere.
- **Después de activar**, el servidor reemplaza en la misma sesión las tres tools de alta por las nueve del perfil y envía `notifications/tools/list_changed`. Si el bridge no refresca su lista (S3), la siguiente sesión ya las ve, y la respuesta de activación lo dice: *"Open me again to start."*

### 5.3 Asistente de configuración: generación y validación

- **Asíncrono por diseño:** el bridge le da al agente 6.5 s por turno y generar perfil más catálogo puede tardar más. La generación corre en el proceso (hay una sola tarea) y deja el resultado en el registro `DRAFT`. Si S4 mide un p95 menor a 3 s, se permite responder en el mismo turno, pero el contrato de tres tools no cambia.
- **Llamada a Nova 2 Lite** por Converse con *tool use* forzado. El esquema JSON de la herramienta se deriva de los esquemas zod de perfil y catálogo (`z.toJSONSchema`), de modo que haya **una sola fuente de verdad**.
- **Validación en capas:**
  1. el esquema zod;
  2. `parseProfile` (etapas, `closeFrom`, ids reservados, nombres de tools únicos);
  3. reglas propias del asistente: nombres de tools que no choquen con los de alta, como máximo 8 etapas, entre 5 y 60 ítems, precios mayores que 0, `consumes` solo hacia ítems existentes y sin ciclos.
- **Una reparación:** si la validación falla, se devuelve a Nova la lista de errores exacta para un segundo intento. Si también falla, el borrador queda `failed` con un mensaje hablable de qué faltó (*"I couldn't tell how an order moves from start to finish. What steps does an order go through?"*).
- **Nunca se activa nada sin `confirm: true`.** Un borrador sin confirmar caduca a las 24 h (TTL).

### 5.4 UI del borrador (`ui://counterpart/setup.html`)

Misma técnica que las dos MCP Apps existentes (Vite, un solo HTML, datos por `structuredContent`). Muestra:

- el nombre del negocio y los sustantivos (*order*, *item*…);
- las etapas como una línea de pasos, marcando la de cierre;
- los campos que pide una orden;
- el catálogo en una tabla (nombre, tipo, precio y stock).

El texto de la tool basta por sí solo, como exige el §7.9 del spec base.

### 5.5 Deuda del Plan B1 (de `plan-b-carryover.md`)

**Entra, en este orden:**

1. `putPurchaseOrders` en una sola transacción.
2. `createdAt` en las filas de token.
3. Mismo comportamiento de los dos stores ante un negocio inexistente.
4. `ui/*/main.ts` y `ui/vite.config.ts` dentro del chequeo de tipos.
5. Gráfica de ventas con etiquetas de fecha y la serie del periodo anterior.
6. **`this_week` contra `last_week` compara días equivalentes:** la semana en curso hasta hoy contra los mismos días de la semana anterior. **Esto cambia el §7.4 del spec base**, que comparaba contra la semana completa. `this_month` contra `last_month` sigue la misma regla.
7. El §5 completo del carryover: concordancia `was/were`, `notFound` en singular, `pickBest` único para `findItem` y `resolveOrder`, guardas de cantidad, "closest matches" sin puntaje 0, limpieza de `package.json`, y los "detalles con consecuencias acotadas" (método de pago registrado en `alreadyClosed`, número de orden quemado, servidor y transporte huérfanos sin `initialize`, rama muerta de `moveStage`, borde de la ventana de deduplicación).
8. Instrucciones de `basic-host` en el README.

### 5.6 Interoperabilidad

Se clona `examples/basic-host` de ext-apps y se abren las tres UIs (snapshot, sales report y borrador) contra el servidor local y contra el desplegado. Lo que se encuentre de conformidad va al friction log. De aquí salen las tomas de pantalla del video.

### 5.7 Video y envío actualizados

El video se rehace con una escena nueva en lugar del paso 4 del guion actual: un negocio en blanco se configura hablando, y se opera con dos frases. La pastelería se sigue mencionando como segundo perfil en el diagrama y en el texto. La duración sigue en ≤ 3 min. Se actualiza la descripción en Devpost.

### 5.8 Regla de corte

- **Si el asistente (§5.2–5.4) no está sólido el 6 oct**, se deja fuera sin tocar nada más: sus tools solo existen en negocios `blank`, y ninguno de los negocios del demo lo es. El §5.1 queda de todas formas, y el video de la Etapa 1 sigue siendo el envío.
- Si falta tiempo en general, se recorta en este orden: (1) la deuda menor del punto 7 de §5.5; (2) la UI del borrador, que queda en texto; (3) la interoperabilidad, que queda como verificación por HTTP directo.

## 6. Pruebas

- **Todo con pruebas primero**, igual que en A y B1. La suite entera (hoy 195) pasa en cada tarea.
- **Perfiles como datos:**
  - contrato del store para `PROFILE` y `DRAFT` en `MemoryStore` y `DynamoStore`;
  - migración de un negocio con plantilla a perfil guardado;
  - caché invalidada por versión.
- **Paquetes de negocio:** `business:check` con paquetes válidos e inválidos (cada regla con su caso) y una siembra determinista desde carpeta.
- **Asistente:**
  - el generador se inyecta como dependencia, así que las pruebas usan respuestas grabadas (válidas, inválidas reparables e irreparables) y nunca llaman a Bedrock;
  - una sola prueba manual contra Nova, marcada y fuera de `npm test`;
  - flujo completo: `blank` → borrador → revisión → activación → `tools/list` con las nueve tools;
  - aislamiento: el token de un negocio no ve ni toca el borrador de otro;
  - las tools de alta no existen en un negocio `active`;
  - el tope de borradores por hora.
- **HTTP:** `allowedHosts` rechaza otro Host, el arranque falla sin la variable en producción, y la sesión 11 recibe 429.
- **Remoto:** el humo de §4.7 después de cada despliegue.
- **Voz:** frases de oro (§4.6) y el guion en el simulador antes de cada grabación.

## 7. Riesgos

| Riesgo | Mitigación |
|---|---|
| El bridge no admite dos despliegues en una cuenta (S2) | Una Skill; cambio de negocio con corte en el video |
| Nova 2 Lite elige mal las tools | Descripciones y sinónimos; después `fallbackModelId` (§4.6) |
| La Skill del negocio nuevo no ve las tools activadas (S3) | `toolIntents: false` o redesplegar su Skill tras activarlo |
| Generar el borrador supera el turno de 6.5 s | Diseño asíncrono de §5.3 |
| Nova genera configuraciones inválidas o absurdas | Validación en capas, una reparación, confirmación obligatoria, topes de ítems y etapas |
| Costo del asistente por abuso | Solo en negocios `blank`, que crea el operador; 5 borradores por hora |
| El servicio sigue encendido después del hackathon | `teardown.sh` probado en la Etapa 1; apagado el 23 oct |
| Express Mode rompe las sesiones en memoria al escalar | Mínimo y máximo de 1 tarea (spec base §8) |

## 8. Costos

Aproximados, precios de lista de us-east-1, con el servicio encendido 24 h:

| Recurso | Al mes |
|---|---|
| Balanceador de Express Mode | $17–19 |
| IPv4 públicas (balanceador y tarea) | $7–11 |
| Fargate 0.25 vCPU / 0.5 GB | ~$9 |
| Secrets Manager (3 secretos) | ~$1.20 |
| DynamoDB, ECR, CloudWatch Logs | < $1 |
| AgentCore (3 bridges, solo mientras procesan) | $0–3 |
| Bedrock: Nova 2 Lite (agente, frases de oro y asistente) | < $2 |
| Lambda de las Skills | $0 (capa gratuita) |
| **Total** | **~$35–45** |

Desplegado del ~26 sep al 23 oct: **~$30–40**, dentro de los $100 de bienvenida de la cuenta, sin contar los $150 del hackathon.

## 9. Fechas

| Fechas | Qué |
|---|---|
| 25 sep | Paso 0 y spikes S1–S4 |
| 25–28 sep | Despliegue, seguridad, bridges, frases de oro |
| 29–30 sep | Video y **envío de la Etapa 1** |
| 1–2 oct | Negocio sin programar (§5.1) |
| 3–6 oct | Asistente (§5.2–5.4); **corte el 6 oct** |
| 6–7 oct | Deuda de B1 e interoperabilidad |
| 8 oct | Video y envío actualizados |
| 23 oct | Cierre de submissions y `teardown.sh` |

## 10. Fuera de alcance

- Negocios por citas o reservas: otro motor, no otro perfil.
- Crear negocios por voz: lo hace el operador con `business:new`. El asistente solo configura un negocio en blanco.
- Editar por voz un negocio ya activo (cambiar etapas o precios).
- Account linking y OAuth: siguen documentados en el §14 del spec base, sin construir.
- Más de una tarea de ECS o sesiones compartidas.
