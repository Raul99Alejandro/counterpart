# Counterpart Plan B2, Etapa 1: despliegue, voz y envío temprano — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Counterpart desplegado en AWS (ECS Express Mode + DynamoDB), operado por voz en el simulador de Alexa con una Skill por negocio, con las frases de oro medidas contra Nova 2 Lite, y el video y el envío en Devpost hechos.

**Architecture:** El servidor gana tres protecciones para exponerse a internet (validación de `Host` solo en `/mcp`, tope de sesiones por negocio, tokens reales en Secrets Manager). Dos scripts en bash crean y destruyen toda la infraestructura con el AWS CLI. Un runner de frases de oro habla con Nova 2 Lite por la API Converse contra un servidor local recién sembrado. La voz usa un fork de `alexa-skill-mcp-bridge` con dos parches (nombre de stack y nombre de invocación por `.env`), desplegado una vez por negocio.

**Tech Stack:** Node.js 24, TypeScript ESM, MCP SDK 2.0.0 (`server`, `node`, `express`, `client`), AWS SDK v3 (`client-dynamodb`, `lib-dynamodb`, `client-secrets-manager`, `client-bedrock-runtime`), AWS CLI v2, Docker, bash (Git Bash en Windows), vitest.

**Spec:** `docs/superpowers/specs/2026-09-24-counterpart-plan-b2-design.md` (§1–§4, §6–§9). Base: `docs/superpowers/specs/2026-09-15-counterpart-alexa-mcp-design.md`.

**Contexto previo:** Planes A y B1 completos en `main`: 195 pruebas en verde. La Etapa 2 del spec B2 (§5) tiene su propio plan, que se escribe al cerrar esta etapa con los resultados de los spikes S3 y S4.

## Global Constraints

- **Protocolo MCP `2025-11-25`.** Paquetes MCP en versión exacta `2.0.0`, sin `^`.
- **AWS SDK v3** con `^3.1133.0`. Los paquetes nuevos (`@aws-sdk/client-secrets-manager`, `@aws-sdk/client-bedrock-runtime`) van en `devDependencies`: solo los usan scripts de `infra/`, nunca el servidor.
- **Región `us-east-1`.** Modelo: **`us.amazon.nova-2-lite-v1:0`** (inference profile). El ID sin `us.` devuelve `ValidationException` (verificado el 2026-09-24).
- **Nombres fijos en AWS:** servicio de Express Mode `counterpart` en el cluster `default`; repositorio de ECR `counterpart`; tabla `counterpart` (`pk`/`sk` string, on-demand, TTL en `expiresAt`); grupo de logs `/ecs/counterpart` con 14 días de retención; secretos `counterpart/<bizId>/token`; roles `counterpart-execution`, `counterpart-task` y `counterpart-infrastructure`.
- **Servicio:** 0.25 vCPU (`256`), 512 MiB, x86_64, puerto `3000`, health check `/ping`, mínimo y máximo **1** tarea.
- **Nada del repo público lleva datos de la cuenta:** ni número de cuenta, ni ARNs, ni URLs del servicio, ni tokens. Los scripts los calculan en tiempo de ejecución.
- **Credenciales y sesiones de AWS, Amazon y GitHub las maneja el dueño de la cuenta.** Ningún paso escribe una contraseña ni imprime un token en la terminal. Los pasos marcados **[dueño]** los hace él.
- **Logs:** un JSON por línea en stdout, con `level` en `info`, `warn` o `error`. Nunca un token.
- **Texto hablado en inglés (en-US), comentarios de código en español**, TypeScript ESM con imports `.js`, zod v4 como `import * as z from 'zod/v4'`.
- **Verificación al cerrar cada tarea con código:** `npm test` en verde, `npm run typecheck` limpio y `npm run build` limpio. Hoy hay 195 pruebas: ninguna se borra ni se debilita.
- Un commit por tarea como mínimo, en inglés, estilo conventional commits. `git push` solo cuando lo pida el dueño.

## Review Focus

1. **El health check del balanceador llega con `Host: <ip-de-la-tarea>:3000`.** Si la validación de `Host` se aplica a toda la app (como hace `createMcpExpressApp({ allowedHosts })`), `/ping` responde 403, la tarea nunca queda sana y el servicio no arranca. Se espera que `/ping` responda 200 con cualquier `Host` y que solo `/mcp` valide. Prueba en la Task 2.
2. **Primer despliegue sin hostname todavía.** El hostname público solo existe después de crear el servicio, y en producción el proceso se niega a arrancar sin `COUNTERPART_ALLOWED_HOSTS`. Se espera que el valor `bootstrap` lo deje arrancar con `/ping` sano y `/mcp` cerrado (503), nunca abierto. Prueba en la Task 2.
3. **Un `Host` con puerto o en mayúsculas** (`Counterpart.Example:443`) debe aceptarse si el hostname coincide, igual que la validación del SDK, que ignora el puerto. Prueba en la Task 2.
4. **Emitir de nuevo el token de un negocio que ya tiene secreto.** Se espera que se actualice el valor del mismo secreto (no un error de "ya existe" ni un secreto duplicado), y que el token viejo siga guardado como hash hasta que se resiembre. Prueba en la Task 4.
5. **Una sesión que se cierra libera su cupo.** Con el tope de sesiones, una sesión cerrada con `DELETE /mcp` o barrida por inactividad debe dejar abrir otra. Si no, el bridge se queda sin sesiones tras algunas pruebas. Prueba en la Task 3.

---

## File Structure

| Archivo | Tarea | Responsabilidad |
|---|---|---|
| `docs/b2-spikes.md` | 1, 6, 8 | Resultados de los spikes S1–S4, sin datos de la cuenta |
| `infra/spikes/nova-latency.ts` | 1 | Mide la latencia de generar un borrador con Nova 2 Lite (S4) |
| `src/http/hosts.ts` | 2 | Política de hosts desde el entorno: `any`, `list` o `closed` |
| `src/http/app.ts` | 2, 3 | Validación de `Host` solo en `/mcp`; tope de sesiones → 429 |
| `src/http/sessions.ts` | 3 | `countFor(businessId)` |
| `src/log.ts` | 3 | Nivel `warn` |
| `src/index.ts` | 2 | Lee la política de hosts |
| `infra/token.ts`, `infra/create-token.ts` | 4 | Emitir un token y, con `--secret`, guardarlo en Secrets Manager |
| `infra/smoke-checks.ts`, `infra/smoke.ts` | 5 | Humo remoto: ping, 401, versión, nueve tools, aislamiento entre negocios |
| `infra/sse-probe.ts` | 6 | Cuánto vive un stream SSE a través del balanceador (S1) |
| `infra/deploy.sh`, `infra/teardown.sh`, `infra/iam/*.json` | 6 | Infraestructura con AWS CLI |
| `infra/golden/match.ts`, `infra/golden/runner.ts`, `infra/golden/cli.ts` | 7 | Frases de oro contra Nova 2 Lite |
| `src/tools/specs.ts` | 7 | Ajustes de descripciones y sinónimos que pidan las frases de oro |
| `tsconfig.build.json` | 4 | Los scripts de `infra/` quedan fuera de la imagen |
| `README.md`, `docs/aws-builder.md`, `docs/friction-log.md`, `docs/product-feedback.md`, `docs/demo-script.md` | 9 | Entregables del envío |
| Fork `Raul99Alejandro/alexa-skill-mcp-bridge` | 8 | Stack e invocación por `.env` |

---

## Task 1: Prerrequisitos y spikes baratos (S2 y S4)

Sin código del servidor. Deja escrito en `docs/b2-spikes.md` lo que cambia decisiones antes de construir.

**Files:**
- Create: `docs/b2-spikes.md`
- Create: `infra/spikes/nova-latency.ts`
- Modify: `package.json` (devDependency `@aws-sdk/client-bedrock-runtime`)

**Interfaces:**
- Produces: `docs/b2-spikes.md` con las secciones `S1` … `S4`. Las tareas 6 y 8 completan S1 y S3.

- [ ] **Step 1 [dueño]: pasar la cuenta al plan de pago**

Consola de AWS, como raíz: *Billing and Cost Management → Upgrade plan → Upgrade account*. Confirmar en la misma página que ya dice "Paid plan".

- [ ] **Step 2 [dueño]: sesión de AWS en una terminal nueva**

```bash
aws sso login --profile counterpart
aws sts get-caller-identity --profile counterpart --query Account --output text
```

Expected: imprime el número de cuenta. En el resto del plan, `AWS_PROFILE=counterpart` y `AWS_REGION=us-east-1` están exportados en esa terminal.

- [ ] **Step 3: instalar el cliente de Bedrock**

```bash
npm install --save-dev @aws-sdk/client-bedrock-runtime@^3.1133.0
```

- [ ] **Step 4: escribir el script de latencia (S4)**

`infra/spikes/nova-latency.ts`:

```ts
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

// Spike S4: cuánto tarda Nova 2 Lite en generar un borrador de negocio (perfil + catálogo)
// con tool use forzado. Uso: npx tsx infra/spikes/nova-latency.ts [corridas]
const runs = Number(process.argv[2] ?? 5);
const modelId = process.env.NOVA_MODEL_ID ?? 'us.amazon.nova-2-lite-v1:0';
const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? 'us-east-1' });

const description = 'I run a flower shop. We make arrangements for weddings and events. '
  + 'Orders get designed, then arranged, then they are ready for pickup. '
  + 'We stock roses, lilies, tulips, vases, ribbon and floral foam.';

// Un esquema del tamaño aproximado del real (perfil + catálogo): lo que importa aquí es el tiempo.
const schema = {
  type: 'object',
  required: ['nouns', 'stages', 'items'],
  properties: {
    nouns: { type: 'object', properties: { order: { type: 'string' }, item: { type: 'string' } }, required: ['order', 'item'] },
    stages: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, label: { type: 'string' } }, required: ['id', 'label'] } },
    items: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'kind', 'priceCents'],
        properties: {
          name: { type: 'string' }, kind: { type: 'string', enum: ['product', 'labor', 'supply', 'ingredient', 'part'] },
          priceCents: { type: 'integer' }, onHand: { type: 'integer' }, reorderPoint: { type: 'integer' }
        }
      }
    }
  }
};

const times: number[] = [];
for (let i = 0; i < runs; i += 1) {
  const started = performance.now();
  const out = await client.send(new ConverseCommand({
    modelId,
    system: [{ text: 'You configure order-based small businesses. Call the tool exactly once.' }],
    messages: [{ role: 'user', content: [{ text: description }] }],
    toolConfig: {
      tools: [{ toolSpec: { name: 'draft_business', description: 'Draft the business setup', inputSchema: { json: schema } } }],
      toolChoice: { tool: { name: 'draft_business' } }
    }
  }));
  const ms = Math.round(performance.now() - started);
  times.push(ms);
  const used = out.message?.content?.some(block => 'toolUse' in block && block.toolUse);
  console.log(`corrida ${i + 1}: ${ms} ms, tool use: ${used ? 'sí' : 'no'}`);
}

times.sort((a, b) => a - b);
const pct = (p: number) => times[Math.min(times.length - 1, Math.ceil((p / 100) * times.length) - 1)];
console.log(`p50 ${pct(50)} ms · p95 ${pct(95)} ms · n=${times.length}`);
```

- [ ] **Step 5 [dueño o agente con permiso]: correr S4**

```bash
npx tsx infra/spikes/nova-latency.ts 10
```

Expected: 10 líneas con `tool use: sí` y una línea final `p50 … ms · p95 … ms`. Cuesta centavos.

- [ ] **Step 6: spike S2 contra el bridge, sin desplegar nada**

```bash
cd D:/Repos/amazon-hackathon-2026
git clone https://github.com/KayLerch/alexa-skill-mcp-bridge.git bridge-spike
cd bridge-spike
npm install
grep -rn "AlexaMcpBridgeStack" --include=*.ts --include=*.mjs --include=*.json . | grep -v node_modules
npx tsc -b
cd infra && npx cdk synth --quiet -o ../cdk.out.a && cd ..
grep -n '"FunctionName"\|"RoleName"\|"LogGroupName"\|"AgentRuntimeName"\|"Name"' cdk.out.a/AlexaMcpBridgeStack.template.json | head -40
```

Anotar: (a) cada archivo que nombra `AlexaMcpBridgeStack`; (b) cada recurso con nombre físico fijo en la plantilla. Un nombre físico fijo choca en un segundo despliegue en la misma cuenta. Esa lista es la que parchea la Task 8.

- [ ] **Step 7: escribir `docs/b2-spikes.md`**

```markdown
# Spikes del Plan B2

Resultados de los spikes del spec B2 §4.2. Sin datos de la cuenta: ni número, ni ARNs, ni URLs.

## S1 — Counterpart en ECS Express Mode
Pendiente: se corre en la Task 6 del plan de la Etapa 1.

## S2 — Dos despliegues del bridge en una cuenta
- Archivos que fijan el nombre del stack: <lista del Step 6>
- Recursos con nombre físico fijo: <lista del Step 6, o "ninguno">
- Decisión: <"parche de nombre de stack basta" | "además hay que parametrizar: …">

## S3 — Frase libre con tools que cambian después del despliegue
Pendiente: se corre en la Task 8.

## S4 — Latencia de un borrador con Nova 2 Lite
- 10 corridas, esquema del tamaño del real: p50 <n> ms, p95 <n> ms.
- Decisión para la Etapa 2: <"asíncrono (p95 ≥ 3 s)" | "se permite en el mismo turno (p95 < 3 s)">
```

Los `<…>` se reemplazan con los resultados reales antes del commit. No se commitea un marcador.

- [ ] **Step 8: commit**

```bash
git add package.json package-lock.json infra/spikes/nova-latency.ts docs/b2-spikes.md
git commit -m "chore: record the bridge and Nova latency spikes for Plan B2"
```

---

## Task 2: Validación de `Host` solo en `/mcp`

**Files:**
- Create: `src/http/hosts.ts`
- Modify: `src/http/app.ts:18-32`
- Modify: `src/index.ts:8-23`
- Test: `test/unit/hosts.test.ts`, `test/integration/hosts-http.test.ts`

**Interfaces:**
- Produces: `type HostPolicy = { kind: 'any' } | { kind: 'list'; hosts: string[] } | { kind: 'closed' }`; `hostPolicy(env: NodeJS.ProcessEnv): HostPolicy`; `createApp(deps: { store: Store; devBusinessId?: string; host: string; hosts?: HostPolicy; maxSessionsPerBusiness?: number })`. `hosts` por defecto es `{ kind: 'any' }`. `maxSessionsPerBusiness` lo usa la Task 3.

- [ ] **Step 1: prueba de la política**

`test/unit/hosts.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { hostPolicy } from '../../src/http/hosts.js';

describe('política de hosts', () => {
  it('fuera de producción y sin variable, acepta cualquier host', () => {
    expect(hostPolicy({})).toEqual({ kind: 'any' });
  });

  it('lee una lista separada por comas, sin espacios, en minúsculas y sin vacíos', () => {
    expect(hostPolicy({ COUNTERPART_ALLOWED_HOSTS: ' Counterpart.Example , ,other.example ' }))
      .toEqual({ kind: 'list', hosts: ['counterpart.example', 'other.example'] });
  });

  it('bootstrap cierra /mcp mientras no se conoce el hostname', () => {
    expect(hostPolicy({ NODE_ENV: 'production', COUNTERPART_ALLOWED_HOSTS: 'bootstrap' })).toEqual({ kind: 'closed' });
  });

  it('en producción se niega a arrancar sin la variable', () => {
    expect(() => hostPolicy({ NODE_ENV: 'production' })).toThrow(/COUNTERPART_ALLOWED_HOSTS/);
  });

  it('en producción se niega a arrancar con la variable vacía', () => {
    expect(() => hostPolicy({ NODE_ENV: 'production', COUNTERPART_ALLOWED_HOSTS: ' , ' })).toThrow(/COUNTERPART_ALLOWED_HOSTS/);
  });
});
```

- [ ] **Step 2: correrla y verla fallar**

Run: `npx vitest run test/unit/hosts.test.ts`
Expected: FAIL, `Cannot find module '../../src/http/hosts.js'`.

- [ ] **Step 3: implementar `src/http/hosts.ts`**

```ts
/** Qué valores de Host acepta /mcp. /ping nunca se valida: el balanceador lo llama con la IP de la tarea. */
export type HostPolicy = { kind: 'any' } | { kind: 'list'; hosts: string[] } | { kind: 'closed' };

/**
 * Lee COUNTERPART_ALLOWED_HOSTS. "bootstrap" es el valor del primer despliegue, cuando el hostname
 * público todavía no existe: el proceso arranca sano y /mcp queda cerrado hasta la actualización.
 */
export function hostPolicy(env: NodeJS.ProcessEnv): HostPolicy {
  const raw = env.COUNTERPART_ALLOWED_HOSTS?.trim();
  if (raw === 'bootstrap') return { kind: 'closed' };
  const hosts = (raw ?? '').split(',').map(h => h.trim().toLowerCase()).filter(h => h.length > 0);
  if (hosts.length > 0) return { kind: 'list', hosts };
  // Fallar cerrado: expuesto a internet, sin lista de hosts solo queda el bearer token delante.
  if (env.NODE_ENV === 'production') {
    throw new Error('En producción (NODE_ENV=production) define COUNTERPART_ALLOWED_HOSTS con el hostname público, o "bootstrap" en el primer despliegue');
  }
  return { kind: 'any' };
}
```

- [ ] **Step 4: correr la prueba unitaria**

Run: `npx vitest run test/unit/hosts.test.ts`
Expected: PASS (5).

- [ ] **Step 5: prueba HTTP**

`test/integration/hosts-http.test.ts`. Usa `node:http` porque `fetch` no deja fijar el header `Host`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../../src/http/app.js';
import type { HostPolicy } from '../../src/http/hosts.js';
import { MemoryStore } from '../../src/store/memory.js';

let server: Server | undefined;
afterEach(() => { server?.close(); server = undefined; });

async function start(hosts: HostPolicy): Promise<number> {
  // host 0.0.0.0 como en el contenedor: así el SDK no agrega su validación de localhost.
  server = createApp({ store: new MemoryStore(), host: '0.0.0.0', hosts }).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server!.once('listening', () => resolve()));
  return (server!.address() as AddressInfo).port;
}

function request(port: number, path: string, hostHeader: string, method = 'GET'): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = http.request({ port, path, method, host: '127.0.0.1', headers: { host: hostHeader, 'content-type': 'application/json' } }, res => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on('error', reject);
    req.end(method === 'POST' ? '{}' : undefined);
  });
}

describe('validación de Host', () => {
  const list: HostPolicy = { kind: 'list', hosts: ['counterpart.example'] };

  it('/ping responde con cualquier Host, como lo llama el health check del balanceador', async () => {
    const port = await start(list);
    expect(await request(port, '/ping', '10.0.3.17:3000')).toBe(200);
  });

  it('/mcp rechaza un Host que no está en la lista', async () => {
    const port = await start(list);
    expect(await request(port, '/mcp', 'evil.example', 'POST')).toBe(403);
  });

  it('/mcp acepta el hostname de la lista aunque traiga puerto o mayúsculas', async () => {
    const port = await start(list);
    // Sin token: pasar la validación de Host se ve como el 401 de la autenticación.
    expect(await request(port, '/mcp', 'Counterpart.Example:443', 'POST')).toBe(401);
  });

  it('con la política cerrada, /mcp responde 503 y /ping sigue sano', async () => {
    const port = await start({ kind: 'closed' });
    expect(await request(port, '/mcp', 'counterpart.example', 'POST')).toBe(503);
    expect(await request(port, '/ping', 'counterpart.example')).toBe(200);
  });

  it('sin política, /mcp no valida el Host', async () => {
    const port = await start({ kind: 'any' });
    expect(await request(port, '/mcp', 'anything.example', 'POST')).toBe(401);
  });
});
```

- [ ] **Step 6: correrla y verla fallar**

Run: `npx vitest run test/integration/hosts-http.test.ts`
Expected: FAIL. `createApp` ignora `hosts`: los casos de 403 y 503 devuelven 401.

- [ ] **Step 7: aplicar la política en `src/http/app.ts`**

Cambiar el import de express y la firma, y montar la validación antes de la ruta `/mcp` (después de `app.get('/ping', …)`):

```ts
import { createMcpExpressApp, hostHeaderValidation } from '@modelcontextprotocol/express';
import type { HostPolicy } from './hosts.js';
```

```ts
export function createApp(deps: {
  store: Store; devBusinessId?: string; host: string; hosts?: HostPolicy; maxSessionsPerBusiness?: number;
}): Express {
```

```ts
  // Solo /mcp: el health check de /ping llega con la IP de la tarea como Host.
  const hosts = deps.hosts ?? { kind: 'any' };
  if (hosts.kind === 'list') app.use('/mcp', hostHeaderValidation(hosts.hosts));
  if (hosts.kind === 'closed') {
    app.use('/mcp', (_req: Request, res: Response) => { res.status(503).json({ error: 'not configured' }); });
  }
```

La línea `const app = createMcpExpressApp({ host: deps.host });` no cambia. **No** se pasa `allowedHosts` a `createMcpExpressApp`: lo aplicaría a toda la app, `/ping` incluido.

- [ ] **Step 8: leer la política al arrancar, en `src/index.ts`**

Agregar el import y pasar `hosts` a `createApp`:

```ts
import { hostPolicy } from './http/hosts.js';
```

```ts
const hosts = hostPolicy(process.env);
const app = createApp({ store, host, devBusinessId, hosts });
const httpServer = app.listen(port, host, () => {
  log({ level: 'info', msg: 'listening', port, host, store: cfg.kind, hosts: hosts.kind });
});
```

- [ ] **Step 9: correr todo**

Run: `npm test && npm run typecheck && npm run build`
Expected: todo en verde, 195 + 10 pruebas.

- [ ] **Step 10: `docker-compose.yml` sigue arrancando**

La imagen fija `NODE_ENV=production`, así que el entorno local ahora exige la variable. Agregar al servicio `counterpart`, bajo `environment`:

```yaml
      COUNTERPART_ALLOWED_HOSTS: localhost,127.0.0.1
```

Run: `docker compose up --build -d && curl -s http://localhost:3000/ping && docker compose down`
Expected: `ok`.

- [ ] **Step 11: commit**

```bash
git add src/http/hosts.ts src/http/app.ts src/index.ts docker-compose.yml test/unit/hosts.test.ts test/integration/hosts-http.test.ts
git commit -m "feat: validate the Host header on /mcp and fail closed in production"
```

---

## Task 3: Tope de sesiones por negocio

**Files:**
- Modify: `src/http/sessions.ts`
- Modify: `src/http/app.ts` (antes de `new McpServer`)
- Modify: `src/log.ts:1`
- Test: `test/unit/sessions.test.ts`, `test/integration/session-cap.test.ts`

**Interfaces:**
- Consumes: `createApp(deps.maxSessionsPerBusiness?)` de la Task 2.
- Produces: `Sessions.countFor(businessId: string): number`; `LogEvent.level` acepta `'warn'`; constante `MAX_SESSIONS_PER_BUSINESS = 10` exportada desde `src/http/app.ts`.

- [ ] **Step 1: prueba de `countFor`**

`test/unit/sessions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Sessions, type SessionEntry } from '../../src/http/sessions.js';

// Dobles mínimos: countFor solo mira businessId.
const entry = (businessId: string): SessionEntry => ({
  businessId, lastSeen: 0,
  transport: { close: async () => {} } as unknown as SessionEntry['transport'],
  server: { close: async () => {} } as unknown as SessionEntry['server']
});

describe('Sessions.countFor', () => {
  it('cuenta solo las sesiones del negocio', () => {
    const s = new Sessions();
    s.set('a', entry('b1'));
    s.set('b', entry('b1'));
    s.set('c', entry('b2'));
    expect(s.countFor('b1')).toBe(2);
    expect(s.countFor('b2')).toBe(1);
    expect(s.countFor('b3')).toBe(0);
  });

  it('una sesión cerrada o barrida deja de contar', () => {
    const s = new Sessions();
    s.set('a', entry('b1'));
    s.set('b', entry('b1'));
    s.drop('a');
    expect(s.countFor('b1')).toBe(1);
    s.sweep(10_000, 1_000);
    expect(s.countFor('b1')).toBe(0);
  });
});
```

- [ ] **Step 2: verla fallar**

Run: `npx vitest run test/unit/sessions.test.ts`
Expected: FAIL, `s.countFor is not a function`.

- [ ] **Step 3: implementar `countFor` en `src/http/sessions.ts`**

Dentro de la clase `Sessions`, después de `set`:

```ts
  /** Sesiones abiertas del negocio: el tope por token se compara contra esto. */
  countFor(businessId: string): number {
    let n = 0;
    for (const entry of this.entries.values()) if (entry.businessId === businessId) n += 1;
    return n;
  }
```

- [ ] **Step 4: pasarla**

Run: `npx vitest run test/unit/sessions.test.ts`
Expected: PASS (2).

- [ ] **Step 5: prueba HTTP del tope**

`test/integration/session-cap.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../../src/http/app.js';
import { hashToken } from '../../src/http/auth.js';
import { MemoryStore } from '../../src/store/memory.js';
import type { Business } from '../../src/domain/types.js';

const TOKEN = 'token-tope';
const business: Business = {
  id: 'b1', name: 'Oak Street Auto', profileId: 'auto-repair',
  timezone: 'America/Chicago', taxRateBps: 825, nextOrderNumber: 41, version: 1
};

let server: Server;
let base: string;

beforeAll(async () => {
  const store = new MemoryStore();
  await store.putBusiness(business);
  await store.putToken(hashToken(TOKEN), 'b1');
  server = createApp({ store, host: '127.0.0.1', maxSessionsPerBusiness: 2 }).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => { server.close(); });

const headers = {
  authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream'
};

async function initialize(): Promise<Response> {
  return fetch(`${base}/mcp`, {
    method: 'POST', headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '0' } } })
  });
}

describe('tope de sesiones por negocio', () => {
  it('rechaza con 429 la sesión que pasa del tope y acepta otra cuando una se cierra', async () => {
    const first = await initialize();
    const second = await initialize();
    expect([first.status, second.status]).toEqual([200, 200]);
    await first.body?.cancel();
    await second.body?.cancel();

    const third = await initialize();
    expect(third.status).toBe(429);

    // Cerrar una sesión con DELETE libera su cupo.
    const closing = await fetch(`${base}/mcp`, {
      method: 'DELETE', headers: { ...headers, 'mcp-session-id': first.headers.get('mcp-session-id')! }
    });
    expect(closing.status).toBe(200);

    const fourth = await initialize();
    expect(fourth.status).toBe(200);
    await fourth.body?.cancel();
  });
});
```

- [ ] **Step 6: verla fallar**

Run: `npx vitest run test/integration/session-cap.test.ts`
Expected: FAIL, la tercera sesión devuelve 200 en vez de 429.

- [ ] **Step 7: nivel `warn` en `src/log.ts`**

```ts
export interface LogEvent { level: 'info' | 'warn' | 'error'; msg: string; [key: string]: unknown }
```

- [ ] **Step 8: aplicar el tope en `src/http/app.ts`**

Arriba del archivo, junto a `IDLE_MS`:

```ts
/** Sesiones abiertas por negocio (spec B2 §4.4). La siguiente recibe 429. */
export const MAX_SESSIONS_PER_BUSINESS = 10;
```

Dentro de `createApp`, antes de `const sessions = new Sessions();`:

```ts
  const maxSessions = deps.maxSessionsPerBusiness ?? MAX_SESSIONS_PER_BUSINESS;
```

En `handle()`, justo antes de `const server = new McpServer(...)`:

```ts
      if (sessions.countFor(business.id) >= maxSessions) {
        log({ level: 'warn', msg: 'session_limit', requestId: context.requestId, businessId: business.id, limit: maxSessions });
        res.status(429).json({ error: 'too many sessions' });
        return;
      }
```

- [ ] **Step 9: correr todo**

Run: `npm test && npm run typecheck && npm run build`
Expected: todo en verde.

- [ ] **Step 10: commit**

```bash
git add src/http/sessions.ts src/http/app.ts src/log.ts test/unit/sessions.test.ts test/integration/session-cap.test.ts
git commit -m "feat: cap open MCP sessions per business"
```

---

## Task 4: Tokens reales en Secrets Manager

**Files:**
- Create: `infra/token.ts`
- Modify: `infra/create-token.ts`
- Modify: `tsconfig.build.json`
- Modify: `package.json` (devDependency `@aws-sdk/client-secrets-manager`)
- Test: `test/unit/token.test.ts`

**Interfaces:**
- Produces: `secretNameFor(bizId: string): string` (devuelve `counterpart/<bizId>/token`); `issueToken(deps: IssueDeps, bizId: string): Promise<{ token: string; secretName?: string }>`, donde `IssueDeps = { store: Store; random?: () => string; putSecret?: (name: string, value: string) => Promise<void> }`; `secretsManagerWriter(client: SecretsManagerClient): (name, value) => Promise<void>`.

- [ ] **Step 1: instalar el cliente**

```bash
npm install --save-dev @aws-sdk/client-secrets-manager@^3.1133.0
```

- [ ] **Step 2: sacar los scripts de `infra/` de la imagen**

Usan dependencias de desarrollo y nunca corren en el contenedor. `tsconfig.build.json`:

```json
{
  "extends": "./tsconfig.json",
  "include": ["src", "seed", "infra"],
  "exclude": ["src/toy.ts", "infra/**/*.ts"]
}
```

Run: `npm run build`
Expected: limpio. `dist/infra/` ya no trae `.js` de los scripts.

- [ ] **Step 3: prueba**

`test/unit/token.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { issueToken, secretNameFor } from '../../infra/token.js';
import { hashToken } from '../../src/http/auth.js';
import { MemoryStore } from '../../src/store/memory.js';
import type { Business } from '../../src/domain/types.js';

const business: Business = {
  id: 'shop', name: 'Oak Street Auto', profileId: 'auto-repair',
  timezone: 'America/Chicago', taxRateBps: 825, nextOrderNumber: 41, version: 1
};

async function storeWithShop(): Promise<MemoryStore> {
  const store = new MemoryStore();
  await store.putBusiness(business);
  return store;
}

describe('emitir tokens', () => {
  it('nombra el secreto por negocio', () => {
    expect(secretNameFor('shop')).toBe('counterpart/shop/token');
  });

  it('guarda solo el hash y, con escritor de secretos, el valor en el secreto del negocio', async () => {
    const store = await storeWithShop();
    const written: Array<[string, string]> = [];
    const result = await issueToken({
      store, random: () => 'tok-1', putSecret: async (name, value) => { written.push([name, value]); }
    }, 'shop');

    expect(result).toEqual({ token: 'tok-1', secretName: 'counterpart/shop/token' });
    expect(written).toEqual([['counterpart/shop/token', 'tok-1']]);
    expect((await store.getBusinessByTokenHash(hashToken('tok-1')))?.id).toBe('shop');
  });

  it('volver a emitir actualiza el mismo secreto y el token anterior sigue siendo válido', async () => {
    const store = await storeWithShop();
    const values = new Map<string, string>();
    const putSecret = async (name: string, value: string) => { values.set(name, value); };
    await issueToken({ store, random: () => 'tok-1', putSecret }, 'shop');
    await issueToken({ store, random: () => 'tok-2', putSecret }, 'shop');

    expect([...values]).toEqual([['counterpart/shop/token', 'tok-2']]);
    expect((await store.getBusinessByTokenHash(hashToken('tok-1')))?.id).toBe('shop');
  });

  it('sin escritor de secretos no devuelve nombre de secreto', async () => {
    const store = await storeWithShop();
    expect(await issueToken({ store, random: () => 'tok-1' }, 'shop')).toEqual({ token: 'tok-1' });
  });

  it('rechaza un negocio inexistente sin escribir nada', async () => {
    const store = new MemoryStore();
    let wrote = false;
    await expect(issueToken({ store, putSecret: async () => { wrote = true; } }, 'nope')).rejects.toThrow(/nope/);
    expect(wrote).toBe(false);
  });
});
```

- [ ] **Step 4: verla fallar**

Run: `npx vitest run test/unit/token.test.ts`
Expected: FAIL, `Cannot find module '../../infra/token.js'`.

- [ ] **Step 5: implementar `infra/token.ts`**

```ts
import { randomBytes } from 'node:crypto';
import {
  CreateSecretCommand, PutSecretValueCommand, ResourceExistsException, type SecretsManagerClient
} from '@aws-sdk/client-secrets-manager';
import { hashToken } from '../src/http/auth.js';
import type { Store } from '../src/store/store.js';

export interface IssueDeps {
  store: Store;
  random?: () => string;
  putSecret?: (name: string, value: string) => Promise<void>;
}

/** Donde lee el token el bridge (BRIDGE_MCP_SECRET_NAME). */
export function secretNameFor(bizId: string): string {
  return `counterpart/${bizId}/token`;
}

/** Emite un token: en la tabla queda solo su hash; con putSecret, el valor va al secreto del negocio. */
export async function issueToken(deps: IssueDeps, bizId: string): Promise<{ token: string; secretName?: string }> {
  if (!(await deps.store.getBusiness(bizId))) throw new Error(`No existe el negocio "${bizId}".`);
  const token = (deps.random ?? (() => randomBytes(32).toString('base64url')))();
  await deps.store.putToken(hashToken(token), bizId);
  if (!deps.putSecret) return { token };
  const secretName = secretNameFor(bizId);
  await deps.putSecret(secretName, token);
  return { token, secretName };
}

/** Crea el secreto o, si ya existe, le pone un valor nuevo. */
export function secretsManagerWriter(client: SecretsManagerClient): (name: string, value: string) => Promise<void> {
  return async (name, value) => {
    try {
      await client.send(new CreateSecretCommand({ Name: name, SecretString: value }));
    } catch (err) {
      if (!(err instanceof ResourceExistsException)) throw err;
      await client.send(new PutSecretValueCommand({ SecretId: name, SecretString: value }));
    }
  };
}
```

- [ ] **Step 6: pasarla**

Run: `npx vitest run test/unit/token.test.ts`
Expected: PASS (5).

- [ ] **Step 7: la CLI usa `issueToken` y acepta `--secret`**

`infra/create-token.ts` completo:

```ts
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { openStore, storeConfig } from '../src/store/from-env.js';
import { issueToken, secretsManagerWriter } from './token.js';

// Uso: npm run token -- <businessId> [--secret]   (con COUNTERPART_STORE=dynamo)
// Sin --secret imprime el token en stdout. Con --secret lo guarda en Secrets Manager y no lo imprime.
const args = process.argv.slice(2);
const bizId = args.find(a => !a.startsWith('--'));
const toSecret = args.includes('--secret');
if (!bizId) {
  console.error('Uso: npm run token -- <businessId> [--secret]');
  process.exit(1);
}

const cfg = storeConfig(process.env);
if (cfg.kind !== 'dynamo') {
  console.error('Un token solo sirve si queda guardado: usa COUNTERPART_STORE=dynamo.');
  process.exit(1);
}

const { store } = openStore(cfg);
const putSecret = toSecret ? secretsManagerWriter(new SecretsManagerClient({ region: cfg.region })) : undefined;

try {
  const { token, secretName } = await issueToken({ store, putSecret }, bizId);
  if (secretName) {
    console.error(`Token emitido para "${bizId}" y guardado en el secreto "${secretName}". En la tabla solo queda su hash.`);
  } else {
    // El token va solo a stdout, para poder redirigirlo; el aviso va a stderr.
    console.log(token);
    console.error(`Token emitido para "${bizId}". Guárdalo ahora: en la tabla solo queda su hash.`);
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
```

- [ ] **Step 8: correr todo**

Run: `npm test && npm run typecheck && npm run build`
Expected: todo en verde.

- [ ] **Step 9: commit**

```bash
git add infra/token.ts infra/create-token.ts tsconfig.build.json package.json package-lock.json test/unit/token.test.ts
git commit -m "feat: store issued tokens in Secrets Manager for the bridge"
```

---

## Task 5: Humo remoto

**Files:**
- Create: `infra/smoke-checks.ts`
- Modify: `infra/smoke.ts` (completo)
- Test: `test/integration/smoke-checks.test.ts`

**Interfaces:**
- Consumes: `createApp`, `seedAll`, `DEMO_TOKENS` (existentes).
- Produces: `runSmoke(opts: { url: string; token: string; otherToken?: string }): Promise<SmokeResult[]>`, donde `SmokeResult = { name: string; ok: boolean; detail: string }`.

- [ ] **Step 1: prueba contra el servidor local sembrado**

`test/integration/smoke-checks.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { runSmoke } from '../../infra/smoke-checks.js';
import { createApp } from '../../src/http/app.js';
import { MemoryStore } from '../../src/store/memory.js';
import { DEMO_TOKENS, seedAll } from '../../seed/run.js';

let server: Server;
let url: string;

beforeAll(async () => {
  const store = new MemoryStore();
  await seedAll(store);
  server = createApp({ store, host: '127.0.0.1' }).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', () => resolve()));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
});

afterAll(() => { server.close(); });

describe('humo', () => {
  it('pasa todos los chequeos contra un servidor sano, con aislamiento entre negocios', async () => {
    const results = await runSmoke({ url, token: DEMO_TOKENS.shop, otherToken: DEMO_TOKENS.bakery });
    expect(results.map(r => r.name)).toEqual([
      'ping', 'sin token → 401', 'versión 2025-11-25', 'nueve tools', 'resumen hablable', 'sesión ajena → 404'
    ]);
    expect(results.filter(r => !r.ok)).toEqual([]);
  });

  it('marca como fallido un token inválido', async () => {
    const results = await runSmoke({ url, token: 'no-existe' });
    expect(results.find(r => r.name === 'versión 2025-11-25')?.ok).toBe(false);
  });
});
```

- [ ] **Step 2: verla fallar**

Run: `npx vitest run test/integration/smoke-checks.test.ts`
Expected: FAIL, `Cannot find module '../../infra/smoke-checks.js'`.

- [ ] **Step 3: implementar `infra/smoke-checks.ts`**

```ts
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

export interface SmokeResult { name: string; ok: boolean; detail: string }

const INIT = {
  jsonrpc: '2.0', id: 1, method: 'initialize',
  params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'counterpart-smoke', version: '0.1.0' } }
};
const HEADERS = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };

function withToken(token: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set('authorization', `Bearer ${token}`);
    return fetch(input, { ...init, headers });
  };
}

/** Lee el resultado JSON-RPC de una respuesta en JSON o en SSE (primer evento data:). */
async function rpcResult(res: Response): Promise<Record<string, unknown> | undefined> {
  const text = await res.text();
  const json = res.headers.get('content-type')?.includes('text/event-stream')
    ? text.split('\n').find(line => line.startsWith('data:'))?.slice(5)
    : text;
  if (!json) return undefined;
  return (JSON.parse(json) as { result?: Record<string, unknown> }).result;
}

/** Chequeos de humo contra un /mcp desplegado (spec B2 §4.7). Nunca lanza: cada chequeo reporta. */
export async function runSmoke(opts: { url: string; token: string; otherToken?: string }): Promise<SmokeResult[]> {
  const results: SmokeResult[] = [];
  const check = async (name: string, fn: () => Promise<string>): Promise<void> => {
    try { results.push({ name, ok: true, detail: await fn() }); }
    catch (err) { results.push({ name, ok: false, detail: err instanceof Error ? err.message : String(err) }); }
  };
  const fail = (msg: string): never => { throw new Error(msg); };

  await check('ping', async () => {
    const res = await fetch(new URL('/ping', opts.url));
    return res.status === 200 ? '200' : fail(`status ${res.status}`);
  });

  await check('sin token → 401', async () => {
    const res = await fetch(opts.url, { method: 'POST', headers: HEADERS, body: JSON.stringify(INIT) });
    await res.body?.cancel();
    return res.status === 401 ? '401' : fail(`status ${res.status}`);
  });

  await check('versión 2025-11-25', async () => {
    const res = await withToken(opts.token)(opts.url, { method: 'POST', headers: HEADERS, body: JSON.stringify(INIT) });
    if (res.status !== 200) fail(`status ${res.status}`);
    const version = (await rpcResult(res))?.protocolVersion;
    return version === '2025-11-25' ? String(version) : fail(`negoció ${String(version)}`);
  });

  const transport = new StreamableHTTPClientTransport(new URL(opts.url), { fetch: withToken(opts.token) });
  const client = new Client({ name: 'counterpart-smoke', version: '0.1.0' });
  let connected = false;
  await check('nueve tools', async () => {
    await client.connect(transport);
    connected = true;
    const { tools } = await client.listTools();
    return tools.length === 9 ? tools.map(t => t.name).join(', ') : fail(`${tools.length} tools`);
  });

  await check('resumen hablable', async () => {
    if (!connected) fail('sin sesión');
    const { tools } = await client.listTools();
    const snapshot = tools.find(t => t.name.endsWith('_snapshot')) ?? fail('no hay tool de resumen');
    const result = await client.callTool({ name: snapshot.name, arguments: {} });
    const text = (result.content as Array<{ text?: string }>)[0]?.text ?? '';
    return text.length > 0 && !result.isError ? text : fail('respuesta vacía o con error');
  });

  if (opts.otherToken) {
    await check('sesión ajena → 404', async () => {
      const sessionId = transport.sessionId ?? fail('sin session id');
      const res = await withToken(opts.otherToken!)(opts.url, {
        method: 'POST',
        headers: { ...HEADERS, 'mcp-session-id': sessionId },
        body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
      });
      await res.body?.cancel();
      return res.status === 404 ? '404' : fail(`status ${res.status}`);
    });
  }

  if (connected) await client.close();
  return results;
}
```

- [ ] **Step 4: pasarla**

Run: `npx vitest run test/integration/smoke-checks.test.ts`
Expected: PASS (2).

- [ ] **Step 5: la CLI lee los tokens de Secrets Manager o del entorno**

`infra/smoke.ts` completo. Los tokens nunca van como argumento: se verían en la lista de procesos y en el historial.

```ts
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { runSmoke } from './smoke-checks.js';

// Uso:
//   npm run smoke -- <url del /mcp> --secret counterpart/shop/token [--other-secret counterpart/bakery/token]
//   SMOKE_TOKEN=... [SMOKE_OTHER_TOKEN=...] npm run smoke -- <url del /mcp>     (local)
const args = process.argv.slice(2);
const url = args.find(a => !a.startsWith('--') && args[args.indexOf(a) - 1]?.startsWith('--') !== true);
const flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
if (!url) {
  console.error('Uso: npm run smoke -- <url del /mcp> [--secret <nombre>] [--other-secret <nombre>]');
  process.exit(1);
}

const secrets = new SecretsManagerClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
const read = async (name: string | undefined, fallback: string | undefined): Promise<string | undefined> => {
  if (!name) return fallback;
  const out = await secrets.send(new GetSecretValueCommand({ SecretId: name }));
  return out.SecretString;
};

const token = await read(flag('--secret'), process.env.SMOKE_TOKEN);
const otherToken = await read(flag('--other-secret'), process.env.SMOKE_OTHER_TOKEN);
if (!token) {
  console.error('Falta el token: --secret <nombre> o SMOKE_TOKEN.');
  process.exit(1);
}

const results = await runSmoke({ url, token, otherToken });
for (const r of results) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name}: ${r.detail}`);
process.exit(results.every(r => r.ok) ? 0 : 1);
```

- [ ] **Step 6: probar la CLI contra el entorno local**

```bash
docker compose up --build -d
npx cross-env COUNTERPART_STORE=dynamo DYNAMODB_ENDPOINT=http://localhost:8000 npm run seed -- --reset
npx cross-env SMOKE_TOKEN=demo-shop-token SMOKE_OTHER_TOKEN=demo-bakery-token npm run smoke -- http://localhost:3000/mcp
docker compose down
```

Expected: seis líneas `ok`, código de salida 0.

- [ ] **Step 7: correr todo y hacer commit**

Run: `npm test && npm run typecheck && npm run build`

```bash
git add infra/smoke-checks.ts infra/smoke.ts test/integration/smoke-checks.test.ts
git commit -m "feat: smoke-test a deployed server, including business isolation"
```

---

## Task 6: Despliegue y apagado con AWS CLI (incluye S1)

Los scripts de infraestructura no llevan pruebas unitarias. Su prueba es correrlos contra AWS (Steps 7–12). Todo corre en Git Bash con `AWS_PROFILE` y `AWS_REGION` exportados.

**Files:**
- Create: `infra/iam/ecs-tasks-trust.json`, `infra/iam/ecs-trust.json`, `infra/iam/task-policy.json`
- Create: `infra/deploy.sh`, `infra/teardown.sh`, `infra/sse-probe.ts`
- Modify: `package.json` (scripts `deploy`, `teardown`)
- Modify: `docs/b2-spikes.md` (sección S1)

**Interfaces:**
- Consumes: la política `bootstrap` (Task 2), `npm run token -- <biz> --secret` (Task 4), `npm run smoke` (Task 5).
- Produces: `npm run deploy`, que imprime la URL pública `https://<host>/mcp` en su última línea; `npm run teardown -- --yes [--keep-data]`.

- [ ] **Step 1: políticas de IAM**

`infra/iam/ecs-tasks-trust.json`:

```json
{
  "Version": "2012-10-17",
  "Statement": [{ "Effect": "Allow", "Principal": { "Service": "ecs-tasks.amazonaws.com" }, "Action": "sts:AssumeRole" }]
}
```

`infra/iam/ecs-trust.json`:

```json
{
  "Version": "2012-10-17",
  "Statement": [{ "Effect": "Allow", "Principal": { "Service": "ecs.amazonaws.com" }, "Action": "sts:AssumeRole" }]
}
```

`infra/iam/task-policy.json`. `__ACCOUNT__` y `__REGION__` los reemplaza `deploy.sh`. Bedrock ya queda permitido para el asistente de la Etapa 2; el inference profile `us.` enruta a tres regiones, por eso el modelo de destino lleva región comodín.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "Table",
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem",
        "dynamodb:Query", "dynamodb:BatchWriteItem", "dynamodb:TransactWriteItems", "dynamodb:DescribeTable"
      ],
      "Resource": "arn:aws:dynamodb:__REGION__:__ACCOUNT__:table/counterpart"
    },
    {
      "Sid": "NovaForTheSetupAssistant",
      "Effect": "Allow",
      "Action": ["bedrock:InvokeModel", "bedrock:Converse"],
      "Resource": [
        "arn:aws:bedrock:__REGION__:__ACCOUNT__:inference-profile/us.amazon.nova-2-lite-v1:0",
        "arn:aws:bedrock:*::foundation-model/amazon.nova-2-lite-v1:0"
      ]
    }
  ]
}
```

Antes de seguir, comprobar que el `DynamoStore` no usa una acción que falte en la lista:

```bash
grep -ohE "new [A-Za-z]+Command" src/store/dynamo.ts src/store/table.ts | sort -u
```

Expected: cada `XCommand` corresponde a una acción `dynamodb:X` de la política (`ScanCommand` solo aparece en `table.ts`, que usa la siembra desde la máquina del dueño, no el servidor). Si falta una acción que use `dynamo.ts`, agregarla.

- [ ] **Step 2: `infra/deploy.sh`**

```bash
#!/usr/bin/env bash
# Despliega Counterpart en ECS Express Mode (spec B2 §4.3). Idempotente: correrlo dos veces no duplica nada.
# Requiere AWS_PROFILE con sesión activa, Docker corriendo y el AWS CLI v2.
set -euo pipefail

: "${AWS_PROFILE:?Define AWS_PROFILE (por ejemplo, counterpart) y abre sesión con aws sso login}"
export AWS_REGION="${AWS_REGION:-us-east-1}"
export AWS_PAGER=""

APP=counterpart
TABLE=counterpart
LOG_GROUP=/ecs/counterpart
CLUSTER=default
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"

ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
REGISTRY="$ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com"
IMAGE_REPO="$REGISTRY/$APP"
TAG="$(git -C "$ROOT" rev-parse --short HEAD)"
if [ -n "$(git -C "$ROOT" status --porcelain)" ]; then TAG="$TAG-dirty"; fi

step() { printf '\n==> %s\n' "$*"; }

step "ECS: cluster $CLUSTER"
# Una cuenta nueva puede no tenerlo. create-cluster sobre uno existente lo devuelve sin cambios; un cluster no cuesta.
aws ecs create-cluster --cluster-name "$CLUSTER" >/dev/null

step "ECR: repositorio $APP"
aws ecr describe-repositories --repository-names "$APP" >/dev/null 2>&1 \
  || aws ecr create-repository --repository-name "$APP" --image-scanning-configuration scanOnPush=true >/dev/null

step "DynamoDB: tabla $TABLE"
if ! aws dynamodb describe-table --table-name "$TABLE" >/dev/null 2>&1; then
  aws dynamodb create-table --table-name "$TABLE" --billing-mode PAY_PER_REQUEST \
    --attribute-definitions AttributeName=pk,AttributeType=S AttributeName=sk,AttributeType=S \
    --key-schema AttributeName=pk,KeyType=HASH AttributeName=sk,KeyType=RANGE >/dev/null
  aws dynamodb wait table-exists --table-name "$TABLE"
fi
TTL_STATUS="$(aws dynamodb describe-time-to-live --table-name "$TABLE" --query TimeToLiveDescription.TimeToLiveStatus --output text)"
if [ "$TTL_STATUS" = "DISABLED" ]; then
  aws dynamodb update-time-to-live --table-name "$TABLE" --time-to-live-specification Enabled=true,AttributeName=expiresAt >/dev/null
fi

step "CloudWatch Logs: $LOG_GROUP, 14 días"
aws logs create-log-group --log-group-name "$LOG_GROUP" 2>/dev/null || true
aws logs put-retention-policy --log-group-name "$LOG_GROUP" --retention-in-days 14

ensure_role() { # nombre, archivo de confianza
  aws iam get-role --role-name "$1" >/dev/null 2>&1 \
    || aws iam create-role --role-name "$1" --assume-role-policy-document "file://$HERE/iam/$2" >/dev/null
}

step "IAM: roles"
ensure_role "$APP-execution" ecs-tasks-trust.json
aws iam attach-role-policy --role-name "$APP-execution" \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
ensure_role "$APP-task" ecs-tasks-trust.json
POLICY_FILE="$(mktemp)"
sed -e "s/__ACCOUNT__/$ACCOUNT/g" -e "s/__REGION__/$AWS_REGION/g" "$HERE/iam/task-policy.json" > "$POLICY_FILE"
aws iam put-role-policy --role-name "$APP-task" --policy-name "$APP-task" --policy-document "file://$POLICY_FILE"
rm -f "$POLICY_FILE"
ensure_role "$APP-infrastructure" ecs-trust.json
INFRA_POLICY="$(aws iam list-policies --scope AWS \
  --query "Policies[?contains(PolicyName, 'ExpressGateway')].Arn | [0]" --output text)"
if [ -z "$INFRA_POLICY" ] || [ "$INFRA_POLICY" = "None" ]; then
  echo "No encontré la política administrada de Express Mode (nombre con 'ExpressGateway')." >&2; exit 1
fi
aws iam attach-role-policy --role-name "$APP-infrastructure" --policy-arn "$INFRA_POLICY"
ROLE_ARN() { aws iam get-role --role-name "$1" --query Role.Arn --output text; }
EXECUTION_ARN="$(ROLE_ARN "$APP-execution")"
TASK_ARN="$(ROLE_ARN "$APP-task")"
INFRA_ARN="$(ROLE_ARN "$APP-infrastructure")"
sleep 10 # IAM tarda unos segundos en propagar un rol recién creado

step "Imagen: $APP:$TAG"
aws ecr get-login-password | docker login --username AWS --password-stdin "$REGISTRY" >/dev/null
docker build --platform linux/amd64 -t "$IMAGE_REPO:$TAG" "$ROOT"
docker push "$IMAGE_REPO:$TAG" >/dev/null

container_json() { # hosts permitidos
  cat <<JSON
{
  "image": "$IMAGE_REPO:$TAG",
  "containerPort": 3000,
  "awsLogsConfiguration": { "logGroup": "$LOG_GROUP", "logStreamPrefix": "$APP" },
  "environment": [
    { "name": "COUNTERPART_STORE", "value": "dynamo" },
    { "name": "DYNAMODB_TABLE", "value": "$TABLE" },
    { "name": "AWS_REGION", "value": "$AWS_REGION" },
    { "name": "COUNTERPART_ALLOWED_HOSTS", "value": "$1" }
  ]
}
JSON
}

service_arn() {
  aws ecs describe-services --cluster "$CLUSTER" --services "$APP" \
    --query "services[?status=='ACTIVE'].serviceArn | [0]" --output text 2>/dev/null || true
}

endpoint_host() {
  aws ecs describe-express-gateway-service --service-arn "$1" \
    --query "service.activeConfigurations[0].ingressPaths[?accessType=='PUBLIC'].endpoint | [0]" --output text \
    | sed -e 's#^https\?://##' -e 's#/.*$##'
}

ARN="$(service_arn)"
if [ -z "$ARN" ] || [ "$ARN" = "None" ]; then
  step "ECS Express Mode: crear el servicio (primera vez, /mcp cerrado hasta conocer el hostname)"
  ARN="$(aws ecs create-express-gateway-service \
    --service-name "$APP" --cluster "$CLUSTER" \
    --execution-role-arn "$EXECUTION_ARN" --task-role-arn "$TASK_ARN" --infrastructure-role-arn "$INFRA_ARN" \
    --health-check-path /ping --cpu 256 --memory 512 --cpu-architecture X86_64 \
    --scaling-target minTaskCount=1,maxTaskCount=1 \
    --primary-container "$(container_json bootstrap)" \
    --query service.serviceArn --output text)"
  aws ecs wait services-stable --cluster "$CLUSTER" --services "$APP"
fi

HOST="$(endpoint_host "$ARN")"
if [ -z "$HOST" ] || [ "$HOST" = "None" ]; then echo "El servicio no reporta endpoint público todavía." >&2; exit 1; fi

step "ECS Express Mode: imagen $TAG con Host permitido $HOST"
aws ecs update-express-gateway-service --service-arn "$ARN" \
  --execution-role-arn "$EXECUTION_ARN" --task-role-arn "$TASK_ARN" \
  --health-check-path /ping --cpu 256 --memory 512 --cpu-architecture X86_64 \
  --scaling-target minTaskCount=1,maxTaskCount=1 \
  --primary-container "$(container_json "$HOST")" >/dev/null
aws ecs wait services-stable --cluster "$CLUSTER" --services "$APP"

step "Listo"
echo "https://$HOST/mcp"
```

- [ ] **Step 3: `infra/teardown.sh`**

```bash
#!/usr/bin/env bash
# Borra todo lo que crea deploy.sh y verifica que no quedó nada (spec B2 §4.3).
# Uso: npm run teardown -- --yes [--keep-data]
#   --keep-data conserva la tabla y los secretos (para redesplegar sin resembrar ni reconfigurar el bridge).
set -euo pipefail

: "${AWS_PROFILE:?Define AWS_PROFILE y abre sesión con aws sso login}"
export AWS_REGION="${AWS_REGION:-us-east-1}"
export AWS_PAGER=""

APP=counterpart
TABLE=counterpart
LOG_GROUP=/ecs/counterpart
CLUSTER=default
YES=0; KEEP=0
for arg in "$@"; do
  case "$arg" in --yes) YES=1 ;; --keep-data) KEEP=1 ;; *) echo "Opción desconocida: $arg" >&2; exit 1 ;; esac
done
if [ "$YES" != 1 ]; then
  echo "Esto borra el servicio, la imagen, los logs y los roles de $APP$([ "$KEEP" = 1 ] || echo ', la tabla y los secretos'). Repite con --yes." >&2
  exit 1
fi

step() { printf '\n==> %s\n' "$*"; }

ARN="$(aws ecs describe-services --cluster "$CLUSTER" --services "$APP" \
  --query "services[?status=='ACTIVE'].serviceArn | [0]" --output text 2>/dev/null || true)"
if [ -n "$ARN" ] && [ "$ARN" != "None" ]; then
  step "Servicio de Express Mode (y su balanceador)"
  aws ecs delete-express-gateway-service --service-arn "$ARN" >/dev/null
  aws ecs wait services-inactive --cluster "$CLUSTER" --services "$APP"
fi

step "Repositorio de ECR"
aws ecr delete-repository --repository-name "$APP" --force >/dev/null 2>&1 || true

step "Grupo de logs"
aws logs delete-log-group --log-group-name "$LOG_GROUP" 2>/dev/null || true

step "Roles de IAM"
for role in "$APP-execution" "$APP-task" "$APP-infrastructure"; do
  aws iam get-role --role-name "$role" >/dev/null 2>&1 || continue
  for p in $(aws iam list-attached-role-policies --role-name "$role" --query 'AttachedPolicies[].PolicyArn' --output text); do
    aws iam detach-role-policy --role-name "$role" --policy-arn "$p"
  done
  for p in $(aws iam list-role-policies --role-name "$role" --query 'PolicyNames[]' --output text); do
    aws iam delete-role-policy --role-name "$role" --policy-name "$p"
  done
  aws iam delete-role --role-name "$role"
done

if [ "$KEEP" != 1 ]; then
  step "Secretos counterpart/*"
  for s in $(aws secretsmanager list-secrets --filters Key=name,Values=counterpart/ --query 'SecretList[].Name' --output text); do
    aws secretsmanager delete-secret --secret-id "$s" --force-delete-without-recovery >/dev/null
  done
  step "Tabla $TABLE"
  if aws dynamodb describe-table --table-name "$TABLE" >/dev/null 2>&1; then
    aws dynamodb delete-table --table-name "$TABLE" >/dev/null
    aws dynamodb wait table-not-exists --table-name "$TABLE"
  fi
fi

step "Verificación"
LEFT=0
report() { if [ -n "$2" ] && [ "$2" != "None" ] && [ "$2" != "0" ]; then echo "QUEDA $1: $2"; LEFT=1; else echo "ok   $1"; fi; }
report "servicio" "$(aws ecs describe-services --cluster "$CLUSTER" --services "$APP" --query "services[?status=='ACTIVE'].serviceName | [0]" --output text 2>/dev/null || true)"
report "ECR" "$(aws ecr describe-repositories --query "repositories[?repositoryName=='$APP'].repositoryName | [0]" --output text)"
report "logs" "$(aws logs describe-log-groups --log-group-name-prefix "$LOG_GROUP" --query 'logGroups[0].logGroupName' --output text)"
report "roles" "$(aws iam list-roles --query "Roles[?starts_with(RoleName, '$APP-')].RoleName | [0]" --output text)"
if [ "$KEEP" != 1 ]; then
  report "secretos" "$(aws secretsmanager list-secrets --filters Key=name,Values=counterpart/ --query 'SecretList[0].Name' --output text)"
  report "tabla" "$(aws dynamodb list-tables --query "TableNames[?@=='$TABLE'] | [0]" --output text)"
fi
echo
echo "Los stacks del bridge se bajan aparte: en cada clon, npm run destroy."
exit "$LEFT"
```

- [ ] **Step 4: sonda SSE para S1, `infra/sse-probe.ts`**

```ts
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

// Spike S1: abre una sesión y el stream SSE de GET /mcp, y mide cuánto vive sin tráfico.
// Uso: npx tsx infra/sse-probe.ts <url del /mcp> <nombre del secreto> [segundos, 90 por defecto]
const [url, secretName, maxArg] = process.argv.slice(2);
if (!url || !secretName) { console.error('Uso: npx tsx infra/sse-probe.ts <url> <secreto> [segundos]'); process.exit(1); }
const maxSeconds = Number(maxArg ?? 90);

const secrets = new SecretsManagerClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
const token = (await secrets.send(new GetSecretValueCommand({ SecretId: secretName }))).SecretString!;
const base = { authorization: `Bearer ${token}`, accept: 'application/json, text/event-stream', 'content-type': 'application/json' };

const init = await fetch(url, {
  method: 'POST', headers: base,
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'sse-probe', version: '0' } } })
});
const sessionId = init.headers.get('mcp-session-id');
await init.text();
if (!sessionId) { console.error(`initialize sin session id (status ${init.status})`); process.exit(1); }
await fetch(url, {
  method: 'POST', headers: { ...base, 'mcp-session-id': sessionId },
  body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })
});

const started = Date.now();
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), maxSeconds * 1000);
try {
  const stream = await fetch(url, { headers: { ...base, 'mcp-session-id': sessionId }, signal: controller.signal });
  console.log(`GET /mcp → ${stream.status} ${stream.headers.get('content-type') ?? ''}`);
  const reader = stream.body!.getReader();
  while (!(await reader.read()).done) { /* los keep-alive, si los hay, llegan aquí */ }
  console.log(`el stream se cerró a los ${Math.round((Date.now() - started) / 1000)} s`);
} catch {
  console.log(`el stream siguió vivo ${maxSeconds} s (se cortó a propósito)`);
} finally {
  clearTimeout(timer);
}
```

- [ ] **Step 5: scripts de npm**

En `package.json`, dentro de `scripts`:

```json
    "deploy": "bash infra/deploy.sh",
    "teardown": "bash infra/teardown.sh",
```

- [ ] **Step 6: revisión estática y commit**

```bash
bash -n infra/deploy.sh && bash -n infra/teardown.sh && echo sintaxis-ok
npm run typecheck
git add infra/iam infra/deploy.sh infra/teardown.sh infra/sse-probe.ts package.json
git commit -m "feat: deploy and tear down the AWS stack with the AWS CLI"
```

Expected: `sintaxis-ok` y typecheck limpio.

- [ ] **Step 7 [dueño]: primer despliegue**

En Git Bash, con sesión de AWS activa y Docker corriendo:

```bash
export AWS_PROFILE=counterpart AWS_REGION=us-east-1
npm run deploy
```

Expected: termina en una línea `https://<host>/mcp`. Guardar ese valor solo en la terminal (`export MCP_URL=https://<host>/mcp`), nunca en el repo.

- [ ] **Step 8 [dueño]: sembrar y emitir tokens a Secrets Manager**

```bash
npx cross-env COUNTERPART_STORE=dynamo COUNTERPART_ALLOW_REMOTE_RESET=1 npm run seed -- --reset
npx cross-env COUNTERPART_STORE=dynamo npm run token -- shop --secret
npx cross-env COUNTERPART_STORE=dynamo npm run token -- bakery --secret
```

Expected: dos avisos "guardado en el secreto counterpart/<biz>/token", sin imprimir tokens.

- [ ] **Step 9 [dueño]: humo remoto**

```bash
npm run smoke -- "$MCP_URL" --secret counterpart/shop/token --other-secret counterpart/bakery/token
```

Expected: seis `ok`. Si `ping` falla, revisar los logs en CloudWatch (`aws logs tail /ecs/counterpart --since 15m`).

- [ ] **Step 10 [dueño]: S1, stream SSE**

```bash
npx tsx infra/sse-probe.ts "$MCP_URL" counterpart/shop/token 90
```

Anotar el resultado en `docs/b2-spikes.md`, sección S1. Si el stream se cierra antes de 90 s, **no bloquea la Etapa 1**: ninguna tool de Counterpart pide elicitation ni deja un stream abierto, y el bridge abre una llamada por turno. Pasa a la Etapa 2, donde `notifications/tools/list_changed` sí lo necesita.

- [ ] **Step 11 [dueño]: probar el apagado y volver a desplegar**

```bash
npm run teardown -- --yes --keep-data
npm run deploy
npm run smoke -- "$MCP_URL" --secret counterpart/shop/token --other-secret counterpart/bakery/token
```

Expected: el teardown termina con todas las líneas `ok` y código 0. El redespliegue imprime un hostname; si cambió, actualizar `MCP_URL`. El humo vuelve a dar seis `ok`: con `--keep-data`, la tabla y los tokens sobreviven.

- [ ] **Step 12: registrar S1 y hacer commit**

Completar la sección S1 de `docs/b2-spikes.md`: si el primer despliegue funcionó, cuánto tardó, cuánto vivió el stream, si el hostname cambia entre despliegues y cualquier sorpresa (nombre exacto de la política de infraestructura, forma del endpoint). Sin el hostname ni el número de cuenta.

```bash
git add docs/b2-spikes.md
git commit -m "docs: record the ECS Express Mode spike"
```

---

## Task 7: Frases de oro contra Nova 2 Lite

**Files:**
- Create: `infra/golden/match.ts`, `infra/golden/runner.ts`, `infra/golden/cli.ts`
- Modify: `package.json` (script `golden`)
- Modify (iterativo): `src/tools/specs.ts`, `src/profiles/auto-repair.yaml`, `src/profiles/bakery.yaml`
- Test: `test/unit/golden-match.test.ts`, `test/integration/golden-runner.test.ts`

**Interfaces:**
- Consumes: `createApp`, `seedAll`, `DEMO_TOKENS`; `@aws-sdk/client-bedrock-runtime` (Task 1).
- Produces: `argsMatch(expected: unknown, actual: unknown): boolean`; `runGolden(opts: { client: Client; model: ConverseFn; phrases: GoldenPhrase[] }): Promise<GoldenReport>`, donde `ConverseFn = (input: { system: SystemContentBlock[]; messages: Message[]; toolConfig: ToolConfiguration }) => Promise<Message>`, `GoldenPhrase = { say: string; tool: string; args: Record<string, unknown> }` y `GoldenReport = { passed: number; total: number; results: Array<{ say: string; expected: string; got: string | null; gotArgs: unknown; pass: boolean }> }`.

**Nota de alcance.** El spec B2 §4.6 prefiere manejar el Track A del bridge desde un script. `npm run chat` es un REPL interactivo y su salida no es un formato estable, así que este runner usa el camino alternativo que el mismo spec prevé: Nova 2 Lite por Converse, con el `tools/list` real del servidor. El informe lo dice. El comportamiento del bridge real se comprueba después con las frases del guion en el simulador (Task 8).

- [ ] **Step 1: prueba del comparador**

`test/unit/golden-match.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { argsMatch } from '../../infra/golden/match.js';

describe('comparador de argumentos de las frases de oro', () => {
  it('sin argumentos esperados, acepta cualquier cosa', () => {
    expect(argsMatch({}, { stage: 'in_bay' })).toBe(true);
  });

  it('exige cada llave esperada', () => {
    expect(argsMatch({ stage: 'in_bay' }, {})).toBe(false);
  });

  it('compara texto sin mayúsculas, puntuación ni artículos al inicio', () => {
    expect(argsMatch({ order: 'the Civic' }, { order: 'civic' })).toBe(true);
    expect(argsMatch({ customerName: 'Dana Lee' }, { customerName: 'dana lee.' })).toBe(true);
  });

  it('acepta texto que contiene todas las palabras esperadas', () => {
    expect(argsMatch({ description: 'front brakes' }, { description: 'replace front brakes' })).toBe(true);
    expect(argsMatch({ description: 'front brakes' }, { description: 'rear brakes' })).toBe(false);
  });

  it('compara números aunque lleguen como texto', () => {
    expect(argsMatch({ quantity: 2 }, { quantity: '2' })).toBe(true);
    expect(argsMatch({ quantity: 2 }, { quantity: 3 })).toBe(false);
  });

  it('compara objetos anidados por sus llaves esperadas', () => {
    expect(argsMatch(
      { asset: { year: 2019, make: 'Honda', model: 'Accord' } },
      { asset: { year: 2019, make: 'honda', model: 'Accord', plate: 'X' } }
    )).toBe(true);
    expect(argsMatch({ asset: { model: 'Accord' } }, { asset: { model: 'Civic' } })).toBe(false);
  });

  it('compara booleanos y enums exactos', () => {
    expect(argsMatch({ compare: true }, { compare: true })).toBe(true);
    expect(argsMatch({ period: 'this_week' }, { period: 'last_week' })).toBe(false);
  });
});
```

- [ ] **Step 2: verla fallar**

Run: `npx vitest run test/unit/golden-match.test.ts`
Expected: FAIL, `Cannot find module '../../infra/golden/match.js'`.

- [ ] **Step 3: implementar `infra/golden/match.ts`**

```ts
const ARTICLES = new Set(['the', 'a', 'an']);

function words(value: string): string[] {
  const tokens = value.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, ' ').split(/\s+/).filter(Boolean);
  while (tokens.length > 0 && ARTICLES.has(tokens[0]!)) tokens.shift();
  return tokens;
}

/**
 * ¿La llamada del modelo trae los argumentos clave de la frase de oro? Texto: todas las palabras
 * esperadas aparecen, sin importar mayúsculas, puntuación ni artículo inicial. Números: por valor.
 * Objetos: recursivo sobre las llaves esperadas. Lo que el modelo agregue de más no cuenta.
 */
export function argsMatch(expected: unknown, actual: unknown): boolean {
  if (typeof expected === 'number') return Number(actual) === expected;
  if (typeof expected === 'boolean') return actual === expected;
  if (typeof expected === 'string') {
    if (typeof actual !== 'string') return false;
    if (/^[a-z]+(_[a-z]+)+$/.test(expected)) return actual === expected; // enum: exacto
    const got = new Set(words(actual));
    return words(expected).every(w => got.has(w));
  }
  if (expected && typeof expected === 'object') {
    if (!actual || typeof actual !== 'object') return false;
    return Object.entries(expected).every(([key, value]) => argsMatch(value, (actual as Record<string, unknown>)[key]));
  }
  return expected === actual;
}
```

- [ ] **Step 4: pasarla**

Run: `npx vitest run test/unit/golden-match.test.ts`
Expected: PASS (7).

- [ ] **Step 5: prueba del runner con un modelo falso**

`test/integration/golden-runner.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Message } from '@aws-sdk/client-bedrock-runtime';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { runGolden, type ConverseFn } from '../../infra/golden/runner.js';
import { createApp } from '../../src/http/app.js';
import { MemoryStore } from '../../src/store/memory.js';
import { DEMO_TOKENS, seedAll } from '../../seed/run.js';

let server: Server;
let client: Client;

beforeAll(async () => {
  const store = new MemoryStore();
  await seedAll(store);
  server = createApp({ store, host: '127.0.0.1' }).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', () => resolve()));
  const url = new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`);
  client = new Client({ name: 'golden-test', version: '0' });
  await client.connect(new StreamableHTTPClientTransport(url, {
    fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      headers.set('authorization', `Bearer ${DEMO_TOKENS.shop}`);
      return fetch(input, { ...init, headers });
    }
  }));
});

afterAll(async () => { await client.close(); server.close(); });

/** Un modelo de guion: por cada frase, primero una llamada a tool y luego una respuesta de texto. */
function scripted(calls: Array<{ name: string; input: Record<string, unknown> } | null>): { model: ConverseFn; seen: string[][] } {
  const seen: string[][] = [];
  let phrase = -1;
  const model: ConverseFn = async ({ messages, toolConfig }) => {
    seen.push((toolConfig.tools ?? []).map(t => t.toolSpec?.name ?? ''));
    const last = messages[messages.length - 1]!;
    const isToolResult = last.content?.some(block => 'toolResult' in block && block.toolResult);
    if (isToolResult) return { role: 'assistant', content: [{ text: 'Done.' }] } as Message;
    phrase += 1;
    const call = calls[phrase];
    if (!call) return { role: 'assistant', content: [{ text: 'I am not sure.' }] } as Message;
    return { role: 'assistant', content: [{ toolUse: { toolUseId: `t${phrase}`, name: call.name, input: call.input as never } }] } as Message;
  };
  return { model, seen };
}

describe('runner de frases de oro', () => {
  it('ofrece las tools del servidor, ejecuta las llamadas y cuenta aciertos por la primera tool', async () => {
    const { model, seen } = scripted([
      { name: 'find_work_orders', input: { stage: 'waiting_on_parts' } },
      { name: 'get_shop_snapshot', input: {} },
      null
    ]);
    const report = await runGolden({
      client, model,
      phrases: [
        { say: "What's waiting on parts?", tool: 'find_work_orders', args: { stage: 'waiting_on_parts' } },
        { say: 'Move the Civic into the bay', tool: 'move_work_order_stage', args: { order: 'the Civic', stage: 'in_bay' } },
        { say: 'Reorder whatever is low', tool: 'reorder_parts', args: {} }
      ]
    });

    expect(seen[0]).toHaveLength(9);
    expect(report.total).toBe(3);
    expect(report.passed).toBe(1);
    expect(report.results.map(r => [r.got, r.pass])).toEqual([
      ['find_work_orders', true], ['get_shop_snapshot', false], [null, false]
    ]);
  });
});
```

- [ ] **Step 6: verla fallar**

Run: `npx vitest run test/integration/golden-runner.test.ts`
Expected: FAIL, `Cannot find module '../../infra/golden/runner.js'`.

- [ ] **Step 7: implementar `infra/golden/runner.ts`**

```ts
import type {
  ContentBlock, Message, SystemContentBlock, Tool, ToolConfiguration, ToolResultContentBlock
} from '@aws-sdk/client-bedrock-runtime';
import type { Client } from '@modelcontextprotocol/client';
import { argsMatch } from './match.js';

export type ConverseFn = (input: { system: SystemContentBlock[]; messages: Message[]; toolConfig: ToolConfiguration }) => Promise<Message>;
export interface GoldenPhrase { say: string; tool: string; args: Record<string, unknown> }
export interface GoldenReport {
  passed: number;
  total: number;
  results: Array<{ say: string; expected: string; got: string | null; gotArgs: unknown; pass: boolean }>;
}

const SYSTEM: SystemContentBlock[] = [{
  text: 'You are Alexa helping the owner of a small business run their day by voice. '
    + 'Use the available tools to act on every request. Answer in one or two short spoken sentences.'
}];
const MAX_STEPS = 4; // llamadas al modelo por frase: tool, resultado, a lo sumo otra tool, respuesta

/** Las tools del servidor en el formato de Converse. $schema no lo acepta Bedrock. */
async function toolConfig(client: Client): Promise<ToolConfiguration> {
  const { tools } = await client.listTools();
  const specs: Tool[] = tools.map(t => {
    const { $schema: _ignored, ...schema } = t.inputSchema as Record<string, unknown>;
    return { toolSpec: { name: t.name, description: t.description ?? '', inputSchema: { json: schema as never } } };
  });
  return { tools: specs };
}

/**
 * Corre las frases en orden sobre una sola conversación y una sola sesión MCP, como las diría el
 * usuario (spec base §11.4). Cuenta la PRIMERA tool que elige el modelo en cada frase.
 */
export async function runGolden(opts: { client: Client; model: ConverseFn; phrases: GoldenPhrase[] }): Promise<GoldenReport> {
  const config = await toolConfig(opts.client);
  const messages: Message[] = [];
  const results: GoldenReport['results'] = [];

  for (const phrase of opts.phrases) {
    messages.push({ role: 'user', content: [{ text: phrase.say }] });
    let first: { name: string; input: unknown } | null = null;

    for (let step = 0; step < MAX_STEPS; step += 1) {
      const reply = await opts.model({ system: SYSTEM, messages, toolConfig: config });
      messages.push(reply);
      const uses = (reply.content ?? []).flatMap(block => ('toolUse' in block && block.toolUse ? [block.toolUse] : []));
      if (uses.length === 0) break;
      first ??= { name: uses[0]!.name!, input: uses[0]!.input };

      const toolResults: ContentBlock[] = [];
      for (const use of uses) {
        const result = await opts.client.callTool({ name: use.name!, arguments: (use.input ?? {}) as Record<string, unknown> });
        const text = (result.content as Array<{ text?: string }>).map(c => c.text ?? '').join(' ');
        const content: ToolResultContentBlock[] = [{ text: text || '(no text)' }];
        toolResults.push({ toolResult: { toolUseId: use.toolUseId!, content, status: result.isError ? 'error' : 'success' } });
      }
      messages.push({ role: 'user', content: toolResults });
    }

    // Si la conversación terminó en tool results sin texto, se cierra el turno para que la siguiente
    // frase empiece con un mensaje de usuario válido.
    if (messages[messages.length - 1]?.role === 'user') messages.push({ role: 'assistant', content: [{ text: 'OK.' }] });

    const pass = first !== null && first.name === phrase.tool && argsMatch(phrase.args, first.input);
    results.push({ say: phrase.say, expected: phrase.tool, got: first?.name ?? null, gotArgs: first?.input, pass });
  }

  return { passed: results.filter(r => r.pass).length, total: results.length, results };
}
```

- [ ] **Step 8: pasarla**

Run: `npx vitest run test/integration/golden-runner.test.ts`
Expected: PASS (1).

- [ ] **Step 9: la CLI, `infra/golden/cli.ts`**

```ts
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { parse as parseYaml } from 'yaml';
import { createApp } from '../../src/http/app.js';
import { MemoryStore } from '../../src/store/memory.js';
import { DEMO_TOKENS, seedAll } from '../../seed/run.js';
import { runGolden, type ConverseFn, type GoldenPhrase } from './runner.js';

// Uso: npm run golden -- <auto-repair|bakery>   (con AWS_PROFILE y acceso a Nova 2 Lite)
// Siembra un servidor local nuevo, corre las frases en orden y escribe build/golden/<perfil>.json.
const TOKEN_BY_PROFILE: Record<string, string> = { 'auto-repair': DEMO_TOKENS.shop, bakery: DEMO_TOKENS.bakery };
const profile = process.argv[2] ?? '';
const token = TOKEN_BY_PROFILE[profile];
if (!token) { console.error('Uso: npm run golden -- <auto-repair|bakery>'); process.exit(1); }

const modelId = process.env.GOLDEN_MODEL_ID ?? 'us.amazon.nova-2-lite-v1:0';
const bedrock = new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
const model: ConverseFn = async ({ system, messages, toolConfig }) => {
  const out = await bedrock.send(new ConverseCommand({
    modelId, system, messages, toolConfig, inferenceConfig: { maxTokens: 400, temperature: 0 }
  }));
  return out.output!.message!;
};

const store = new MemoryStore();
await seedAll(store);
const server = createApp({ store, host: '127.0.0.1' }).listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', () => resolve()));
const client = new Client({ name: 'counterpart-golden', version: '0.1.0' });
await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`), {
  fetch: (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set('authorization', `Bearer ${token}`);
    return fetch(input, { ...init, headers });
  }
}));

const file = path.join(import.meta.dirname, '..', '..', 'test', 'golden', `${profile}.yaml`);
const { phrases } = parseYaml(fs.readFileSync(file, 'utf8')) as { phrases: GoldenPhrase[] };
const report = await runGolden({ client, model, phrases });
await client.close();
server.close();

for (const r of report.results) {
  console.log(`${r.pass ? 'ok  ' : 'FAIL'} "${r.say}" → ${r.got ?? '(ninguna)'}${r.pass ? '' : ` (esperada ${r.expected}) ${JSON.stringify(r.gotArgs ?? {})}`}`);
}
const ratio = report.passed / report.total;
console.log(`\n${profile}: ${report.passed}/${report.total} (${Math.round(ratio * 100)}%) · modelo ${modelId} · modo converse`);

const outDir = path.join(import.meta.dirname, '..', '..', 'build', 'golden');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, `${profile}.json`), JSON.stringify({ modelId, mode: 'converse', ...report }, null, 2));
// Meta del spec: 18 de 20 o más, es decir, 90%.
process.exit(ratio >= 0.9 ? 0 : 1);
```

En `package.json`, dentro de `scripts`:

```json
    "golden": "tsx infra/golden/cli.ts",
```

- [ ] **Step 10: correr todo y hacer commit**

Run: `npm test && npm run typecheck && npm run build`

```bash
git add infra/golden package.json test/unit/golden-match.test.ts test/integration/golden-runner.test.ts
git commit -m "feat: run the golden phrases against Nova 2 Lite"
```

- [ ] **Step 11 [dueño o agente con permiso]: primera corrida**

```bash
npm run golden -- auto-repair
npm run golden -- bakery
```

Anotar el puntaje de cada perfil. Expected: una línea por frase y un total. Cada corrida cuesta centavos.

- [ ] **Step 12: ajustar descripciones hasta la meta**

Por cada `FAIL`:

1. Leer qué tool eligió el modelo y con qué argumentos.
2. Corregir **la descripción o los sinónimos** de la tool esperada, o los de la que eligió mal, en `src/tools/specs.ts` (plantillas) o en `synonyms` del perfil YAML. **Nunca** se cambia la frase de oro ni la lógica de la tool.
3. `npx vitest run test/unit/tool-specs.test.ts test/unit/golden.test.ts`: si una prueba fija el texto de una descripción, actualizar ese texto esperado en la misma edición.
4. Volver a correr `npm run golden -- <perfil>`.

Parar cuando ambos perfiles lleguen al 90% o más. Si después de **dos rondas** alguno sigue abajo, correr con el modelo alternativo y comparar:

```bash
npx cross-env GOLDEN_MODEL_ID=us.anthropic.claude-haiku-4-5-20251001-v1:0 npm run golden -- auto-repair
```

Si Haiku llega a la meta y Nova no, el bridge usa `fallbackModelId` (Task 8, Step 6), y se anota en `docs/friction-log.md` en la Task 9.

- [ ] **Step 13: commit de los ajustes**

Run: `npm test && npm run typecheck`

```bash
git add src/tools/specs.ts src/profiles test/unit
git commit -m "fix: tune tool descriptions so Nova 2 Lite picks the right tool"
```

---

## Task 8: Voz: fork del bridge, dos Skills y S3

Trabajo fuera del repo de Counterpart. El fork es público (Apache-2.0) y **nunca** lleva `.env`, ARNs ni ids de Skill: el hook `check:leaks` del bridge lo vigila.

**Files (en el fork):**
- Modify: `infra/bin/app.ts`
- Modify: `packages/core/src/config.ts` (mapa de overrides por entorno, cerca de la línea 183)
- Modify: `packages/core/src/config.test.ts`
- Modify: cada archivo que la Task 1, Step 6, listó con `AlexaMcpBridgeStack`

**Interfaces:**
- Consumes: la URL pública y los secretos `counterpart/<biz>/token` (Task 6).
- Produces: dos Skills en modo Development: `oak street auto` y `sweet crumb bakery`.

- [ ] **Step 1 [dueño]: comprobar la cuenta de GitHub y hacer el fork**

```bash
gh api user --jq .login
```

Expected: `Raul99Alejandro`. Si sale otra cuenta: `gh auth switch --user Raul99Alejandro` y repetir.

```bash
gh repo fork KayLerch/alexa-skill-mcp-bridge --clone=false
gh repo view Raul99Alejandro/alexa-skill-mcp-bridge --json owner --jq .owner.login
```

Expected: `Raul99Alejandro`.

- [ ] **Step 2: clonar el fork y probar el parche de invocación**

```bash
cd D:/Repos/amazon-hackathon-2026
git clone https://github.com/Raul99Alejandro/alexa-skill-mcp-bridge.git bridge-shop
cd bridge-shop && git checkout -b counterpart && npm install && git config core.hooksPath .githooks
```

En `packages/core/src/config.test.ts`, agregar junto a las pruebas de `applyEnvOverrides`:

```ts
  it('BRIDGE_INVOCATION_NAME sobrescribe skill.invocationName', () => {
    const raw = { skill: { invocationName: 'bridge demo' } };
    expect(applyEnvOverrides(raw, { BRIDGE_INVOCATION_NAME: 'oak street auto' }))
      .toMatchObject({ skill: { invocationName: 'oak street auto' } });
  });
```

Run: `npx vitest run packages/core/src/config.test.ts`
Expected: FAIL, el nombre sigue siendo `bridge demo`.

- [ ] **Step 3: implementar el override**

En `packages/core/src/config.ts`, en el mapa de variables a rutas (donde está `BRIDGE_MCP_URL: ['mcp', 'url'],`), agregar:

```ts
  BRIDGE_INVOCATION_NAME: ['skill', 'invocationName'],
```

Run: `npx vitest run packages/core/src/config.test.ts`
Expected: PASS.

- [ ] **Step 4: nombre de stack por entorno**

En `infra/bin/app.ts`, reemplazar el id fijo:

```ts
// Un stack por despliegue: dos Skills en la misma cuenta necesitan dos nombres (Counterpart, spike S2).
const stackName = process.env.BRIDGE_STACK_NAME?.trim() || 'AlexaMcpBridgeStack';
new AlexaMcpBridgeStack(app, stackName, {
```

En cada archivo que la Task 1, Step 6, listó con el literal `AlexaMcpBridgeStack` (scripts de deploy, destroy o lectura de outputs), usar la misma expresión `process.env.BRIDGE_STACK_NAME?.trim() || 'AlexaMcpBridgeStack'`. Si el spike encontró recursos con nombre físico fijo, agregarles el nombre del stack como sufijo, en la misma forma en que ya se construyen sus nombres.

Verificación de que dos stacks no chocan:

```bash
npx tsc -b
cd infra
BRIDGE_STACK_NAME=CounterpartShopBridge npx cdk synth --quiet -o ../cdk.out.shop
BRIDGE_STACK_NAME=CounterpartBakeryBridge npx cdk synth --quiet -o ../cdk.out.bakery
cd ..
diff <(grep -oE '"(FunctionName|RoleName|LogGroupName|AgentRuntimeName|Name)": "[^"]+"' cdk.out.shop/*.template.json | sort) \
     <(grep -oE '"(FunctionName|RoleName|LogGroupName|AgentRuntimeName|Name)": "[^"]+"' cdk.out.bakery/*.template.json | sort)
npm test
```

Expected: cada nombre físico que aparezca difiere entre los dos (o no hay ninguno), y la suite del bridge pasa.

- [ ] **Step 5: commit en el fork**

```bash
npm run check:leaks
git add -A && git commit -m "feat: set the stack and invocation names from the environment"
git push -u origin counterpart
```

- [ ] **Step 6 [dueño]: configurar y desplegar el bridge del taller**

Una vez por cuenta: `npx cdk bootstrap aws://<cuenta>/us-east-1`.

`.env` del clon `bridge-shop` (git-ignored):

```bash
BRIDGE_MCP_URL=<el valor de $MCP_URL>
BRIDGE_MCP_AUTH_TYPE=bearer
BRIDGE_MCP_SECRET_NAME=counterpart/shop/token
BRIDGE_INVOCATION_NAME=oak street auto
BRIDGE_STACK_NAME=CounterpartShopBridge
```

Si la Task 7 terminó en Haiku, cambiar además `agent.modelId` en `bridge.config.ts` por `us.anthropic.claude-haiku-4-5-20251001-v1:0` y habilitar ese modelo en Bedrock.

```bash
npm run doctor -- --track skill
npm run generate
npm run deploy
npm run skill:deploy
npm run deploy
```

Expected: `doctor` sin faltantes; `skill:deploy` escribe `BRIDGE_SKILL_ID` en `.env`; el segundo `deploy` ata la Lambda a la Skill.

- [ ] **Step 7 [dueño]: probar el taller en el simulador**

developer.amazon.com → Alexa → Skill "oak street auto" → Test → Development. Escribir o decir, en orden:

1. `open oak street auto`
2. `what's waiting on parts`
3. `add front brake pads to the civic`
4. `move the civic into the bay`
5. `close out the cx-5 they paid by card`
6. `how's the shop looking today`
7. `how did we do this week compared to last week`

Expected: cada respuesta es una o dos oraciones que corresponden a la acción. Si una frase sale mal, correr `npm run chat -- --debug` en el clon con la misma frase, para ver qué tool eligió.

- [ ] **Step 8 [dueño]: segundo clon, la pastelería**

```bash
cd D:/Repos/amazon-hackathon-2026
git clone -b counterpart https://github.com/Raul99Alejandro/alexa-skill-mcp-bridge.git bridge-bakery
cd bridge-bakery && npm install && git config core.hooksPath .githooks
```

`.env`, igual que el del taller, con:

```bash
BRIDGE_MCP_SECRET_NAME=counterpart/bakery/token
BRIDGE_INVOCATION_NAME=sweet crumb bakery
BRIDGE_STACK_NAME=CounterpartBakeryBridge
```

Mismos comandos que el Step 6. En el simulador: `open sweet crumb bakery`, `how many cakes are due saturday`, `take a cake order for priya shah a ten inch chocolate cake due saturday`, `reorder whatever's low`.

Expected: las dos Skills responden cada una con su negocio. Volver a abrir la del taller confirma que la segunda no pisó a la primera.

- [ ] **Step 9: spike S3, frase libre con tools que cambian**

Sin tocar Counterpart. Se usa el servidor de ejemplo del bridge y se compara lo que la Skill conoce contra lo que el servidor expone:

1. En `bridge-shop`, abrir `skill-package/interactionModels/custom/en-US.json` y anotar cuántas intenciones generó y si existe una catch-all.
2. En el simulador de "oak street auto", decir una frase que no se parezca a ninguna intención generada pero sí a una tool: `anything i should reorder`. Anotar si la catch-all la llevó al agente y si este llamó a `reorder_parts` o a `check_parts_stock`.
3. Leer en el código del agente del fork (`packages/agent/src/mcp`) si `tools/list` se pide al abrir cada sesión o se cachea en el despliegue. Anotar el archivo y la función.

Escribir en `docs/b2-spikes.md` (repo de Counterpart), sección S3: si la catch-all llega al agente, si el agente relee `tools/list` por sesión, y la decisión para la Etapa 2 (catch-all basta, `toolIntents: false`, o redesplegar la Skill tras activar).

```bash
cd D:/Repos/amazon-hackathon-2026/counterpart
git add docs/b2-spikes.md
git commit -m "docs: record the free-phrase spike for the setup assistant"
```

---

## Task 9: Entregables, video y envío

**Files:**
- Modify: `README.md` (secciones "Deploy to AWS" y "Connect the Alexa bridge"; "Status")
- Modify: `docs/aws-builder.md`, `docs/friction-log.md`, `docs/product-feedback.md`, `docs/demo-script.md`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: repo listo para jueces y envío en Devpost.

- [ ] **Step 1: README, sección "Deploy to AWS"**

Agregar después de "Run with DynamoDB Local":

````markdown
## Deploy to AWS

Everything runs in `us-east-1`. You need the AWS CLI v2 with a signed-in profile, Docker, and Git Bash on Windows.

```bash
export AWS_PROFILE=<your profile> AWS_REGION=us-east-1
npm run deploy                     # ECR, DynamoDB, logs, IAM, ECS Express Mode; prints https://<host>/mcp
npx cross-env COUNTERPART_STORE=dynamo COUNTERPART_ALLOW_REMOTE_RESET=1 npm run seed -- --reset
npx cross-env COUNTERPART_STORE=dynamo npm run token -- shop --secret     # token → Secrets Manager
npx cross-env COUNTERPART_STORE=dynamo npm run token -- bakery --secret
npm run smoke -- https://<host>/mcp --secret counterpart/shop/token --other-secret counterpart/bakery/token
```

The first deploy starts the service with `/mcp` closed (`COUNTERPART_ALLOWED_HOSTS=bootstrap`), reads the public hostname Express Mode assigns, and redeploys with only that hostname allowed. `/ping` answers any Host, because the load balancer's health check calls it by the task's IP.

**Tear it down** when you are done. The load balancer bills by the hour even with no traffic:

```bash
npm run teardown -- --yes          # add --keep-data to keep the table and the tokens
```
````

En la tabla "Configuration" del README, agregar la fila:

```markdown
| `COUNTERPART_ALLOWED_HOSTS` | — | Comma-separated hostnames `/mcp` accepts. Required when `NODE_ENV=production`; `bootstrap` keeps `/mcp` closed until the hostname is known |
```

- [ ] **Step 2: README, sección "Connect the Alexa bridge"**

````markdown
## Connect the Alexa bridge

The Alexa+ MCP Toolkit is not public, so the voice demo uses [alexa-skill-mcp-bridge](https://github.com/KayLerch/alexa-skill-mcp-bridge): an Alexa Skill plus an agent on Amazon Bedrock AgentCore (Nova 2 Lite) that plays the Alexa+ orchestrator. We run one bridge per business, the way each business would install its own Alexa+ add-on. Our [fork](https://github.com/Raul99Alejandro/alexa-skill-mcp-bridge/tree/counterpart) adds two `.env` settings for that: `BRIDGE_STACK_NAME` and `BRIDGE_INVOCATION_NAME`.

`.env` for the auto shop (one clone per business):

```bash
BRIDGE_MCP_URL=https://<host>/mcp
BRIDGE_MCP_AUTH_TYPE=bearer
BRIDGE_MCP_SECRET_NAME=counterpart/shop/token
BRIDGE_INVOCATION_NAME=oak street auto
BRIDGE_STACK_NAME=CounterpartShopBridge
```

Then `npm run generate && npm run deploy && npm run skill:deploy && npm run deploy`, and open the skill's Test tab in the Alexa developer console. The bakery uses `counterpart/bakery/token`, `sweet crumb bakery` and `CounterpartBakeryBridge`.
````

En "Status", reemplazar el párrafo "In progress: …" por el estado real: desplegado en ECS Express Mode, dos Skills en el simulador, puntaje de frases de oro por perfil y modelo.

- [ ] **Step 3: `docs/aws-builder.md`**

Rehacer el diagrama con la arquitectura de §3 del spec B2 (sin la parte de alta de negocios, que es de la Etapa 2) y una tabla servicio → para qué → por qué: ECS Express Mode, ECR, DynamoDB, Secrets Manager, CloudWatch Logs, IAM (mínimo privilegio), Bedrock (Nova 2 Lite), AgentCore Runtime y Lambda (del bridge). Cerrar con el costo aproximado de §8 del spec B2 y cómo apagarlo.

- [ ] **Step 4: `docs/friction-log.md`**

Agregar una entrada por fricción real encontrada en esta etapa, con el formato existente (título numerado, qué pasó, cómo se resolvió). Cuáles entran depende de lo que pase en la ejecución. Las que ya se sabe que ocurrieron:

- El plan gratuito de AWS no incluye AgentCore y no acepta créditos promocionales; hubo que pasar al plan de pago.
- Nova 2 Lite solo responde por inference profile (`us.`); el ID del modelo sin prefijo da `ValidationException`.
- `createMcpExpressApp({ allowedHosts })` valida toda la app, `/ping` incluido, y rompe el health check del balanceador; se valida solo `/mcp`.
- El hostname de Express Mode no se conoce antes de crear el servicio; hace falta el despliegue en dos pasos con `bootstrap`.
- El bridge fija el nombre del stack: dos Skills en una cuenta requieren un parche.

- [ ] **Step 5: `docs/product-feedback.md`**

Agregar lo aprendido de ECS Express Mode, Bedrock y el bridge: qué fue fácil, qué faltó en la documentación, cómo fue el onboarding de cada uno.

- [ ] **Step 6: `docs/demo-script.md`**

En "Antes de grabar", reemplazar la línea de "El comando exacto, con sus credenciales, lo define el Plan B2" por el comando real de siembra remota del Step 1. Agregar: "Abrir las dos Skills una vez antes de grabar: el primer turno tras un rato despierta AgentCore". En el paso 5 del guion, el diagrama es el de `docs/aws-builder.md`.

- [ ] **Step 7: commit**

```bash
git add README.md docs/aws-builder.md docs/friction-log.md docs/product-feedback.md docs/demo-script.md
git commit -m "docs: document the AWS deployment and the Alexa bridge for the submission"
```

- [ ] **Step 8 [dueño]: grabar el video**

Seguir `docs/demo-script.md` con la semilla fresca de ese día. Las pantallas de MCP Apps se toman de `basic-host` contra el servidor local (instrucciones de `basic-host` en el spec base §10.2). Revisar que dure ≤ 3:00 y que se vea el simulador respondiendo. Subir a YouTube como no listado o público.

- [ ] **Step 9 [dueño]: envío en Devpost**

Track Alexa+; mini-retos AWS Builder y Open Source. Repo: https://github.com/Raul99Alejandro/counterpart. Descripción desde el README ("The idea", "Tools", "Architecture"). Adjuntar el link del video, `docs/product-feedback.md` y `docs/friction-log.md`.

- [ ] **Step 10: cierre de la etapa**

Run: `npm test && npm run typecheck && npm run build`
Expected: todo en verde.

En el repo central (`D:\Repos\amazon-hackathon-2026`), actualizar `_local/setup-cuentas.md` (plan de pago, recursos desplegados, secretos, bridges, fecha de apagado del 23 oct) y `_local/siguiente-sesion.md` (Etapa 1 enviada; lo siguiente es escribir el plan de la Etapa 2 con los resultados de S3 y S4). Commit en el repo central.

---

## Self-Review

- **Cobertura del spec B2:** §4.1 → Task 1 (Steps 1–2); §4.2 S1 → Task 6 (Steps 10–12), S2 → Task 1 (Step 6) y Task 8 (Steps 2–5), S3 → Task 8 (Step 9), S4 → Task 1 (Steps 4–5); §4.3 → Task 6; §4.4 → Tasks 2, 3 y 4 (logs a CloudWatch por `awsLogsConfiguration` en la Task 6); §4.5 → Task 8; §4.6 → Task 7 (en modo Converse, con la razón escrita en la tarea); §4.7 → Task 5; §4.8 → Task 9. §5 es del plan de la Etapa 2. §6: las pruebas de HTTP de la lista están en las Tasks 2 y 3, y el humo remoto en la Task 5. §8 → Task 9, Step 3. §9 → orden de las tareas.
- **Desviaciones del spec, dichas en su tarea:** el runner de frases de oro usa Converse y no el REPL del bridge (Task 7); un stream SSE que muere antes de 60 s no bloquea la Etapa 1 (Task 6, Step 10).
- **Nombres consistentes:** `HostPolicy`/`hostPolicy`, `maxSessionsPerBusiness`, `MAX_SESSIONS_PER_BUSINESS`, `countFor`, `issueToken`/`secretNameFor`/`secretsManagerWriter`, `runSmoke`/`SmokeResult`, `argsMatch`, `runGolden`/`ConverseFn`/`GoldenPhrase`/`GoldenReport`, y los nombres fijos de AWS de Global Constraints.
- **Review Focus:** los cinco puntos tienen su prueba en su tarea (1–3 en la Task 2, 4 en la Task 4, 5 en la Task 3).

## Ejecución

Las tareas 1 a 5 y 7 (Steps 1–10) son código con pruebas y corren sin AWS, salvo los pasos marcados. Las tareas 6, 8 y 9 dependen de la cuenta del dueño, y sus pasos **[dueño]** los hace él; el agente prepara los comandos y revisa las salidas que le pegue.
