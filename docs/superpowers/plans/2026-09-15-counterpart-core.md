# Counterpart Core — Implementation Plan (Plan A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un servidor MCP self-hosted que expone nueve tools generadas desde un perfil de negocio, funcionando en local sobre Streamable HTTP con dos perfiles (taller y pastelería) y almacenamiento en memoria.

**Architecture:** Núcleo genérico con reglas de dominio puras (`domain/`, sin I/O), persistencia detrás de una interfaz (`store/`), y una capa de tools que se genera a partir de un perfil YAML validado. El servidor HTTP crea una sesión MCP por negocio: el bearer token identifica al negocio, el negocio determina el perfil, y el perfil determina los nombres, descripciones y esquemas de las nueve tools.

**Tech Stack:** Node.js 24, TypeScript ESM, `@modelcontextprotocol/server` + `node` + `express` 2.0.0, zod v4, Express 5, vitest.

**Spec:** `docs/superpowers/specs/2026-09-15-counterpart-alexa-mcp-design.md`

**Plan B (aparte):** DynamoStore, UIs de MCP Apps, infraestructura y despliegue, bridge de Alexa, frases de oro y entregables del hackathon.

## Global Constraints

- **Protocolo MCP:** `2025-11-25` (mínimo aceptado por el track). El servidor debe negociarlo cuando el cliente lo pide.
- **Paquetes MCP con versión exacta, sin `^`:** `@modelcontextprotocol/server`, `@modelcontextprotocol/node`, `@modelcontextprotocol/express`, `@modelcontextprotocol/client` en `2.0.0`.
- **Node.js >= 24.** TypeScript ESM (`"type": "module"`), `module`/`moduleResolution` en `NodeNext`, imports con extensión `.js`.
- **zod v4**, siempre importado como `import * as z from 'zod/v4'`, y siempre con objetos de esquema (`z.object({...})`), nunca shapes crudos.
- **`InMemoryTransport`: los dos extremos del par se importan del mismo paquete.** En este proyecto, siempre de `@modelcontextprotocol/client`. Mezclar paquetes rompe el par porque cada uno trae su propia copia con estado privado.
- **Dinero siempre en centavos enteros.** El formato `"$412.50"` solo aparece en texto hablado o en UI. Las tasas de impuesto se guardan en puntos básicos (`taxRateBps`, 825 = 8.25 %).
- **Todo el texto que ve el usuario va en inglés (en-US)**, sin markdown, en una o dos oraciones que se puedan decir en voz alta. El código y los comentarios van en español.
- **Nada en `tools/list` que no funcione** (requisito 13 de Alexa+). Si una tool no está terminada, no se registra.
- **Errores de dominio:** `isError: true` con **solo texto**, sin `structuredContent`. La validación de `outputSchema` del SDK se salta cuando `isError` es `true`, así que esto es seguro.
- **Las descripciones de las tools llevan sinónimos** del perfil, sin jerga técnica ni nombres internos.
- **Fechas:** `YYYY-MM-DD` en la zona horaria del negocio, nunca la del servidor.
- **Un commit por tarea**, en inglés, estilo conventional commits.

---

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `src/profiles/schema.ts` | Tipos y esquema zod de un perfil; reglas de validación |
| `src/profiles/load.ts` | Leer y validar un YAML de perfil |
| `src/profiles/auto-repair.yaml`, `bakery.yaml` | Los dos perfiles del demo |
| `src/domain/types.ts` | Tipos de datos del negocio (Business, Order, CatalogItem, …) |
| `src/domain/money.ts` | Centavos, formato hablado, impuestos |
| `src/domain/dates.ts` | `due`, "hoy" y periodos del reporte en la zona del negocio |
| `src/domain/orders.ts` | Crear orden, agregar partida, cambiar etapa, cerrar, totales |
| `src/domain/inventory.ts` | Buscar ítem, consumir stock, backorder, bajo stock, plan de reorden |
| `src/domain/resolver.ts` | Resolver referencias habladas a órdenes |
| `src/domain/reports.ts` | Resumen del día y reporte de ventas |
| `src/store/store.ts` | Interfaz `Store` y errores de persistencia |
| `src/store/memory.ts` | `MemoryStore` para desarrollo y pruebas |
| `src/speech/say.ts` | Frases en inglés a partir del perfil y los datos |
| `src/tools/specs.ts` | Nombres, descripciones y esquemas generados desde el perfil |
| `src/tools/register.ts` | Registrar las nueve tools en un `McpServer` |
| `src/tools/*.ts` | Una tool por archivo |
| `src/http/auth.ts` | Hash de token → negocio; modo local sin token |
| `src/http/sessions.ts` | Mapa de sesiones MCP por negocio |
| `src/http/app.ts` | Express: `/ping` y `/mcp` |
| `src/index.ts` | Arranque, apagado ordenado |
| `seed/*.ts` | Datos ficticios deterministas |
| `test/unit/*`, `test/integration/*` | Pruebas |

---

## Task 1: Bootstrap y servidor de juguete

Entrega un servidor MCP mínimo sobre el stack definitivo. Los spikes del Plan B lo usan como blanco.

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `src/toy.ts`, `src/http/app.ts`, `src/index.ts`
- Test: `test/integration/toy.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `createToyServer(): McpServer` y `createApp(server: McpServer): express.Express` (esta última se reemplaza en la Task 12).

- [ ] **Step 1: Inicializar el proyecto e instalar dependencias**

```bash
npm init -y
npm pkg set name=counterpart private=true type=module engines.node=">=24"
npm i @modelcontextprotocol/server@2.0.0 @modelcontextprotocol/node@2.0.0 @modelcontextprotocol/express@2.0.0 express@^5.1.0 yaml@^2 zod@^4.2
npm i -D @modelcontextprotocol/client@2.0.0 typescript tsx vitest @types/node @types/express
npm pkg set scripts.dev="tsx watch src/index.ts" scripts.build="tsc -p tsconfig.json" scripts.start="node dist/src/index.js" scripts.test="vitest run"
```

- [ ] **Step 2: Crear `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "outDir": "dist",
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src", "seed", "test"]
}
```

Y `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['test/**/*.test.ts'], environment: 'node' }
});
```

- [ ] **Step 3: Escribir la prueba que falla**

`test/integration/toy.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { createToyServer } from '../../src/toy.js';

describe('servidor de juguete', () => {
  it('expone ping_shop y responde', async () => {
    const [clientEnd, serverEnd] = InMemoryTransport.createLinkedPair();
    const server = createToyServer();
    const client = new Client({ name: 'test', version: '1.0.0' });

    await server.server.connect(serverEnd);
    await client.connect(clientEnd);

    const { tools } = await client.listTools();
    expect(tools.map(t => t.name)).toEqual(['ping_shop']);

    const result = await client.callTool({ name: 'ping_shop', arguments: {} });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({ ok: true });

    await client.close();
  });
});
```

- [ ] **Step 4: Correr la prueba y verificar que falla**

Run: `npx vitest run test/integration/toy.test.ts`
Expected: FAIL — no existe `src/toy.ts`.

- [ ] **Step 5: Implementar el servidor de juguete**

`src/toy.ts`:

```typescript
import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

export function createToyServer(): McpServer {
  const server = new McpServer({ name: 'counterpart-toy', version: '0.1.0' });

  server.registerTool(
    'ping_shop',
    {
      title: 'Ping shop',
      description: 'Check that the shop assistant is reachable. Use this when the user asks whether the system is online.',
      inputSchema: z.object({}),
      outputSchema: z.object({ ok: z.boolean() }),
      annotations: { readOnlyHint: true, idempotentHint: true }
    },
    async () => ({
      content: [{ type: 'text', text: 'The shop assistant is online.' }],
      structuredContent: { ok: true }
    })
  );

  return server;
}
```

- [ ] **Step 6: Correr la prueba y verificar que pasa**

Run: `npx vitest run test/integration/toy.test.ts`
Expected: PASS.

- [ ] **Step 7: Exponer el servidor por HTTP**

`src/http/app.ts`:

```typescript
import { createMcpExpressApp } from '@modelcontextprotocol/express';
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
import type { McpServer } from '@modelcontextprotocol/server';
import type { Express, Request, Response } from 'express';

/** Servidor sin sesiones: uno por petición. La Task 12 lo reemplaza por sesiones por negocio. */
export function createApp(createServer: () => McpServer): Express {
  const app = createMcpExpressApp({ host: '0.0.0.0' });

  app.get('/ping', (_req: Request, res: Response) => {
    res.status(200).type('text/plain').send('ok');
  });

  app.all('/mcp', async (req: Request, res: Response) => {
    const server = createServer();
    const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  return app;
}
```

`src/index.ts`:

```typescript
import { createApp } from './http/app.js';
import { createToyServer } from './toy.js';

const port = Number(process.env.PORT ?? 3000);
const httpServer = createApp(createToyServer).listen(port, () => {
  console.log(JSON.stringify({ msg: 'listening', port }));
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => httpServer.close(() => process.exit(0)));
}
```

- [ ] **Step 8: Verificar a mano que negocia el protocolo correcto**

Run en una terminal: `npm run dev`
Run en otra:

```bash
curl -sS http://localhost:3000/ping
curl -sS -X POST http://localhost:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'
```

Expected: `ok` en el primero, y en el segundo una respuesta cuyo `result.protocolVersion` sea exactamente `"2025-11-25"`. Si devuelve otra versión, el stack no cumple el mínimo del track: detente y reporta antes de seguir.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts src test
git commit -m "feat: bootstrap MCP server with toy tool over streamable HTTP"
```

---

## Task 2: Esquema y carga de perfiles

**Files:**
- Create: `src/profiles/schema.ts`, `src/profiles/load.ts`, `src/profiles/auto-repair.yaml`, `src/profiles/bakery.yaml`
- Test: `test/unit/profiles.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type ToolKey = 'snapshot' | 'find' | 'open' | 'move' | 'addLine' | 'stock' | 'reorder' | 'closeOut' | 'salesReport'`
  - `interface FieldDef { id: string; type: 'string' | 'integer'; required: boolean }`
  - `interface StageDef { id: string; label: string }`
  - `interface AssetDef { noun: string; fields: FieldDef[]; spokenAs: string }`
  - `interface Profile { id, nouns, synonyms, toolNames, stages, closedStage, closeFrom, asset, orderFields, due }`
  - `loadProfile(id: string): Profile` — lee `src/profiles/<id>.yaml`, valida y lanza `Error` con el detalle si es inválido.

- [ ] **Step 1: Escribir la prueba que falla**

`test/unit/profiles.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { loadProfile, parseProfile } from '../../src/profiles/load.js';

describe('perfiles', () => {
  it('carga el perfil del taller', () => {
    const p = loadProfile('auto-repair');
    expect(p.toolNames.open).toBe('open_work_order');
    expect(p.stages.map(s => s.id)).toContain('waiting_on_parts');
    expect(p.closedStage).toBe('picked_up');
    expect(p.asset?.noun).toBe('vehicle');
    expect(p.due).toBe('optional');
  });

  it('carga el perfil de la pastelería', () => {
    const p = loadProfile('bakery');
    expect(p.toolNames.open).toBe('take_cake_order');
    expect(p.asset).toBeNull();
    expect(p.orderFields.map(f => f.id)).toEqual(['flavor', 'size', 'inscription']);
    expect(p.due).toBe('required');
  });

  it('rechaza un closedStage que no está en stages', () => {
    expect(() => parseProfile({ ...minimal(), closedStage: 'ghost' })).toThrow(/closedStage/);
  });

  it('rechaza nombres de tool duplicados', () => {
    const bad = minimal();
    bad.toolNames.find = bad.toolNames.open;
    expect(() => parseProfile(bad)).toThrow(/duplicado/);
  });

  it('rechaza un spokenAs con un campo inexistente', () => {
    const bad = minimal();
    bad.asset = { noun: 'vehicle', fields: [{ id: 'make', type: 'string', required: true }], spokenAs: '{year} {make}' };
    expect(() => parseProfile(bad)).toThrow(/spokenAs/);
  });
});

function minimal(): any {
  return {
    id: 'test',
    nouns: { order: 'order', orders: 'orders', item: 'item', items: 'items', customer: 'customer' },
    synonyms: { order: ['ticket'], item: ['part'] },
    toolNames: {
      snapshot: 'get_snapshot', find: 'find_orders', open: 'open_order', move: 'move_order_stage',
      addLine: 'add_to_order', stock: 'check_stock', reorder: 'reorder_stock',
      closeOut: 'close_out_order', salesReport: 'sales_report'
    },
    stages: [{ id: 'new', label: 'new' }, { id: 'done', label: 'done' }],
    closedStage: 'done',
    closeFrom: ['new'],
    asset: null,
    orderFields: [],
    due: 'optional'
  };
}
```

- [ ] **Step 2: Correr la prueba y verificar que falla**

Run: `npx vitest run test/unit/profiles.test.ts`
Expected: FAIL — no existe `src/profiles/load.ts`.

- [ ] **Step 3: Escribir el esquema**

`src/profiles/schema.ts`:

```typescript
import * as z from 'zod/v4';

export const TOOL_KEYS = ['snapshot', 'find', 'open', 'move', 'addLine', 'stock', 'reorder', 'closeOut', 'salesReport'] as const;
export type ToolKey = (typeof TOOL_KEYS)[number];

const toolName = z.string().regex(/^[a-z][a-z0-9_]{2,63}$/, 'nombre de tool inválido');
const fieldDef = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  type: z.enum(['string', 'integer']),
  required: z.boolean()
});

export const profileSchema = z.object({
  id: z.string().min(1),
  nouns: z.object({
    order: z.string(), orders: z.string(), item: z.string(), items: z.string(), customer: z.string()
  }),
  synonyms: z.object({ order: z.array(z.string()), item: z.array(z.string()) }),
  toolNames: z.object(Object.fromEntries(TOOL_KEYS.map(k => [k, toolName])) as Record<ToolKey, typeof toolName>),
  stages: z.array(z.object({ id: z.string(), label: z.string() })).min(2),
  closedStage: z.string(),
  closeFrom: z.array(z.string()).min(1),
  asset: z.object({ noun: z.string(), fields: z.array(fieldDef).min(1), spokenAs: z.string() }).nullable(),
  orderFields: z.array(fieldDef),
  due: z.enum(['none', 'optional', 'required'])
});

export type FieldDef = z.infer<typeof fieldDef>;
export type Profile = z.infer<typeof profileSchema>;
export type StageDef = Profile['stages'][number];
export type AssetDef = NonNullable<Profile['asset']>;
```

- [ ] **Step 4: Escribir el cargador con las reglas que zod no cubre**

`src/profiles/load.ts`:

```typescript
import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { profileSchema, TOOL_KEYS, type Profile } from './schema.js';

const DIR = path.join(import.meta.dirname, '.');

export function parseProfile(raw: unknown): Profile {
  const p = profileSchema.parse(raw);
  const stageIds = new Set(p.stages.map(s => s.id));

  if (!stageIds.has(p.closedStage)) {
    throw new Error(`closedStage "${p.closedStage}" no está en stages`);
  }
  for (const s of p.closeFrom) {
    if (!stageIds.has(s)) throw new Error(`closeFrom contiene "${s}", que no está en stages`);
    if (s === p.closedStage) throw new Error(`closeFrom no puede incluir closedStage`);
  }

  const names = TOOL_KEYS.map(k => p.toolNames[k]);
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);
  if (dupes.length > 0) throw new Error(`nombre de tool duplicado: ${dupes[0]}`);

  if (p.asset) {
    const fieldIds = new Set(p.asset.fields.map(f => f.id));
    for (const m of p.asset.spokenAs.matchAll(/\{([a-z0-9_]+)\}/g)) {
      if (!fieldIds.has(m[1]!)) throw new Error(`spokenAs usa "{${m[1]}}", que no es un campo del activo`);
    }
  }

  return p;
}

export function loadProfile(id: string): Profile {
  const file = path.join(DIR, `${id}.yaml`);
  return parseProfile(parseYaml(fs.readFileSync(file, 'utf8')));
}
```

Nota: `import.meta.dirname` apunta a `dist/src/profiles` al compilar, así que los `.yaml` se copian en el build. Agrega al `package.json`:

```bash
npm pkg set scripts.build="tsc -p tsconfig.json && node -e \"fs.cpSync('src/profiles','dist/src/profiles',{recursive:true,filter:p=>!p.endsWith('.ts')})\" --require fs"
```

Si esa línea da problemas en tu shell, crea `infra/copy-assets.mjs` con `import fs from 'node:fs'; fs.cpSync('src/profiles','dist/src/profiles',{recursive:true});` y usa `tsc -p tsconfig.json && node infra/copy-assets.mjs`.

- [ ] **Step 5: Escribir los dos perfiles**

`src/profiles/auto-repair.yaml`:

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

`src/profiles/bakery.yaml`:

```yaml
id: bakery
nouns: { order: cake order, orders: cake orders, item: ingredient, items: ingredients, customer: customer }
synonyms:
  order: [order, cake, ticket]
  item: [ingredient, supply]
toolNames:
  snapshot: get_bakery_snapshot
  find: find_cake_orders
  open: take_cake_order
  move: move_cake_order_stage
  addLine: add_to_cake_order
  stock: check_ingredients
  reorder: reorder_ingredients
  closeOut: close_out_cake_order
  salesReport: sales_report
stages:
  - { id: ordered, label: ordered }
  - { id: baking, label: baking }
  - { id: decorating, label: decorating }
  - { id: ready, label: ready }
  - { id: picked_up, label: picked up }
closedStage: picked_up
closeFrom: [ready]
asset: null
orderFields:
  - { id: flavor, type: string, required: true }
  - { id: size, type: string, required: true }
  - { id: inscription, type: string, required: false }
due: required
```

- [ ] **Step 6: Correr las pruebas y verificar que pasan**

Run: `npx vitest run test/unit/profiles.test.ts`
Expected: PASS, los 5 casos.

- [ ] **Step 7: Commit**

```bash
git add src/profiles test/unit/profiles.test.ts package.json
git commit -m "feat: add business profile schema, loader and the two demo profiles"
```

---

## Task 3: Dinero y fechas

**Files:**
- Create: `src/domain/money.ts`, `src/domain/dates.ts`
- Test: `test/unit/money.test.ts`, `test/unit/dates.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `formatMoney(cents: number): string` — `"$412.50"`.
  - `taxOn(taxableSubtotalCents: number, taxRateBps: number): number` — half-up, una sola vez.
  - `businessToday(timezone: string, now: Date): string` — `YYYY-MM-DD`.
  - `shiftDays(dateIso: string, days: number): string` — mueve una fecha civil N días.
  - `resolveDue(input: string, timezone: string, now: Date): string | null` — `today`, `tomorrow`, día de la semana o `YYYY-MM-DD`.
  - `type Period = 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month'`
  - `periodRange(period: Period, timezone: string, now: Date): { from: string; to: string; prevFrom: string; prevTo: string }` — rangos inclusivos.

- [ ] **Step 1: Escribir las pruebas que fallan**

`test/unit/money.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { formatMoney, taxOn } from '../../src/domain/money.js';

describe('dinero', () => {
  it('formatea centavos', () => {
    expect(formatMoney(41250)).toBe('$412.50');
    expect(formatMoney(0)).toBe('$0.00');
    expect(formatMoney(5)).toBe('$0.05');
  });

  it('calcula impuesto con redondeo half-up', () => {
    expect(taxOn(10000, 825)).toBe(825);
    expect(taxOn(1250, 825)).toBe(103);   // 103.125 -> 103
    expect(taxOn(1000, 825)).toBe(83);    // 82.5 -> 83
    expect(taxOn(0, 825)).toBe(0);
  });
});
```

`test/unit/dates.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { businessToday, periodRange, resolveDue } from '../../src/domain/dates.js';

const TZ = 'America/Chicago';

describe('fechas', () => {
  it('usa la zona del negocio, no la del servidor', () => {
    // 2026-09-15T02:30:00Z sigue siendo 14 de septiembre en Chicago
    expect(businessToday(TZ, new Date('2026-09-15T02:30:00Z'))).toBe('2026-09-14');
  });

  it('resuelve today y tomorrow', () => {
    const now = new Date('2026-09-15T15:00:00Z'); // martes 15 en Chicago
    expect(resolveDue('today', TZ, now)).toBe('2026-09-15');
    expect(resolveDue('tomorrow', TZ, now)).toBe('2026-09-16');
  });

  it('resuelve el próximo día de la semana, incluyendo hoy', () => {
    const now = new Date('2026-09-15T15:00:00Z'); // martes
    expect(resolveDue('saturday', TZ, now)).toBe('2026-09-19');
    expect(resolveDue('tuesday', TZ, now)).toBe('2026-09-15');
  });

  it('acepta una fecha explícita y rechaza basura', () => {
    const now = new Date('2026-09-15T15:00:00Z');
    expect(resolveDue('2026-12-24', TZ, now)).toBe('2026-12-24');
    expect(resolveDue('whenever', TZ, now)).toBeNull();
  });

  it('calcula la semana actual de lunes a domingo y la anterior', () => {
    const now = new Date('2026-09-15T15:00:00Z'); // martes
    expect(periodRange('this_week', TZ, now)).toEqual({
      from: '2026-09-14', to: '2026-09-20', prevFrom: '2026-09-07', prevTo: '2026-09-13'
    });
  });

  it('calcula el mes actual y el anterior', () => {
    const now = new Date('2026-09-15T15:00:00Z');
    expect(periodRange('this_month', TZ, now)).toEqual({
      from: '2026-09-01', to: '2026-09-30', prevFrom: '2026-08-01', prevTo: '2026-08-31'
    });
  });
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npx vitest run test/unit/money.test.ts test/unit/dates.test.ts`
Expected: FAIL — no existen los módulos.

- [ ] **Step 3: Implementar `money.ts`**

```typescript
/** Formatea centavos como dólares para texto hablado o UI. */
export function formatMoney(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Impuesto sobre el subtotal gravable, en centavos, con redondeo half-up una sola vez. */
export function taxOn(taxableSubtotalCents: number, taxRateBps: number): number {
  return Math.floor((taxableSubtotalCents * taxRateBps) / 10_000 + 0.5);
}
```

- [ ] **Step 4: Implementar `dates.ts`**

```typescript
export type Period = 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month';

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** Fecha civil (YYYY-MM-DD) en la zona del negocio. */
export function businessToday(timezone: string, now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(now);
}

/** Índice de día de la semana (0 = domingo) en la zona del negocio. */
function weekdayIndex(dateIso: string): number {
  return new Date(`${dateIso}T12:00:00Z`).getUTCDay();
}

export function shiftDays(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Resuelve "today", "tomorrow", un día de la semana o YYYY-MM-DD. Devuelve null si no entiende. */
export function resolveDue(input: string, timezone: string, now: Date): string | null {
  const value = input.trim().toLowerCase();
  const today = businessToday(timezone, now);

  if (value === 'today') return today;
  if (value === 'tomorrow') return shiftDays(today, 1);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const target = WEEKDAYS.indexOf(value);
  if (target >= 0) {
    const delta = (target - weekdayIndex(today) + 7) % 7;
    return shiftDays(today, delta);
  }
  return null;
}

/** Rangos inclusivos del periodo y del periodo anterior. Semanas de lunes a domingo. */
export function periodRange(period: Period, timezone: string, now: Date): {
  from: string; to: string; prevFrom: string; prevTo: string;
} {
  const today = businessToday(timezone, now);
  const mondayOffset = (weekdayIndex(today) + 6) % 7;

  switch (period) {
    case 'today':
      return { from: today, to: today, prevFrom: shiftDays(today, -1), prevTo: shiftDays(today, -1) };
    case 'yesterday': {
      const y = shiftDays(today, -1);
      return { from: y, to: y, prevFrom: shiftDays(y, -1), prevTo: shiftDays(y, -1) };
    }
    case 'this_week': {
      const from = shiftDays(today, -mondayOffset);
      return { from, to: shiftDays(from, 6), prevFrom: shiftDays(from, -7), prevTo: shiftDays(from, -1) };
    }
    case 'last_week': {
      const from = shiftDays(today, -mondayOffset - 7);
      return { from, to: shiftDays(from, 6), prevFrom: shiftDays(from, -7), prevTo: shiftDays(from, -1) };
    }
    case 'this_month':
      return monthRange(today.slice(0, 7));
    case 'last_month': {
      const [y, m] = today.split('-').map(Number) as [number, number];
      const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
      return monthRange(prev);
    }
  }
}

function monthRange(ym: string): { from: string; to: string; prevFrom: string; prevTo: string } {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  const from = `${ym}-01`;
  const to = `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
  const prevYm = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  const [py, pm] = prevYm.split('-').map(Number) as [number, number];
  return {
    from, to,
    prevFrom: `${prevYm}-01`,
    prevTo: `${prevYm}-${String(new Date(Date.UTC(py, pm, 0)).getUTCDate()).padStart(2, '0')}`
  };
}
```

- [ ] **Step 5: Correr y verificar que pasan**

Run: `npx vitest run test/unit/money.test.ts test/unit/dates.test.ts`
Expected: PASS, los 8 casos.

- [ ] **Step 6: Commit**

```bash
git add src/domain/money.ts src/domain/dates.ts test/unit/money.test.ts test/unit/dates.test.ts
git commit -m "feat: add money and business-timezone date helpers"
```

---

## Task 4: Tipos del dominio y reglas de órdenes

**Files:**
- Create: `src/domain/types.ts`, `src/domain/orders.ts`
- Test: `test/unit/orders.test.ts`

**Interfaces:**
- Consumes: `taxOn`, `formatMoney` (Task 3); `Profile` (Task 2).
- Produces (tipos en `types.ts`):

```typescript
export interface Business { id: string; name: string; profileId: string; timezone: string; taxRateBps: number; nextOrderNumber: number; version: number }
export interface Customer { id: string; name: string; nameNormalized: string; phone?: string }
export interface Asset { id: string; customerId: string; fields: Record<string, string | number>; spokenLabel: string }
export interface CatalogItem { id: string; name: string; synonyms: string[]; kind: 'part' | 'labor' | 'product' | 'ingredient' | 'supply'; unit: string; priceCents: number; taxable: boolean; stocked: boolean; onHand: number; reorderPoint: number; reorderQty: number; supplierId?: string; consumes: Record<string, number>; version: number }
export interface OrderLine { itemId: string; name: string; quantity: number; unitPriceCents: number; taxable: boolean; backordered: number }
export interface Order { id: string; number: number; customerId: string; assetId?: string; stage: string; fields: Record<string, string>; dueOn?: string; description?: string; lines: OrderLine[]; subtotalCents: number; taxCents: number; totalCents: number; stageHistory: Array<{ stage: string; at: string }>; createdAt: string; closedAt?: string; version: number }
export interface Payment { id: string; orderId: string; amountCents: number; method: 'cash' | 'card' | 'check'; paidAt: string }
export interface PurchaseOrder { id: string; supplierId: string; lines: Array<{ itemId: string; qty: number }>; status: 'open' | 'received'; createdAt: string }
```

- Produces (funciones en `orders.ts`):
  - `recalcTotals(order: Order, taxRateBps: number): Order`
  - `newOrder(input: { id, number, customerId, assetId?, fields, dueOn?, description?, stage, now }): Order`
  - `moveStage(order: Order, stage: string, profile: Profile, now: Date): { ok: true; order: Order } | { ok: false; code: 'INVALID_STAGE'; reason: 'closed' | 'use_close_out' | 'unknown_stage' }`
  - `closeOut(order: Order, method: Payment['method'], profile: Profile, now: Date, paymentId: string): { ok: true; order: Order; payment: Payment } | { ok: false; code: 'CANNOT_CLOSE' }`

- [ ] **Step 1: Escribir la prueba que falla**

`test/unit/orders.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { loadProfile } from '../../src/profiles/load.js';
import { closeOut, moveStage, newOrder, recalcTotals } from '../../src/domain/orders.js';
import type { Order } from '../../src/domain/types.js';

const profile = loadProfile('auto-repair');
const NOW = new Date('2026-09-15T15:00:00Z');

function orderWithLines(): Order {
  const base = newOrder({
    id: 'o1', number: 42, customerId: 'c1', assetId: 'a1', fields: {},
    stage: 'estimate', now: NOW
  });
  base.lines = [
    { itemId: 'i1', name: 'Front brake pads', quantity: 2, unitPriceCents: 4500, taxable: true, backordered: 0 },
    { itemId: 'i2', name: 'Brake job labor', quantity: 1.5, unitPriceCents: 12000, taxable: false, backordered: 0 }
  ];
  return recalcTotals(base, 825);
}

describe('órdenes', () => {
  it('suma partidas y cobra impuesto solo sobre lo gravable', () => {
    const o = orderWithLines();
    expect(o.subtotalCents).toBe(9000 + 18000);
    expect(o.taxCents).toBe(743); // 8.25% de 9000 = 742.5 -> 743
    expect(o.totalCents).toBe(27743);
  });

  it('cambia de etapa y guarda historial', () => {
    const r = moveStage(orderWithLines(), 'in_bay', profile, NOW);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.order.stage).toBe('in_bay');
      expect(r.order.stageHistory.at(-1)).toEqual({ stage: 'in_bay', at: NOW.toISOString() });
    }
  });

  it('no deja mover a la etapa de cierre', () => {
    const r = moveStage(orderWithLines(), 'picked_up', profile, NOW);
    expect(r).toEqual({ ok: false, code: 'INVALID_STAGE', reason: 'use_close_out' });
  });

  it('no deja mover una orden cerrada', () => {
    const closed = { ...orderWithLines(), stage: 'picked_up', closedAt: NOW.toISOString() };
    const r = moveStage(closed, 'in_bay', profile, NOW);
    expect(r).toEqual({ ok: false, code: 'INVALID_STAGE', reason: 'closed' });
  });

  it('cierra desde ready_for_pickup y genera el cobro', () => {
    const ready = { ...orderWithLines(), stage: 'ready_for_pickup' };
    const r = closeOut(ready, 'card', profile, NOW, 'p1');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.order.stage).toBe('picked_up');
      expect(r.order.closedAt).toBe(NOW.toISOString());
      expect(r.payment).toEqual({
        id: 'p1', orderId: 'o1', amountCents: 27743, method: 'card', paidAt: NOW.toISOString()
      });
    }
  });

  it('no cierra desde una etapa que no está en closeFrom', () => {
    const r = closeOut({ ...orderWithLines(), stage: 'in_bay' }, 'cash', profile, NOW, 'p1');
    expect(r).toEqual({ ok: false, code: 'CANNOT_CLOSE' });
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run test/unit/orders.test.ts`
Expected: FAIL — no existen `types.ts` ni `orders.ts`.

- [ ] **Step 3: Escribir `src/domain/types.ts`**

Copia exactamente los tipos del bloque **Produces** de esta tarea.

- [ ] **Step 4: Implementar `src/domain/orders.ts`**

```typescript
import type { Profile } from '../profiles/schema.js';
import { taxOn } from './money.js';
import type { Order, Payment } from './types.js';

/** Recalcula subtotal, impuesto y total desde las partidas. */
export function recalcTotals(order: Order, taxRateBps: number): Order {
  let subtotal = 0;
  let taxable = 0;
  for (const line of order.lines) {
    const amount = Math.round(line.quantity * line.unitPriceCents);
    subtotal += amount;
    if (line.taxable) taxable += amount;
  }
  const taxCents = taxOn(taxable, taxRateBps);
  return { ...order, subtotalCents: subtotal, taxCents, totalCents: subtotal + taxCents };
}

export function newOrder(input: {
  id: string; number: number; customerId: string; assetId?: string;
  fields: Record<string, string>; dueOn?: string; description?: string; stage: string; now: Date;
}): Order {
  return {
    id: input.id, number: input.number, customerId: input.customerId, assetId: input.assetId,
    stage: input.stage, fields: input.fields, dueOn: input.dueOn, description: input.description,
    lines: [], subtotalCents: 0, taxCents: 0, totalCents: 0,
    stageHistory: [{ stage: input.stage, at: input.now.toISOString() }],
    createdAt: input.now.toISOString(), version: 1
  };
}

export function isClosed(order: Order, profile: Profile): boolean {
  return order.stage === profile.closedStage;
}

export function moveStage(order: Order, stage: string, profile: Profile, now: Date):
  | { ok: true; order: Order }
  | { ok: false; code: 'INVALID_STAGE'; reason: 'closed' | 'use_close_out' | 'unknown_stage' } {
  if (isClosed(order, profile)) return { ok: false, code: 'INVALID_STAGE', reason: 'closed' };
  if (stage === profile.closedStage) return { ok: false, code: 'INVALID_STAGE', reason: 'use_close_out' };
  if (!profile.stages.some(s => s.id === stage)) {
    return { ok: false, code: 'INVALID_STAGE', reason: 'unknown_stage' };
  }
  if (order.stage === stage) return { ok: true, order }; // idempotente
  return {
    ok: true,
    order: { ...order, stage, stageHistory: [...order.stageHistory, { stage, at: now.toISOString() }] }
  };
}

export function closeOut(
  order: Order, method: Payment['method'], profile: Profile, now: Date, paymentId: string
): { ok: true; order: Order; payment: Payment } | { ok: false; code: 'CANNOT_CLOSE' } {
  if (!profile.closeFrom.includes(order.stage)) return { ok: false, code: 'CANNOT_CLOSE' };
  const at = now.toISOString();
  return {
    ok: true,
    order: {
      ...order, stage: profile.closedStage, closedAt: at,
      stageHistory: [...order.stageHistory, { stage: profile.closedStage, at }]
    },
    payment: { id: paymentId, orderId: order.id, amountCents: order.totalCents, method, paidAt: at }
  };
}
```

- [ ] **Step 5: Correr y verificar que pasan**

Run: `npx vitest run test/unit/orders.test.ts`
Expected: PASS, los 6 casos.

- [ ] **Step 6: Commit**

```bash
git add src/domain/types.ts src/domain/orders.ts test/unit/orders.test.ts
git commit -m "feat: add order domain rules for totals, stages and close-out"
```

---

## Task 5: Inventario, consumo y reorden

**Files:**
- Create: `src/domain/inventory.ts`
- Test: `test/unit/inventory.test.ts`

**Interfaces:**
- Consumes: `CatalogItem`, `Order`, `OrderLine`, `PurchaseOrder` (Task 4).
- Produces:
  - `findItem(query: string, items: CatalogItem[]): { kind: 'one'; item: CatalogItem } | { kind: 'none'; suggestions: CatalogItem[] } | { kind: 'ambiguous'; candidates: CatalogItem[] }`
  - `addLineToOrder(item: CatalogItem, quantity: number, items: CatalogItem[]): { line: OrderLine; itemUpdates: CatalogItem[] }` — descuenta el ítem y lo que consume; `backordered` sale de lo que no alcanzó.
  - `lowStock(items: CatalogItem[]): CatalogItem[]`
  - `planReorder(items: CatalogItem[], openOrders: Order[], openPOs: PurchaseOrder[], only?: CatalogItem): { purchaseOrders: Array<{ supplierId: string; lines: Array<{ itemId: string; qty: number }> }>; skipped: CatalogItem[] }`

- [ ] **Step 1: Escribir la prueba que falla**

`test/unit/inventory.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { addLineToOrder, findItem, lowStock, planReorder } from '../../src/domain/inventory.js';
import type { CatalogItem, Order } from '../../src/domain/types.js';

function item(over: Partial<CatalogItem> & { id: string; name: string }): CatalogItem {
  return {
    synonyms: [], kind: 'part', unit: 'each', priceCents: 1000, taxable: true, stocked: true,
    onHand: 10, reorderPoint: 2, reorderQty: 12, supplierId: 's1', consumes: {}, version: 1, ...over
  };
}

const pads = item({ id: 'i1', name: 'Front brake pads', synonyms: ['brake pads'], onHand: 1, priceCents: 4500 });
const filter = item({ id: 'i2', name: 'Oil filter', onHand: 4, reorderPoint: 5 });
const oil = item({ id: 'i3', name: '5W-30 quart', synonyms: ['5w30'], onHand: 20, unit: 'quart' });
const oilChange = item({
  id: 'i4', name: 'Oil change', kind: 'labor', stocked: false, taxable: false,
  priceCents: 6000, consumes: { i2: 1, i3: 5 }
});

const emptyOrder: Order = {
  id: 'o1', number: 42, customerId: 'c1', stage: 'estimate', fields: {}, lines: [],
  subtotalCents: 0, taxCents: 0, totalCents: 0, stageHistory: [], createdAt: '2026-09-15T15:00:00.000Z', version: 1
};

describe('inventario', () => {
  it('encuentra un ítem por nombre o sinónimo', () => {
    expect(findItem('brake pads', [pads, filter])).toEqual({ kind: 'one', item: pads });
    expect(findItem('5w30', [oil, filter])).toEqual({ kind: 'one', item: oil });
  });

  it('devuelve sugerencias cuando no encuentra nada', () => {
    const r = findItem('blinker fluid', [pads, filter, oil]);
    expect(r.kind).toBe('none');
  });

  it('descuenta stock y marca backorder cuando no alcanza', () => {
    const { line, itemUpdates } = addLineToOrder(pads, 2, [pads, filter, oil]);
    expect(line).toEqual({
      itemId: 'i1', name: 'Front brake pads', quantity: 2, unitPriceCents: 4500, taxable: true, backordered: 1
    });
    expect(itemUpdates.find(i => i.id === 'i1')!.onHand).toBe(0);
  });

  it('descuenta también lo que el ítem consume', () => {
    const { itemUpdates } = addLineToOrder(oilChange, 1, [pads, filter, oil, oilChange]);
    expect(itemUpdates.find(i => i.id === 'i2')!.onHand).toBe(3);
    expect(itemUpdates.find(i => i.id === 'i3')!.onHand).toBe(15);
  });

  it('lista lo que está en o por debajo del punto de reorden', () => {
    expect(lowStock([pads, filter, oil, oilChange]).map(i => i.id)).toEqual(['i1', 'i2']);
  });

  it('agrupa el reorden por proveedor y suma los backorders', () => {
    const orderWithBackorder: Order = {
      ...emptyOrder,
      lines: [{ itemId: 'i1', name: 'Front brake pads', quantity: 2, unitPriceCents: 4500, taxable: true, backordered: 1 }]
    };
    const r = planReorder([pads, filter], [orderWithBackorder], []);
    expect(r.purchaseOrders).toEqual([
      { supplierId: 's1', lines: [{ itemId: 'i1', qty: 13 }, { itemId: 'i2', qty: 12 }] }
    ]);
  });

  it('omite ítems que ya tienen orden de compra abierta', () => {
    const r = planReorder([pads, filter], [], [
      { id: 'po1', supplierId: 's1', lines: [{ itemId: 'i1', qty: 12 }], status: 'open', createdAt: '2026-09-14T00:00:00.000Z' }
    ]);
    expect(r.skipped.map(i => i.id)).toEqual(['i1']);
    expect(r.purchaseOrders).toEqual([{ supplierId: 's1', lines: [{ itemId: 'i2', qty: 12 }] }]);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run test/unit/inventory.test.ts`
Expected: FAIL — no existe `src/domain/inventory.ts`.

- [ ] **Step 3: Implementar `src/domain/inventory.ts`**

```typescript
import { tokenScore } from './resolver.js';
import type { CatalogItem, Order, OrderLine, PurchaseOrder } from './types.js';

/** Busca un ítem del catálogo por nombre o sinónimo, con el mismo criterio que las referencias habladas. */
export function findItem(query: string, items: CatalogItem[]):
  | { kind: 'one'; item: CatalogItem }
  | { kind: 'none'; suggestions: CatalogItem[] }
  | { kind: 'ambiguous'; candidates: CatalogItem[] } {
  const scored = items
    .map(item => ({ item, score: tokenScore(query, [item.name, ...item.synonyms].join(' ')) }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < 0.5) {
    return { kind: 'none', suggestions: scored.slice(0, 3).map(s => s.item) };
  }
  const second = scored[1];
  if (second && best.score - second.score <= 0.15) {
    return { kind: 'ambiguous', candidates: scored.filter(s => best.score - s.score <= 0.15).slice(0, 5).map(s => s.item) };
  }
  return { kind: 'one', item: best.item };
}

/** Arma la partida y devuelve los ítems con el stock ya descontado. `onHand` nunca baja de cero. */
export function addLineToOrder(
  item: CatalogItem, quantity: number, items: CatalogItem[]
): { line: OrderLine; itemUpdates: CatalogItem[] } {
  const updates = new Map<string, CatalogItem>();

  const take = (target: CatalogItem, qty: number): number => {
    if (!target.stocked) return 0;
    const current = updates.get(target.id) ?? target;
    const served = Math.min(current.onHand, qty);
    updates.set(target.id, { ...current, onHand: current.onHand - served });
    return qty - served;
  };

  const backordered = take(item, quantity);

  for (const [consumedId, perUnit] of Object.entries(item.consumes)) {
    const consumed = items.find(i => i.id === consumedId);
    if (consumed) take(consumed, perUnit * quantity);
  }

  return {
    line: {
      itemId: item.id, name: item.name, quantity,
      unitPriceCents: item.priceCents, taxable: item.taxable, backordered
    },
    itemUpdates: [...updates.values()]
  };
}

export function lowStock(items: CatalogItem[]): CatalogItem[] {
  return items.filter(i => i.stocked && i.onHand <= i.reorderPoint);
}

/** Plan de compra agrupado por proveedor. Suma los backorders pendientes y omite lo que ya está pedido. */
export function planReorder(
  items: CatalogItem[], openOrders: Order[], openPOs: PurchaseOrder[], only?: CatalogItem
): { purchaseOrders: Array<{ supplierId: string; lines: Array<{ itemId: string; qty: number }> }>; skipped: CatalogItem[] } {
  const alreadyOrdered = new Set(openPOs.flatMap(po => po.lines.map(l => l.itemId)));
  const backorders = new Map<string, number>();
  for (const order of openOrders) {
    for (const line of order.lines) {
      if (line.backordered > 0) backorders.set(line.itemId, (backorders.get(line.itemId) ?? 0) + line.backordered);
    }
  }

  const candidates = only ? [only] : lowStock(items);
  const skipped: CatalogItem[] = [];
  const bySupplier = new Map<string, Array<{ itemId: string; qty: number }>>();

  for (const item of candidates) {
    if (alreadyOrdered.has(item.id)) { skipped.push(item); continue; }
    const supplierId = item.supplierId ?? 'unassigned';
    const lines = bySupplier.get(supplierId) ?? [];
    lines.push({ itemId: item.id, qty: item.reorderQty + (backorders.get(item.id) ?? 0) });
    bySupplier.set(supplierId, lines);
  }

  return {
    purchaseOrders: [...bySupplier.entries()].map(([supplierId, lines]) => ({ supplierId, lines })),
    skipped
  };
}

```

Nota: `tokenScore` y `normalize` se implementan en la Task 6. Mientras tanto la prueba de esta tarea falla al importar; por eso el orden correcto es hacer la Task 6 antes de correr esta suite completa. Si prefieres no bloquearte, implementa primero la Task 6 y regresa al Step 4 de esta.

- [ ] **Step 4: Correr y verificar que pasan (después de la Task 6)**

Run: `npx vitest run test/unit/inventory.test.ts`
Expected: PASS, los 7 casos.

- [ ] **Step 5: Commit**

```bash
git add src/domain/inventory.ts test/unit/inventory.test.ts
git commit -m "feat: add inventory rules for stock consumption, backorders and reordering"
```

---

## Task 6: Referencias habladas

**Files:**
- Create: `src/domain/resolver.ts`
- Test: `test/unit/resolver.test.ts`

**Interfaces:**
- Consumes: `Order`, `Customer`, `Asset` (Task 4); `Profile` (Task 2).
- Produces:
  - `normalize(text: string, extraStopwords?: string[]): string[]`
  - `tokenScore(query: string, haystack: string): number` — fracción de tokens de la consulta presentes en el texto, con tolerancia a un error de dedo en tokens de 5+ letras.
  - `resolveOrder(query: string, candidates: OrderRef[], profile: Profile): { kind: 'one'; ref: OrderRef } | { kind: 'none' } | { kind: 'ambiguous'; refs: OrderRef[] }`
  - `interface OrderRef { order: Order; customer: Customer; asset?: Asset }`

- [ ] **Step 1: Escribir la prueba que falla**

`test/unit/resolver.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { loadProfile } from '../../src/profiles/load.js';
import { normalize, resolveOrder, tokenScore, type OrderRef } from '../../src/domain/resolver.js';
import type { Asset, Customer, Order } from '../../src/domain/types.js';

const profile = loadProfile('auto-repair');

function ref(number: number, customerName: string, spokenLabel: string, plate?: string): OrderRef {
  const order: Order = {
    id: `o${number}`, number, customerId: `c${number}`, assetId: `a${number}`, stage: 'in_bay', fields: {},
    lines: [], subtotalCents: 0, taxCents: 0, totalCents: 0, stageHistory: [],
    createdAt: '2026-09-15T15:00:00.000Z', version: 1
  };
  const customer: Customer = { id: `c${number}`, name: customerName, nameNormalized: customerName.toLowerCase() };
  const asset: Asset = { id: `a${number}`, customerId: `c${number}`, fields: plate ? { plate } : {}, spokenLabel };
  return { order, customer, asset };
}

const civic = ref(41, 'Dana Lee', '2019 Honda Civic', 'JHK 4821');
const camryA = ref(44, 'Mark Ortiz', '2016 Toyota Camry');
const camryB = ref(57, 'Priya Shah', '2018 Toyota Camry');

describe('referencias habladas', () => {
  it('quita palabras vacías y los sustantivos del perfil', () => {
    expect(normalize("Mrs. Johnson's work order", ['work', 'order'])).toEqual(['johnson']);
  });

  it('puntúa por tokens compartidos con tolerancia a un error de dedo', () => {
    expect(tokenScore('civic', '2019 Honda Civic')).toBe(1);
    expect(tokenScore('camery', '2016 Toyota Camry')).toBe(1);
    expect(tokenScore('accord', '2019 Honda Civic')).toBe(0);
  });

  it('resuelve por número de orden', () => {
    const r = resolveOrder('order 44', [civic, camryA, camryB], profile);
    expect(r).toEqual({ kind: 'one', ref: camryA });
  });

  it('resuelve por modelo del vehículo', () => {
    const r = resolveOrder('the Civic', [civic, camryA, camryB], profile);
    expect(r).toEqual({ kind: 'one', ref: civic });
  });

  it('resuelve por nombre del cliente en posesivo', () => {
    const r = resolveOrder("Dana's", [civic, camryA, camryB], profile);
    expect(r).toEqual({ kind: 'one', ref: civic });
  });

  it('marca ambigüedad cuando hay dos igual de buenas', () => {
    const r = resolveOrder('the Camry', [civic, camryA, camryB], profile);
    expect(r.kind).toBe('ambiguous');
    if (r.kind === 'ambiguous') expect(r.refs.map(x => x.order.number).sort()).toEqual([44, 57]);
  });

  it('no inventa cuando no hay coincidencia', () => {
    expect(resolveOrder('the Accord', [civic, camryA, camryB], profile)).toEqual({ kind: 'none' });
    expect(resolveOrder('the', [civic], profile)).toEqual({ kind: 'none' });
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run test/unit/resolver.test.ts`
Expected: FAIL — no existe `src/domain/resolver.ts`.

- [ ] **Step 3: Implementar `src/domain/resolver.ts`**

```typescript
import type { Profile } from '../profiles/schema.js';
import type { Asset, Customer, Order } from './types.js';

export interface OrderRef { order: Order; customer: Customer; asset?: Asset }

const STOPWORDS = new Set(['the', 'a', 'an', 'mr', 'mrs', 'ms', 'number', 'no', 'for', 'to', 'of']);

/** Minúsculas, sin puntuación ni posesivos, sin palabras vacías. */
export function normalize(text: string, extraStopwords: string[] = []): string[] {
  const extra = new Set(extraStopwords.map(w => w.toLowerCase()));
  return text
    .toLowerCase()
    .replace(/['']s\b/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 0 && !STOPWORDS.has(t) && !extra.has(t));
}

/** Distancia de edición con corte en 1: solo nos interesa "igual" o "a un error de distancia". */
function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function matches(queryToken: string, target: string[]): boolean {
  return target.some(t => t === queryToken || (queryToken.length >= 5 && withinOneEdit(queryToken, t)));
}

/** Fracción de tokens de la consulta que aparecen en el texto. 0 si la consulta queda vacía. */
export function tokenScore(query: string, haystack: string): number {
  const q = normalize(query);
  if (q.length === 0) return 0;
  const h = normalize(haystack);
  return q.filter(token => matches(token, h)).length / q.length;
}

export function resolveOrder(query: string, candidates: OrderRef[], profile: Profile):
  | { kind: 'one'; ref: OrderRef } | { kind: 'none' } | { kind: 'ambiguous'; refs: OrderRef[] } {
  const nouns = [profile.nouns.order, profile.nouns.orders].flatMap(n => n.split(/\s+/));
  const tokens = normalize(query, nouns);
  if (tokens.length === 0) return { kind: 'none' };

  const asNumber = tokens.find(t => /^\d+$/.test(t));
  if (asNumber) {
    const hit = candidates.find(c => c.order.number === Number(asNumber));
    if (hit) return { kind: 'one', ref: hit };
  }

  const haystack = (c: OrderRef): string => [
    c.customer.name, c.asset?.spokenLabel ?? '', String(c.asset?.fields.plate ?? ''),
    ...Object.values(c.order.fields), c.order.description ?? ''
  ].join(' ');

  const scored = candidates
    .map(ref => ({ ref, score: tokenScore(tokens.join(' '), haystack(ref)) }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < 0.5) return { kind: 'none' };

  const tied = scored.filter(s => best.score - s.score <= 0.15);
  if (tied.length > 1) return { kind: 'ambiguous', refs: tied.slice(0, 5).map(s => s.ref) };
  return { kind: 'one', ref: best.ref };
}
```

- [ ] **Step 4: Correr y verificar que pasan**

Run: `npx vitest run test/unit/resolver.test.ts test/unit/inventory.test.ts`
Expected: PASS — 7 casos del resolver y los 7 de inventario, que ya encuentran `tokenScore`.

- [ ] **Step 5: Commit**

```bash
git add src/domain/resolver.ts test/unit/resolver.test.ts
git commit -m "feat: resolve spoken order references with fuzzy token matching"
```

---

## Task 7: Reportes

**Files:**
- Create: `src/domain/reports.ts`
- Test: `test/unit/reports.test.ts`

**Interfaces:**
- Consumes: `Order`, `Payment`, `CatalogItem` (Task 4); `OrderRef` (Task 6); `Period`, `periodRange` (Task 3); `lowStock` (Task 5).
- Produces:

```typescript
export interface Snapshot {
  todayRevenueCents: number;
  sameDayLastWeekCents: number;
  byStage: Array<{ stage: string; label: string; count: number }>;
  dueToday: Array<{ orderId: string; number: number; label: string }>;
  low: Array<{ itemId: string; name: string; onHand: number; reorderPoint: number }>;
}
export interface SalesReport {
  from: string; to: string; prevFrom: string; prevTo: string;
  totalCents: number; prevTotalCents: number; count: number; averageTicketCents: number;
  daily: Array<{ date: string; cents: number }>;
  topItems: Array<{ name: string; quantity: number; cents: number }>;
}
export function buildSnapshot(input: { profile: Profile; refs: OrderRef[]; items: CatalogItem[]; payments: Payment[]; today: string }): Snapshot
export function buildSalesReport(input: { range: { from: string; to: string; prevFrom: string; prevTo: string }; payments: Payment[]; orders: Order[] }): SalesReport
```

- `payments` de `buildSnapshot` cubre desde `sameDayLastWeek` hasta `today`; la función separa los dos días.
- `payments` de `buildSalesReport` cubre `prevFrom..to`; la función separa periodo y periodo anterior por fecha (`paidAt.slice(0, 10)` ya viene en fecha del negocio desde el store).

- [ ] **Step 1: Escribir la prueba que falla**

`test/unit/reports.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { loadProfile } from '../../src/profiles/load.js';
import { buildSalesReport, buildSnapshot } from '../../src/domain/reports.js';
import type { CatalogItem, Order, Payment } from '../../src/domain/types.js';
import type { OrderRef } from '../../src/domain/resolver.js';

const profile = loadProfile('auto-repair');

function order(over: Partial<Order> & { id: string; number: number }): Order {
  return {
    customerId: 'c1', stage: 'in_bay', fields: {}, lines: [], subtotalCents: 0, taxCents: 0,
    totalCents: 0, stageHistory: [], createdAt: '2026-09-15T15:00:00.000Z', version: 1, ...over
  };
}
function ref(o: Order): OrderRef {
  return { order: o, customer: { id: 'c1', name: 'Dana Lee', nameNormalized: 'dana lee' },
           asset: { id: 'a1', customerId: 'c1', fields: {}, spokenLabel: '2019 Honda Civic' } };
}
function pay(id: string, orderId: string, cents: number, date: string): Payment {
  return { id, orderId, amountCents: cents, method: 'card', paidAt: `${date}T18:00:00.000Z` };
}
const item: CatalogItem = {
  id: 'i1', name: 'Oil filter', synonyms: [], kind: 'part', unit: 'each', priceCents: 900,
  taxable: true, stocked: true, onHand: 1, reorderPoint: 5, reorderQty: 12, consumes: {}, version: 1
};

describe('reportes', () => {
  it('arma el resumen del día', () => {
    const a = order({ id: 'o1', number: 41, stage: 'in_bay', dueOn: '2026-09-15' });
    const b = order({ id: 'o2', number: 42, stage: 'waiting_on_parts' });
    const s = buildSnapshot({
      profile, refs: [ref(a), ref(b)], items: [item], today: '2026-09-15',
      payments: [pay('p1', 'o3', 12000, '2026-09-15'), pay('p2', 'o4', 9000, '2026-09-08')]
    });
    expect(s.todayRevenueCents).toBe(12000);
    expect(s.sameDayLastWeekCents).toBe(9000);
    expect(s.byStage).toEqual([
      { stage: 'in_bay', label: 'in the bay', count: 1 },
      { stage: 'waiting_on_parts', label: 'waiting on parts', count: 1 }
    ]);
    expect(s.dueToday).toEqual([{ orderId: 'o1', number: 41, label: '2019 Honda Civic' }]);
    expect(s.low).toEqual([{ itemId: 'i1', name: 'Oil filter', onHand: 1, reorderPoint: 5 }]);
  });

  it('arma el reporte de ventas con comparación y top de ítems', () => {
    const paid = order({
      id: 'o1', number: 41,
      lines: [{ itemId: 'i1', name: 'Oil filter', quantity: 2, unitPriceCents: 900, taxable: true, backordered: 0 }]
    });
    const r = buildSalesReport({
      range: { from: '2026-09-14', to: '2026-09-20', prevFrom: '2026-09-07', prevTo: '2026-09-13' },
      payments: [pay('p1', 'o1', 10000, '2026-09-15'), pay('p2', 'o1', 5000, '2026-09-16'), pay('p3', 'o1', 8000, '2026-09-09')],
      orders: [paid]
    });
    expect(r.totalCents).toBe(15000);
    expect(r.prevTotalCents).toBe(8000);
    expect(r.count).toBe(2);
    expect(r.averageTicketCents).toBe(7500);
    expect(r.daily).toEqual([{ date: '2026-09-15', cents: 10000 }, { date: '2026-09-16', cents: 5000 }]);
    expect(r.topItems).toEqual([{ name: 'Oil filter', quantity: 4, cents: 3600 }]);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run test/unit/reports.test.ts`
Expected: FAIL — no existe `src/domain/reports.ts`.

- [ ] **Step 3: Implementar `src/domain/reports.ts`**

```typescript
import type { Profile } from '../profiles/schema.js';
import { shiftDays } from './dates.js';
import { lowStock } from './inventory.js';
import type { OrderRef } from './resolver.js';
import type { CatalogItem, Order, Payment } from './types.js';

export interface Snapshot {
  todayRevenueCents: number;
  sameDayLastWeekCents: number;
  byStage: Array<{ stage: string; label: string; count: number }>;
  dueToday: Array<{ orderId: string; number: number; label: string }>;
  low: Array<{ itemId: string; name: string; onHand: number; reorderPoint: number }>;
}

export interface SalesReport {
  from: string; to: string; prevFrom: string; prevTo: string;
  totalCents: number; prevTotalCents: number; count: number; averageTicketCents: number;
  daily: Array<{ date: string; cents: number }>;
  topItems: Array<{ name: string; quantity: number; cents: number }>;
}

const day = (p: Payment): string => p.paidAt.slice(0, 10);

/** Etiqueta hablable de una orden: el activo si lo hay, si no el cliente. */
export function refLabel(ref: OrderRef): string {
  return ref.asset?.spokenLabel ?? ref.customer.name;
}

export function buildSnapshot(input: {
  profile: Profile; refs: OrderRef[]; items: CatalogItem[]; payments: Payment[]; today: string;
}): Snapshot {
  const { profile, refs, items, payments, today } = input;
  const lastWeek = shiftDays(today, -7);
  const open = refs.filter(r => r.order.stage !== profile.closedStage);

  const byStage = profile.stages
    .filter(s => s.id !== profile.closedStage)
    .map(s => ({ stage: s.id, label: s.label, count: open.filter(r => r.order.stage === s.id).length }))
    .filter(s => s.count > 0);

  return {
    todayRevenueCents: payments.filter(p => day(p) === today).reduce((sum, p) => sum + p.amountCents, 0),
    sameDayLastWeekCents: payments.filter(p => day(p) === lastWeek).reduce((sum, p) => sum + p.amountCents, 0),
    byStage,
    dueToday: open
      .filter(r => r.order.dueOn === today)
      .map(r => ({ orderId: r.order.id, number: r.order.number, label: refLabel(r) })),
    low: lowStock(items).map(i => ({ itemId: i.id, name: i.name, onHand: i.onHand, reorderPoint: i.reorderPoint }))
  };
}

export function buildSalesReport(input: {
  range: { from: string; to: string; prevFrom: string; prevTo: string };
  payments: Payment[]; orders: Order[];
}): SalesReport {
  const { range, payments, orders } = input;
  const inRange = (p: Payment, from: string, to: string): boolean => day(p) >= from && day(p) <= to;

  const current = payments.filter(p => inRange(p, range.from, range.to));
  const previous = payments.filter(p => inRange(p, range.prevFrom, range.prevTo));
  const totalCents = current.reduce((sum, p) => sum + p.amountCents, 0);

  const byDay = new Map<string, number>();
  for (const p of current) byDay.set(day(p), (byDay.get(day(p)) ?? 0) + p.amountCents);

  const byItem = new Map<string, { name: string; quantity: number; cents: number }>();
  const ordersById = new Map(orders.map(o => [o.id, o]));
  for (const p of current) {
    for (const line of ordersById.get(p.orderId)?.lines ?? []) {
      const entry = byItem.get(line.itemId) ?? { name: line.name, quantity: 0, cents: 0 };
      entry.quantity += line.quantity;
      entry.cents += Math.round(line.quantity * line.unitPriceCents);
      byItem.set(line.itemId, entry);
    }
  }

  return {
    ...range,
    totalCents,
    prevTotalCents: previous.reduce((sum, p) => sum + p.amountCents, 0),
    count: current.length,
    averageTicketCents: current.length === 0 ? 0 : Math.round(totalCents / current.length),
    daily: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, cents]) => ({ date, cents })),
    topItems: [...byItem.values()].sort((a, b) => b.cents - a.cents).slice(0, 5)
  };
}
```

- [ ] **Step 4: Correr y verificar que pasan**

Run: `npx vitest run test/unit/reports.test.ts`
Expected: PASS, los 2 casos.

- [ ] **Step 5: Commit**

```bash
git add src/domain/reports.ts test/unit/reports.test.ts
git commit -m "feat: build day snapshot and sales report from orders and payments"
```

---

## Task 8: Interfaz de persistencia y store en memoria

**Files:**
- Create: `src/store/store.ts`, `src/store/memory.ts`
- Test: `test/unit/memory-store.test.ts`

**Interfaces:**
- Consumes: todos los tipos de `domain/types.ts` (Task 4).
- Produces:

```typescript
export class ConflictError extends Error {}

export interface Store {
  putBusiness(b: Business): Promise<void>;
  getBusiness(bizId: string): Promise<Business | null>;
  putToken(tokenHash: string, bizId: string): Promise<void>;
  getBusinessByTokenHash(tokenHash: string): Promise<Business | null>;
  takeOrderNumber(bizId: string): Promise<number>;
  listCustomers(bizId: string): Promise<Customer[]>;
  putCustomer(bizId: string, c: Customer): Promise<void>;
  listAssets(bizId: string): Promise<Asset[]>;
  putAsset(bizId: string, a: Asset): Promise<void>;
  listOrders(bizId: string): Promise<Order[]>;
  getOrder(bizId: string, orderId: string): Promise<Order | null>;
  putOrder(bizId: string, o: Order): Promise<void>;
  listItems(bizId: string): Promise<CatalogItem[]>;
  putItems(bizId: string, items: CatalogItem[]): Promise<void>;
  commitOrderWithItems(bizId: string, order: Order, items: CatalogItem[]): Promise<void>;
  commitClose(bizId: string, order: Order, payment: Payment): Promise<void>;
  listPayments(bizId: string, from: string, to: string): Promise<Payment[]>;
  listOpenPurchaseOrders(bizId: string): Promise<PurchaseOrder[]>;
  putPurchaseOrders(bizId: string, pos: PurchaseOrder[]): Promise<void>;
}
```

**Contrato de versiones:** `putOrder`, `putItems`, `commitOrderWithItems` y `commitClose` reciben registros cuyo `version` es el que el llamador leyó. El store compara contra lo guardado y, si no coincide, lanza `ConflictError`; si coincide, guarda con `version + 1`. `listPayments` filtra por fecha civil del negocio (los primeros 10 caracteres de `paidAt`), con ambos extremos inclusivos.

- [ ] **Step 1: Escribir la prueba que falla**

`test/unit/memory-store.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../../src/store/memory.js';
import { ConflictError } from '../../src/store/store.js';
import type { Business, Order } from '../../src/domain/types.js';

const biz: Business = {
  id: 'b1', name: 'Oak Street Auto', profileId: 'auto-repair',
  timezone: 'America/Chicago', taxRateBps: 825, nextOrderNumber: 41, version: 1
};

function newStore(): MemoryStore {
  const store = new MemoryStore();
  void store.putBusiness(biz);
  void store.putToken('hash-abc', 'b1');
  return store;
}

const order: Order = {
  id: 'o1', number: 41, customerId: 'c1', stage: 'in_bay', fields: {}, lines: [],
  subtotalCents: 0, taxCents: 0, totalCents: 0, stageHistory: [],
  createdAt: '2026-09-15T15:00:00.000Z', version: 1
};

describe('MemoryStore', () => {
  it('encuentra el negocio por hash de token', async () => {
    const store = newStore();
    expect((await store.getBusinessByTokenHash('hash-abc'))?.id).toBe('b1');
    expect(await store.getBusinessByTokenHash('otro')).toBeNull();
  });

  it('entrega números de orden consecutivos', async () => {
    const store = newStore();
    expect(await store.takeOrderNumber('b1')).toBe(41);
    expect(await store.takeOrderNumber('b1')).toBe(42);
  });

  it('sube la versión al guardar y rechaza versiones viejas', async () => {
    const store = newStore();
    await store.putOrder('b1', order);
    const saved = await store.getOrder('b1', 'o1');
    expect(saved?.version).toBe(2);
    await expect(store.putOrder('b1', order)).rejects.toBeInstanceOf(ConflictError);
  });

  it('devuelve copias, no referencias', async () => {
    const store = newStore();
    await store.putOrder('b1', order);
    const first = await store.getOrder('b1', 'o1');
    first!.stage = 'mutado';
    expect((await store.getOrder('b1', 'o1'))?.stage).toBe('in_bay');
  });

  it('filtra cobros por rango de fechas inclusivo', async () => {
    const store = newStore();
    await store.commitClose('b1', { ...order, version: 1 },
      { id: 'p1', orderId: 'o1', amountCents: 1000, method: 'cash', paidAt: '2026-09-15T18:00:00.000Z' });
    expect(await store.listPayments('b1', '2026-09-15', '2026-09-15')).toHaveLength(1);
    expect(await store.listPayments('b1', '2026-09-16', '2026-09-20')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run test/unit/memory-store.test.ts`
Expected: FAIL — no existen los módulos.

- [ ] **Step 3: Escribir `src/store/store.ts`**

Copia la interfaz completa del bloque **Produces** de esta tarea, más:

```typescript
export class ConflictError extends Error {
  constructor(what: string) {
    super(`conflicto de versión en ${what}`);
    this.name = 'ConflictError';
  }
}
```

- [ ] **Step 4: Implementar `src/store/memory.ts`**

```typescript
import type { Asset, Business, CatalogItem, Customer, Order, Payment, PurchaseOrder } from '../domain/types.js';
import { ConflictError, type Store } from './store.js';

interface Tenant {
  business: Business;
  customers: Map<string, Customer>;
  assets: Map<string, Asset>;
  orders: Map<string, Order>;
  items: Map<string, CatalogItem>;
  payments: Payment[];
  purchaseOrders: Map<string, PurchaseOrder>;
}

const copy = <T>(value: T): T => structuredClone(value);

export class MemoryStore implements Store {
  private tenants = new Map<string, Tenant>();
  private tokens = new Map<string, string>();

  private tenant(bizId: string): Tenant {
    const t = this.tenants.get(bizId);
    if (!t) throw new Error(`negocio desconocido: ${bizId}`);
    return t;
  }

  async putBusiness(b: Business): Promise<void> {
    const existing = this.tenants.get(b.id);
    if (existing) {
      if (existing.business.version !== b.version) throw new ConflictError('business');
      existing.business = copy({ ...b, version: b.version + 1 });
      return;
    }
    this.tenants.set(b.id, {
      business: copy(b), customers: new Map(), assets: new Map(), orders: new Map(),
      items: new Map(), payments: [], purchaseOrders: new Map()
    });
  }

  async getBusiness(bizId: string): Promise<Business | null> {
    return this.tenants.has(bizId) ? copy(this.tenant(bizId).business) : null;
  }

  async putToken(tokenHash: string, bizId: string): Promise<void> {
    this.tokens.set(tokenHash, bizId);
  }

  async getBusinessByTokenHash(tokenHash: string): Promise<Business | null> {
    const bizId = this.tokens.get(tokenHash);
    return bizId ? this.getBusiness(bizId) : null;
  }

  async takeOrderNumber(bizId: string): Promise<number> {
    const t = this.tenant(bizId);
    const number = t.business.nextOrderNumber;
    t.business = { ...t.business, nextOrderNumber: number + 1, version: t.business.version + 1 };
    return number;
  }

  async listCustomers(bizId: string): Promise<Customer[]> { return copy([...this.tenant(bizId).customers.values()]); }
  async putCustomer(bizId: string, c: Customer): Promise<void> { this.tenant(bizId).customers.set(c.id, copy(c)); }
  async listAssets(bizId: string): Promise<Asset[]> { return copy([...this.tenant(bizId).assets.values()]); }
  async putAsset(bizId: string, a: Asset): Promise<void> { this.tenant(bizId).assets.set(a.id, copy(a)); }
  async listOrders(bizId: string): Promise<Order[]> { return copy([...this.tenant(bizId).orders.values()]); }
  async getOrder(bizId: string, orderId: string): Promise<Order | null> {
    const o = this.tenant(bizId).orders.get(orderId);
    return o ? copy(o) : null;
  }
  async listItems(bizId: string): Promise<CatalogItem[]> { return copy([...this.tenant(bizId).items.values()]); }

  async putOrder(bizId: string, o: Order): Promise<void> {
    const t = this.tenant(bizId);
    const current = t.orders.get(o.id);
    if (current && current.version !== o.version) throw new ConflictError(`order ${o.id}`);
    t.orders.set(o.id, copy({ ...o, version: o.version + 1 }));
  }

  async putItems(bizId: string, items: CatalogItem[]): Promise<void> {
    const t = this.tenant(bizId);
    for (const item of items) {
      const current = t.items.get(item.id);
      if (current && current.version !== item.version) throw new ConflictError(`item ${item.id}`);
    }
    for (const item of items) t.items.set(item.id, copy({ ...item, version: item.version + 1 }));
  }

  async commitOrderWithItems(bizId: string, order: Order, items: CatalogItem[]): Promise<void> {
    await this.putItems(bizId, items);
    await this.putOrder(bizId, order);
  }

  async commitClose(bizId: string, order: Order, payment: Payment): Promise<void> {
    await this.putOrder(bizId, order);
    this.tenant(bizId).payments.push(copy(payment));
  }

  async listPayments(bizId: string, from: string, to: string): Promise<Payment[]> {
    return copy(this.tenant(bizId).payments.filter(p => {
      const date = p.paidAt.slice(0, 10);
      return date >= from && date <= to;
    }));
  }

  async listOpenPurchaseOrders(bizId: string): Promise<PurchaseOrder[]> {
    return copy([...this.tenant(bizId).purchaseOrders.values()].filter(po => po.status === 'open'));
  }

  async putPurchaseOrders(bizId: string, pos: PurchaseOrder[]): Promise<void> {
    const t = this.tenant(bizId);
    for (const po of pos) t.purchaseOrders.set(po.id, copy(po));
  }
}
```

- [ ] **Step 5: Correr y verificar que pasan**

Run: `npx vitest run test/unit/memory-store.test.ts`
Expected: PASS, los 5 casos.

- [ ] **Step 6: Commit**

```bash
git add src/store test/unit/memory-store.test.ts
git commit -m "feat: add store interface with optimistic versioning and in-memory implementation"
```

---

## Task 9: Frases habladas

**Files:**
- Create: `src/speech/say.ts`
- Test: `test/unit/say.test.ts`

**Interfaces:**
- Consumes: `Profile` (Task 2), `OrderRef` (Task 6), `formatMoney` (Task 3), `refLabel` (Task 7), tipos del dominio (Task 4).
- Produces un objeto `say` con estas funciones, todas devolviendo inglés en una o dos oraciones, sin markdown:

```typescript
say.orderName(profile: Profile, number: number): string
say.orderPhrase(profile: Profile, ref: OrderRef): string
say.opened(profile: Profile, ref: OrderRef): string
say.moved(profile: Profile, ref: OrderRef, stageLabel: string): string
say.lineAdded(profile: Profile, ref: OrderRef, line: OrderLine, totalCents: number): string
say.closed(profile: Profile, ref: OrderRef, payment: Payment): string
say.alreadyClosed(profile: Profile, ref: OrderRef, amountCents: number): string
say.notFound(profile: Profile, query: string, open: OrderRef[]): string
say.ambiguous(profile: Profile, refs: OrderRef[]): string
say.unknownItem(profile: Profile, query: string, suggestions: CatalogItem[]): string
say.list(parts: string[]): string   // "a, b and c"
```

- [ ] **Step 1: Escribir la prueba que falla**

`test/unit/say.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { loadProfile } from '../../src/profiles/load.js';
import { say } from '../../src/speech/say.js';
import type { OrderRef } from '../../src/domain/resolver.js';
import type { Order } from '../../src/domain/types.js';

const profile = loadProfile('auto-repair');
const bakery = loadProfile('bakery');

const order: Order = {
  id: 'o1', number: 42, customerId: 'c1', assetId: 'a1', stage: 'in_bay', fields: {}, lines: [],
  subtotalCents: 0, taxCents: 0, totalCents: 41250, stageHistory: [],
  createdAt: '2026-09-15T15:00:00.000Z', version: 1
};
const ref: OrderRef = {
  order,
  customer: { id: 'c1', name: 'Dana Lee', nameNormalized: 'dana lee' },
  asset: { id: 'a1', customerId: 'c1', fields: {}, spokenLabel: '2019 Honda Civic' }
};

describe('frases', () => {
  it('nombra la orden con el sustantivo del perfil', () => {
    expect(say.orderName(profile, 42)).toBe('work order 42');
    expect(say.orderName(bakery, 7)).toBe('cake order 7');
  });

  it('describe la orden con el activo y el cliente', () => {
    expect(say.orderPhrase(profile, ref)).toBe("work order 42, Dana Lee's 2019 Honda Civic");
  });

  it('confirma una partida agregada con el nuevo total', () => {
    const line = { itemId: 'i1', name: 'Front brake pads', quantity: 2, unitPriceCents: 4500, taxable: true, backordered: 0 };
    expect(say.lineAdded(profile, ref, line, 41250))
      .toBe('Added 2 Front brake pads to work order 42. The total is now $412.50.');
  });

  it('avisa del backorder', () => {
    const line = { itemId: 'i1', name: 'Front brake pads', quantity: 2, unitPriceCents: 4500, taxable: true, backordered: 1 };
    expect(say.lineAdded(profile, ref, line, 41250)).toContain('1 is backordered');
  });

  it('enumera candidatas cuando hay ambigüedad', () => {
    const other: OrderRef = { ...ref, order: { ...order, id: 'o2', number: 57 },
      customer: { id: 'c2', name: 'Mark Ortiz', nameNormalized: 'mark ortiz' } };
    expect(say.ambiguous(profile, [ref, other]))
      .toBe("I found two: work order 42, Dana Lee's 2019 Honda Civic and work order 57, Mark Ortiz's 2019 Honda Civic. Which one?");
  });

  it('une listas en inglés', () => {
    expect(say.list(['a'])).toBe('a');
    expect(say.list(['a', 'b'])).toBe('a and b');
    expect(say.list(['a', 'b', 'c'])).toBe('a, b and c');
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run test/unit/say.test.ts`
Expected: FAIL — no existe `src/speech/say.ts`.

- [ ] **Step 3: Implementar `src/speech/say.ts`**

```typescript
import { formatMoney } from '../domain/money.js';
import { refLabel } from '../domain/reports.js';
import type { OrderRef } from '../domain/resolver.js';
import type { CatalogItem, OrderLine, Payment } from '../domain/types.js';
import type { Profile } from '../profiles/schema.js';

const COUNT_WORDS = ['no', 'one', 'two', 'three', 'four', 'five'];

function list(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

export const say = {
  list,

  orderName(profile: Profile, number: number): string {
    return `${profile.nouns.order} ${number}`;
  },

  orderPhrase(profile: Profile, ref: OrderRef): string {
    const label = refLabel(ref);
    return label === ref.customer.name
      ? `${say.orderName(profile, ref.order.number)} for ${ref.customer.name}`
      : `${say.orderName(profile, ref.order.number)}, ${ref.customer.name}'s ${label}`;
  },

  opened(profile: Profile, ref: OrderRef): string {
    const due = ref.order.dueOn ? ` It's due ${ref.order.dueOn}.` : '';
    return `Opened ${say.orderPhrase(profile, ref)}.${due}`;
  },

  moved(profile: Profile, ref: OrderRef, stageLabel: string): string {
    return `${say.orderPhrase(profile, ref)} is now ${stageLabel}.`;
  },

  lineAdded(profile: Profile, ref: OrderRef, line: OrderLine, totalCents: number): string {
    const backorder = line.backordered > 0
      ? ` Only ${line.quantity - line.backordered} in stock, so ${line.backordered} is backordered.`
      : '';
    return `Added ${line.quantity} ${line.name} to ${say.orderName(profile, ref.order.number)}. `
      + `The total is now ${formatMoney(totalCents)}.${backorder}`;
  },

  closed(profile: Profile, ref: OrderRef, payment: Payment): string {
    return `Closed ${say.orderPhrase(profile, ref)}. They paid ${formatMoney(payment.amountCents)} by ${payment.method}.`;
  },

  alreadyClosed(profile: Profile, ref: OrderRef, amountCents: number): string {
    return `${say.orderName(profile, ref.order.number)} was already closed out for ${formatMoney(amountCents)}.`;
  },

  notFound(profile: Profile, query: string, open: OrderRef[]): string {
    if (open.length === 0) return `I couldn't find "${query}", and there are no open ${profile.nouns.orders} right now.`;
    const names = open.slice(0, 5).map(r => say.orderPhrase(profile, r));
    return `I couldn't find an open ${profile.nouns.order} for "${query}". Open ones are ${list(names)}.`;
  },

  ambiguous(profile: Profile, refs: OrderRef[]): string {
    const count = COUNT_WORDS[refs.length] ?? String(refs.length);
    return `I found ${count}: ${list(refs.map(r => say.orderPhrase(profile, r)))}. Which one?`;
  },

  unknownItem(profile: Profile, query: string, suggestions: CatalogItem[]): string {
    if (suggestions.length === 0) return `I don't have "${query}" in the ${profile.nouns.items} list.`;
    return `I don't have "${query}" in the ${profile.nouns.items} list. `
      + `Closest matches are ${list(suggestions.map(s => s.name))}.`;
  }
};
```

- [ ] **Step 4: Correr y verificar que pasan**

Run: `npx vitest run test/unit/say.test.ts`
Expected: PASS, los 6 casos.

- [ ] **Step 5: Commit**

```bash
git add src/speech test/unit/say.test.ts
git commit -m "feat: add spoken english phrasing built from the business profile"
```

---

## Task 10: Generación de tools desde el perfil

**Files:**
- Create: `src/tools/specs.ts`
- Test: `test/unit/tool-specs.test.ts`

**Interfaces:**
- Consumes: `Profile`, `ToolKey`, `FieldDef` (Task 2).
- Produces:

```typescript
export interface ToolSpec { name: string; title: string; description: string }
export function toolSpecs(profile: Profile): Record<ToolKey, ToolSpec>
export function openInput(profile: Profile): z.ZodObject<z.ZodRawShape>
export function findInput(profile: Profile): z.ZodObject<z.ZodRawShape>
export function moveInput(profile: Profile): z.ZodObject<z.ZodRawShape>
export function addLineInput(profile: Profile): z.ZodObject<z.ZodRawShape>
export function itemQueryInput(profile: Profile): z.ZodObject<z.ZodRawShape>   // stock y reorder
export function closeOutInput(profile: Profile): z.ZodObject<z.ZodRawShape>
export const salesReportInput: z.ZodObject<z.ZodRawShape>
```

Las descripciones incluyen los sinónimos del perfil, porque los requisitos funcionales de Alexa+ piden variantes y abreviaturas. No mencionan nombres internos ni jerga técnica.

- [ ] **Step 1: Escribir la prueba que falla**

`test/unit/tool-specs.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { loadProfile } from '../../src/profiles/load.js';
import { findInput, openInput, toolSpecs } from '../../src/tools/specs.js';

const shop = loadProfile('auto-repair');
const bakery = loadProfile('bakery');

describe('generación de tools', () => {
  it('toma los nombres del perfil', () => {
    expect(toolSpecs(shop).open.name).toBe('open_work_order');
    expect(toolSpecs(bakery).open.name).toBe('take_cake_order');
  });

  it('mete los sinónimos en la descripción', () => {
    const d = toolSpecs(shop).find.description;
    expect(d).toContain('repair order');
    expect(d).toContain('RO');
    expect(d.toLowerCase()).not.toContain('json');
  });

  it('el esquema de abrir exige el activo en el taller', () => {
    const schema = openInput(shop);
    expect(schema.safeParse({ customerName: 'Dana Lee' }).success).toBe(false);
    expect(schema.safeParse({
      customerName: 'Dana Lee', asset: { year: 2019, make: 'Honda', model: 'Civic' }
    }).success).toBe(true);
  });

  it('el esquema de abrir exige due y campos propios en la pastelería', () => {
    const schema = openInput(bakery);
    expect(schema.safeParse({ customerName: 'Priya Shah', flavor: 'chocolate', size: '10-inch' }).success).toBe(false);
    expect(schema.safeParse({
      customerName: 'Priya Shah', flavor: 'chocolate', size: '10-inch', due: 'saturday'
    }).success).toBe(true);
  });

  it('el esquema de buscar acepta solo etapas del perfil', () => {
    expect(findInput(shop).safeParse({ stage: 'waiting_on_parts' }).success).toBe(true);
    expect(findInput(shop).safeParse({ stage: 'baking' }).success).toBe(false);
    expect(findInput(shop).safeParse({}).success).toBe(true);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run test/unit/tool-specs.test.ts`
Expected: FAIL — no existe `src/tools/specs.ts`.

- [ ] **Step 3: Implementar `src/tools/specs.ts`**

```typescript
import * as z from 'zod/v4';
import type { FieldDef, Profile, ToolKey } from '../profiles/schema.js';

export interface ToolSpec { name: string; title: string; description: string }

const alsoCalled = (words: string[]): string => words.length === 0 ? '' : ` (also called ${words.join(', ')})`;

export function toolSpecs(profile: Profile): Record<ToolKey, ToolSpec> {
  const { order, orders, item, items, customer } = profile.nouns;
  const orderAlias = alsoCalled(profile.synonyms.order);
  const itemAlias = alsoCalled(profile.synonyms.item);
  const asset = profile.asset?.noun;
  const stages = profile.stages.map(s => s.label).join(', ');

  return {
    snapshot: {
      name: profile.toolNames.snapshot,
      title: 'Business snapshot',
      description: `Get today's summary: money taken in today, how many ${orders} are in each stage, what is due today, and which ${items} are running low. Use this when the user asks how the day or the business is going.`
    },
    find: {
      name: profile.toolNames.find,
      title: `Find ${orders}`,
      description: `Find open ${orders}${orderAlias} by ${customer} name${asset ? `, by ${asset}` : ''}, by stage (${stages}) or by due date. Use this when the user asks what is in progress, what is waiting, or how many are due on a day.`
    },
    open: {
      name: profile.toolNames.open,
      title: `Open a ${order}`,
      description: `Open a new ${order}${orderAlias} for a ${customer}${asset ? ` and their ${asset}` : ''}. Use this when the user wants to start a new job or take a new order.`
    },
    move: {
      name: profile.toolNames.move,
      title: `Change ${order} stage`,
      description: `Move a ${order} to another stage (${stages}). Use this when the user says work has started, is waiting, or is ready. To finish and charge a ${order}, use the close-out tool instead.`
    },
    addLine: {
      name: profile.toolNames.addLine,
      title: `Add to a ${order}`,
      description: `Add a ${item}${itemAlias} or a service to an existing ${order} and get the new total. Use this when the user says to add, put on, or charge something to a ${order}.`
    },
    stock: {
      name: profile.toolNames.stock,
      title: `Check ${items}`,
      description: `Check how many of a ${item}${itemAlias} are on hand, or list everything running low when no ${item} is named. Use this when the user asks if something is in stock or what is low.`
    },
    reorder: {
      name: profile.toolNames.reorder,
      title: `Reorder ${items}`,
      description: `Create supplier orders for ${items} that are at or below their reorder point, or for one named ${item}. Use this when the user says to reorder, restock, or order more.`
    },
    closeOut: {
      name: profile.toolNames.closeOut,
      title: `Close out a ${order}`,
      description: `Close out a finished ${order}, record how the ${customer} paid, and report the amount. Use this when the user says the ${order} was picked up, finished, or paid for.`
    },
    salesReport: {
      name: profile.toolNames.salesReport,
      title: 'Sales report',
      description: `Report sales for a period and compare it with the period before: total taken in, number of sales, average sale, and best selling ${items}. Use this when the user asks how sales are doing, how a day, week or month went, or how it compares.`
    }
  };
}

function fieldSchema(field: FieldDef): z.ZodTypeAny {
  const base = field.type === 'integer' ? z.number().int() : z.string().min(1);
  return field.required ? base : base.optional();
}

function fieldsShape(fields: FieldDef[]): z.ZodRawShape {
  return Object.fromEntries(fields.map(f => [f.id, fieldSchema(f)]));
}

const dueDescription = 'A day such as "today", "tomorrow", a weekday like "saturday", or a date like 2026-09-19.';

export function openInput(profile: Profile): z.ZodObject<z.ZodRawShape> {
  const shape: z.ZodRawShape = {
    customerName: z.string().min(1).describe('The customer\'s name, as the user said it.'),
    customerPhone: z.string().optional().describe('The customer\'s phone number, if the user gives one.'),
    description: z.string().optional().describe('What the job is, in the user\'s words.'),
    ...fieldsShape(profile.orderFields)
  };

  if (profile.asset) {
    const assetShape = fieldsShape(profile.asset.fields);
    shape.asset = z.object(assetShape).describe(`The ${profile.asset.noun} this job is for.`);
  }
  if (profile.due === 'required') shape.due = z.string().describe(dueDescription);
  if (profile.due === 'optional') shape.due = z.string().optional().describe(dueDescription);

  return z.object(shape);
}

function stageEnum(profile: Profile): z.ZodTypeAny {
  const ids = profile.stages.map(s => s.id) as [string, ...string[]];
  return z.enum(ids);
}

export function findInput(profile: Profile): z.ZodObject<z.ZodRawShape> {
  return z.object({
    query: z.string().optional().describe('A customer name or anything the user used to name the job.'),
    stage: stageEnum(profile).optional().describe('Only return jobs in this stage.'),
    due: z.string().optional().describe(dueDescription)
  });
}

export function moveInput(profile: Profile): z.ZodObject<z.ZodRawShape> {
  return z.object({
    order: z.string().min(1).describe('How the user referred to the job, such as "the Civic" or "order 42".'),
    stage: stageEnum(profile).describe('The stage to move it to.')
  });
}

export function addLineInput(profile: Profile): z.ZodObject<z.ZodRawShape> {
  return z.object({
    order: z.string().min(1).describe('How the user referred to the job.'),
    item: z.string().min(1).describe(`The ${profile.nouns.item} or service to add, by name.`),
    quantity: z.number().positive().optional().describe('How many. Defaults to 1. For labor, the number of hours.')
  });
}

export function itemQueryInput(profile: Profile): z.ZodObject<z.ZodRawShape> {
  return z.object({
    item: z.string().optional().describe(`The ${profile.nouns.item} by name. Leave it out to cover everything that is low.`)
  });
}

export function closeOutInput(profile: Profile): z.ZodObject<z.ZodRawShape> {
  return z.object({
    order: z.string().min(1).describe('How the user referred to the job.'),
    paymentMethod: z.enum(['cash', 'card', 'check']).describe('How the customer paid.')
  });
}

export const salesReportInput = z.object({
  period: z.enum(['today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month'])
    .describe('The period to report on.'),
  compare: z.boolean().optional().describe('Compare with the period before. Defaults to true.')
});
```

- [ ] **Step 4: Correr y verificar que pasan**

Run: `npx vitest run test/unit/tool-specs.test.ts`
Expected: PASS, los 5 casos.

- [ ] **Step 5: Commit**

```bash
git add src/tools/specs.ts test/unit/tool-specs.test.ts
git commit -m "feat: generate tool names, descriptions and input schemas from a profile"
```

---

## Task 11: Contexto de tools y las cuatro tools de lectura

**Files:**
- Create: `src/tools/context.ts`, `src/tools/snapshot.ts`, `src/tools/find.ts`, `src/tools/stock.ts`, `src/tools/sales-report.ts`, `src/tools/register.ts`
- Test: `test/integration/read-tools.test.ts`

**Interfaces:**
- Consumes: `Store` (Task 8), `Profile` (Task 2), dominio completo (Tasks 3–7), `say` (Task 9), specs (Task 10).
- Produces:

```typescript
export interface ToolContext { business: Business; profile: Profile; store: Store; now: () => Date; newId: (prefix: string) => string }
export type ToolResult = { content: Array<{ type: 'text'; text: string }>; structuredContent?: unknown; isError?: boolean };
export function ok(text: string, structuredContent: unknown): ToolResult
export function fail(text: string): ToolResult
export async function loadRefs(ctx: ToolContext): Promise<OrderRef[]>
export function openOnly(ctx: ToolContext, refs: OrderRef[]): OrderRef[]
export function registerTools(server: McpServer, ctx: ToolContext): void
```

- [ ] **Step 1: Escribir la prueba que falla**

`test/integration/read-tools.test.ts`:

```typescript
import { beforeEach, describe, expect, it } from 'vitest';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { McpServer } from '@modelcontextprotocol/server';
import { MemoryStore } from '../../src/store/memory.js';
import { loadProfile } from '../../src/profiles/load.js';
import { registerTools, type ToolContext } from '../../src/tools/context.js';
import type { Business, CatalogItem, Order } from '../../src/domain/types.js';

const NOW = new Date('2026-09-15T15:00:00Z'); // martes, 10:00 en Chicago

const business: Business = {
  id: 'b1', name: 'Oak Street Auto', profileId: 'auto-repair',
  timezone: 'America/Chicago', taxRateBps: 825, nextOrderNumber: 43, version: 1
};

async function fixture(): Promise<{ client: Client; store: MemoryStore }> {
  const store = new MemoryStore();
  await store.putBusiness(business);
  await store.putCustomer('b1', { id: 'c1', name: 'Dana Lee', nameNormalized: 'dana lee' });
  await store.putAsset('b1', { id: 'a1', customerId: 'c1', fields: {}, spokenLabel: '2019 Honda Civic' });

  const order: Order = {
    id: 'o1', number: 41, customerId: 'c1', assetId: 'a1', stage: 'waiting_on_parts', fields: {},
    lines: [], subtotalCents: 0, taxCents: 0, totalCents: 0, stageHistory: [],
    createdAt: '2026-09-14T15:00:00.000Z', version: 1
  };
  await store.putOrder('b1', order);

  const item: CatalogItem = {
    id: 'i1', name: 'Oil filter', synonyms: ['filter'], kind: 'part', unit: 'each', priceCents: 900,
    taxable: true, stocked: true, onHand: 1, reorderPoint: 5, reorderQty: 12, supplierId: 's1',
    consumes: {}, version: 1
  };
  await store.putItems('b1', [item]);

  const ctx: ToolContext = {
    business, profile: loadProfile('auto-repair'), store, now: () => NOW, newId: p => `${p}-test`
  };
  const server = new McpServer({ name: 'counterpart', version: '0.1.0' });
  registerTools(server, ctx);

  const [clientEnd, serverEnd] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1.0.0' });
  await server.server.connect(serverEnd);
  await client.connect(clientEnd);
  return { client, store };
}

describe('tools de lectura', () => {
  let client: Client;
  beforeEach(async () => { ({ client } = await fixture()); });

  it('registra las nueve tools con los nombres del perfil', async () => {
    const { tools } = await client.listTools();
    expect(tools.map(t => t.name).sort()).toEqual([
      'add_parts_or_labor', 'check_parts_stock', 'close_out_work_order', 'find_work_orders',
      'get_shop_snapshot', 'move_work_order_stage', 'open_work_order', 'reorder_parts', 'sales_report'
    ]);
  });

  it('el resumen del día cuenta por etapa y lista lo bajo', async () => {
    const r = await client.callTool({ name: 'get_shop_snapshot', arguments: {} });
    expect(r.isError).toBeFalsy();
    const data = r.structuredContent as { byStage: Array<{ stage: string; count: number }>; low: Array<{ name: string }> };
    expect(data.byStage).toEqual([{ stage: 'waiting_on_parts', label: 'waiting on parts', count: 1 }]);
    expect(data.low.map(l => l.name)).toEqual(['Oil filter']);
  });

  it('busca por etapa', async () => {
    const r = await client.callTool({ name: 'find_work_orders', arguments: { stage: 'waiting_on_parts' } });
    const data = r.structuredContent as { total: number; orders: Array<{ number: number }> };
    expect(data.total).toBe(1);
    expect(data.orders[0]!.number).toBe(41);
    expect((r.content[0] as { text: string }).text).toContain('work order 41');
  });

  it('consulta un ítem por sinónimo', async () => {
    const r = await client.callTool({ name: 'check_parts_stock', arguments: { item: 'filter' } });
    const data = r.structuredContent as { items: Array<{ name: string; onHand: number; low: boolean }> };
    expect(data.items).toEqual([{ itemId: 'i1', name: 'Oil filter', unit: 'each', onHand: 1, reorderPoint: 5, low: true }]);
  });

  it('avisa cuando el ítem no existe, sin romperse', async () => {
    const r = await client.callTool({ name: 'check_parts_stock', arguments: { item: 'blinker fluid' } });
    expect(r.isError).toBe(true);
    expect(r.structuredContent).toBeUndefined();
    expect((r.content[0] as { text: string }).text).toContain("I don't have");
  });

  it('reporta ventas de una semana vacía sin dividir entre cero', async () => {
    const r = await client.callTool({ name: 'sales_report', arguments: { period: 'this_week' } });
    const data = r.structuredContent as { totalCents: number; averageTicketCents: number };
    expect(data.totalCents).toBe(0);
    expect(data.averageTicketCents).toBe(0);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run test/integration/read-tools.test.ts`
Expected: FAIL — no existe `src/tools/context.ts`.

- [ ] **Step 3: Implementar `src/tools/context.ts`**

```typescript
import type { McpServer } from '@modelcontextprotocol/server';
import type { Profile } from '../profiles/schema.js';
import type { OrderRef } from '../domain/resolver.js';
import type { Business } from '../domain/types.js';
import type { Store } from '../store/store.js';

export interface ToolContext {
  business: Business;
  profile: Profile;
  store: Store;
  now: () => Date;
  newId: (prefix: string) => string;
}

export type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: unknown;
  isError?: boolean;
};

export function ok(text: string, structuredContent: unknown): ToolResult {
  return { content: [{ type: 'text', text }], structuredContent };
}

/** Error de dominio: solo texto. El SDK no valida outputSchema cuando isError es true. */
export function fail(text: string): ToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}

/** Une órdenes con su cliente y su activo. */
export async function loadRefs(ctx: ToolContext): Promise<OrderRef[]> {
  const [orders, customers, assets] = await Promise.all([
    ctx.store.listOrders(ctx.business.id),
    ctx.store.listCustomers(ctx.business.id),
    ctx.store.listAssets(ctx.business.id)
  ]);
  const byCustomer = new Map(customers.map(c => [c.id, c]));
  const byAsset = new Map(assets.map(a => [a.id, a]));

  return orders.flatMap(order => {
    const customer = byCustomer.get(order.customerId);
    if (!customer) return [];
    const asset = order.assetId ? byAsset.get(order.assetId) : undefined;
    return [{ order, customer, asset }];
  });
}

export function openOnly(ctx: ToolContext, refs: OrderRef[]): OrderRef[] {
  return refs.filter(r => r.order.stage !== ctx.profile.closedStage);
}

export function stageLabel(profile: Profile, stageId: string): string {
  return profile.stages.find(s => s.id === stageId)?.label ?? stageId;
}

export function registerTools(_server: McpServer, _ctx: ToolContext): void {
  throw new Error('registerTools se implementa al final de la Task 12');
}
```

- [ ] **Step 4: Implementar las cuatro tools de lectura**

`src/tools/snapshot.ts`:

```typescript
import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { businessToday } from '../domain/dates.js';
import { formatMoney } from '../domain/money.js';
import { buildSnapshot } from '../domain/reports.js';
import { say } from '../speech/say.js';
import { toolSpecs } from './specs.js';
import { loadRefs, ok, type ToolContext } from './context.js';

const output = z.object({
  todayRevenueCents: z.number(),
  sameDayLastWeekCents: z.number(),
  byStage: z.array(z.object({ stage: z.string(), label: z.string(), count: z.number() })),
  dueToday: z.array(z.object({ orderId: z.string(), number: z.number(), label: z.string() })),
  low: z.array(z.object({ itemId: z.string(), name: z.string(), onHand: z.number(), reorderPoint: z.number() }))
});

export function registerSnapshot(server: McpServer, ctx: ToolContext): void {
  const spec = toolSpecs(ctx.profile).snapshot;

  server.registerTool(
    spec.name,
    {
      title: spec.title, description: spec.description,
      inputSchema: z.object({}), outputSchema: output,
      annotations: { readOnlyHint: true, idempotentHint: true }
    },
    async () => {
      const today = businessToday(ctx.business.timezone, ctx.now());
      const weekAgo = new Date(ctx.now().getTime() - 7 * 24 * 3600 * 1000);
      const [refs, items, payments] = await Promise.all([
        loadRefs(ctx),
        ctx.store.listItems(ctx.business.id),
        ctx.store.listPayments(ctx.business.id, businessToday(ctx.business.timezone, weekAgo), today)
      ]);

      const snapshot = buildSnapshot({ profile: ctx.profile, refs, items, payments, today });
      const stages = snapshot.byStage.map(s => `${s.count} ${s.label}`);
      const text = `Today you've taken in ${formatMoney(snapshot.todayRevenueCents)}. `
        + (stages.length > 0 ? `You have ${say.list(stages)}. ` : `No open ${ctx.profile.nouns.orders}. `)
        + (snapshot.low.length > 0 ? `${snapshot.low.length} ${ctx.profile.nouns.items} are running low.` : 'Stock looks fine.');

      return ok(text, snapshot);
    }
  );
}
```

`src/tools/find.ts`:

```typescript
import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { resolveDue } from '../domain/dates.js';
import { refLabel } from '../domain/reports.js';
import { tokenScore } from '../domain/resolver.js';
import { say } from '../speech/say.js';
import { findInput, toolSpecs } from './specs.js';
import { loadRefs, ok, openOnly, stageLabel, type ToolContext } from './context.js';

const output = z.object({
  total: z.number(),
  orders: z.array(z.object({
    orderId: z.string(), number: z.number(), label: z.string(), customer: z.string(),
    stage: z.string(), stageLabel: z.string(), dueOn: z.string().optional(), totalCents: z.number()
  }))
});

export function registerFind(server: McpServer, ctx: ToolContext): void {
  const spec = toolSpecs(ctx.profile).find;

  server.registerTool(
    spec.name,
    {
      title: spec.title, description: spec.description,
      inputSchema: findInput(ctx.profile), outputSchema: output,
      annotations: { readOnlyHint: true, idempotentHint: true }
    },
    async (args: { query?: string; stage?: string; due?: string }) => {
      let refs = openOnly(ctx, await loadRefs(ctx));

      if (args.stage) refs = refs.filter(r => r.order.stage === args.stage);
      if (args.due) {
        const dueOn = resolveDue(args.due, ctx.business.timezone, ctx.now());
        refs = dueOn ? refs.filter(r => r.order.dueOn === dueOn) : [];
      }
      if (args.query) {
        refs = refs.filter(r => tokenScore(args.query!, `${r.customer.name} ${refLabel(r)}`) >= 0.5);
      }

      const listed = refs.slice(0, 10).map(r => ({
        orderId: r.order.id, number: r.order.number, label: refLabel(r), customer: r.customer.name,
        stage: r.order.stage, stageLabel: stageLabel(ctx.profile, r.order.stage),
        dueOn: r.order.dueOn, totalCents: r.order.totalCents
      }));

      const text = refs.length === 0
        ? `I don't see any ${ctx.profile.nouns.orders} matching that.`
        : `${refs.length} ${refs.length === 1 ? ctx.profile.nouns.order : ctx.profile.nouns.orders}: `
          + `${say.list(refs.slice(0, 5).map(r => say.orderPhrase(ctx.profile, r)))}.`;

      return ok(text, { total: refs.length, orders: listed });
    }
  );
}
```

`src/tools/stock.ts`:

```typescript
import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { findItem, lowStock } from '../domain/inventory.js';
import { say } from '../speech/say.js';
import { itemQueryInput, toolSpecs } from './specs.js';
import { fail, ok, type ToolContext } from './context.js';

const output = z.object({
  items: z.array(z.object({
    itemId: z.string(), name: z.string(), unit: z.string(),
    onHand: z.number(), reorderPoint: z.number(), low: z.boolean()
  }))
});

export function registerStock(server: McpServer, ctx: ToolContext): void {
  const spec = toolSpecs(ctx.profile).stock;

  server.registerTool(
    spec.name,
    {
      title: spec.title, description: spec.description,
      inputSchema: itemQueryInput(ctx.profile), outputSchema: output,
      annotations: { readOnlyHint: true, idempotentHint: true }
    },
    async (args: { item?: string }) => {
      const items = await ctx.store.listItems(ctx.business.id);

      if (!args.item) {
        const low = lowStock(items);
        const text = low.length === 0
          ? `Nothing is running low.`
          : `${low.length} ${ctx.profile.nouns.items} running low: ${say.list(low.map(i => `${i.name}, ${i.onHand} left`))}.`;
        return ok(text, { items: low.map(view) });
      }

      const found = findItem(args.item, items);
      if (found.kind === 'none') return fail(say.unknownItem(ctx.profile, args.item, found.suggestions));
      if (found.kind === 'ambiguous') {
        return fail(`Did you mean ${say.list(found.candidates.map(c => c.name))}?`);
      }

      const item = found.item;
      const text = item.stocked
        ? `${item.onHand} ${item.name} on hand.${item.onHand <= item.reorderPoint ? ' That is at or below the reorder point.' : ''}`
        : `${item.name} is a service, so there is nothing to count.`;
      return ok(text, { items: [view(item)] });
    }
  );
}

function view(i: { id: string; name: string; unit: string; onHand: number; reorderPoint: number; stocked: boolean }) {
  return {
    itemId: i.id, name: i.name, unit: i.unit, onHand: i.onHand,
    reorderPoint: i.reorderPoint, low: i.stocked && i.onHand <= i.reorderPoint
  };
}
```

`src/tools/sales-report.ts`:

```typescript
import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { periodRange, type Period } from '../domain/dates.js';
import { formatMoney } from '../domain/money.js';
import { buildSalesReport } from '../domain/reports.js';
import { salesReportInput, toolSpecs } from './specs.js';
import { ok, type ToolContext } from './context.js';

const output = z.object({
  from: z.string(), to: z.string(), prevFrom: z.string(), prevTo: z.string(),
  totalCents: z.number(), prevTotalCents: z.number(), count: z.number(), averageTicketCents: z.number(),
  daily: z.array(z.object({ date: z.string(), cents: z.number() })),
  topItems: z.array(z.object({ name: z.string(), quantity: z.number(), cents: z.number() }))
});

export function registerSalesReport(server: McpServer, ctx: ToolContext): void {
  const spec = toolSpecs(ctx.profile).salesReport;

  server.registerTool(
    spec.name,
    {
      title: spec.title, description: spec.description,
      inputSchema: salesReportInput, outputSchema: output,
      annotations: { readOnlyHint: true, idempotentHint: true }
    },
    async (args: { period: Period; compare?: boolean }) => {
      const range = periodRange(args.period, ctx.business.timezone, ctx.now());
      const [payments, orders] = await Promise.all([
        ctx.store.listPayments(ctx.business.id, range.prevFrom, range.to),
        ctx.store.listOrders(ctx.business.id)
      ]);

      const report = buildSalesReport({ range, payments, orders });
      const comparison = args.compare === false || report.prevTotalCents === 0
        ? ''
        : ` That's ${report.totalCents >= report.prevTotalCents ? 'up' : 'down'} from `
          + `${formatMoney(report.prevTotalCents)} the period before.`;
      const best = report.topItems[0] ? ` Best seller: ${report.topItems[0].name}.` : '';

      return ok(
        `${formatMoney(report.totalCents)} from ${report.count} sales, averaging `
        + `${formatMoney(report.averageTicketCents)}.${comparison}${best}`,
        report
      );
    }
  );
}
```

- [ ] **Step 5: Correr las pruebas — cuatro pasan y la de los nueve nombres falla**

Run: `npx vitest run test/integration/read-tools.test.ts`
Expected: FAIL solo en el caso "registra las nueve tools", porque faltan las de escritura. Los demás casos deben pasar en cuanto `registerTools` llame a las cuatro de lectura. Para llegar ahí, reemplaza el cuerpo provisional de `registerTools` por:

```typescript
export function registerTools(server: McpServer, ctx: ToolContext): void {
  registerSnapshot(server, ctx);
  registerFind(server, ctx);
  registerStock(server, ctx);
  registerSalesReport(server, ctx);
}
```

y agrega los imports correspondientes. La versión definitiva llega en la Task 12.

- [ ] **Step 6: Commit**

```bash
git add src/tools test/integration/read-tools.test.ts
git commit -m "feat: add read tools for snapshot, search, stock and sales report"
```

---

## Task 12: Las cinco tools de escritura

**Files:**
- Create: `src/domain/assets.ts`, `src/tools/open.ts`, `src/tools/move.ts`, `src/tools/add-line.ts`, `src/tools/reorder.ts`, `src/tools/close-out.ts`
- Modify: `src/tools/context.ts` (versión definitiva de `registerTools`)
- Test: `test/integration/write-tools.test.ts`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces:
  - `spokenLabel(asset: AssetDef, fields: Record<string, string | number>): string`
  - `normalizeName(name: string): string`
  - `registerOpen`, `registerMove`, `registerAddLine`, `registerReorder`, `registerCloseOut`, cada una `(server: McpServer, ctx: ToolContext) => void`.
  - `registerTools` definitivo, que registra las nueve.

- [ ] **Step 1: Escribir la prueba que falla**

`test/integration/write-tools.test.ts` (reusa el helper `fixture()` de la Task 11; cópialo tal cual en este archivo para que la prueba sea independiente):

```typescript
import { describe, expect, it } from 'vitest';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { McpServer } from '@modelcontextprotocol/server';
import { MemoryStore } from '../../src/store/memory.js';
import { loadProfile } from '../../src/profiles/load.js';
import { registerTools, type ToolContext } from '../../src/tools/context.js';
import type { Business, CatalogItem, Order } from '../../src/domain/types.js';

const NOW = new Date('2026-09-15T15:00:00Z');
const business: Business = {
  id: 'b1', name: 'Oak Street Auto', profileId: 'auto-repair',
  timezone: 'America/Chicago', taxRateBps: 825, nextOrderNumber: 43, version: 1
};

let idCounter = 0;

async function fixture(): Promise<{ client: Client; store: MemoryStore }> {
  idCounter = 0;
  const store = new MemoryStore();
  await store.putBusiness(business);
  await store.putCustomer('b1', { id: 'c1', name: 'Dana Lee', nameNormalized: 'dana lee' });
  await store.putAsset('b1', { id: 'a1', customerId: 'c1', fields: { year: 2019, make: 'Honda', model: 'Civic' }, spokenLabel: '2019 Honda Civic' });

  const order: Order = {
    id: 'o1', number: 41, customerId: 'c1', assetId: 'a1', stage: 'ready_for_pickup', fields: {},
    lines: [], subtotalCents: 0, taxCents: 0, totalCents: 0, stageHistory: [],
    createdAt: '2026-09-14T15:00:00.000Z', version: 1
  };
  await store.putOrder('b1', order);

  const pads: CatalogItem = {
    id: 'i1', name: 'Front brake pads', synonyms: ['brake pads'], kind: 'part', unit: 'each',
    priceCents: 4500, taxable: true, stocked: true, onHand: 1, reorderPoint: 2, reorderQty: 12,
    supplierId: 's1', consumes: {}, version: 1
  };
  await store.putItems('b1', [pads]);

  const ctx: ToolContext = {
    business, profile: loadProfile('auto-repair'), store,
    now: () => NOW, newId: p => `${p}-${++idCounter}`
  };
  const server = new McpServer({ name: 'counterpart', version: '0.1.0' });
  registerTools(server, ctx);

  const [clientEnd, serverEnd] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1.0.0' });
  await server.server.connect(serverEnd);
  await client.connect(clientEnd);
  return { client, store };
}

const text = (r: { content: unknown[] }): string => (r.content[0] as { text: string }).text;

describe('tools de escritura', () => {
  it('abre una orden y crea cliente y vehículo nuevos', async () => {
    const { client, store } = await fixture();
    const r = await client.callTool({
      name: 'open_work_order',
      arguments: { customerName: 'Sam Reyes', asset: { year: 2020, make: 'Ford', model: 'F-150' }, description: 'brake noise' }
    });
    expect(r.isError).toBeFalsy();
    expect(text(r)).toContain("Sam Reyes's 2020 Ford F-150");
    expect(await store.listOrders('b1')).toHaveLength(2);
    expect((await store.listCustomers('b1')).map(c => c.name)).toContain('Sam Reyes');
  });

  it('no duplica si la misma orden se abre dos veces seguidas', async () => {
    const { client, store } = await fixture();
    const args = { customerName: 'Sam Reyes', asset: { year: 2020, make: 'Ford', model: 'F-150' } };
    await client.callTool({ name: 'open_work_order', arguments: args });
    await client.callTool({ name: 'open_work_order', arguments: args });
    expect(await store.listOrders('b1')).toHaveLength(2); // la original más una sola nueva
  });

  it('agrega una partida, descuenta stock y marca backorder', async () => {
    const { client, store } = await fixture();
    const r = await client.callTool({
      name: 'add_parts_or_labor', arguments: { order: 'the Civic', item: 'brake pads', quantity: 2 }
    });
    expect(text(r)).toContain('backordered');
    const saved = (await store.listOrders('b1')).find(o => o.id === 'o1')!;
    expect(saved.lines).toHaveLength(1);
    expect(saved.totalCents).toBe(9000 + 743);
    expect((await store.listItems('b1'))[0]!.onHand).toBe(0);
  });

  it('cambia de etapa y rechaza mover a la etapa de cierre', async () => {
    const { client } = await fixture();
    const good = await client.callTool({ name: 'move_work_order_stage', arguments: { order: 'order 41', stage: 'in_bay' } });
    expect(text(good)).toContain('in the bay');

    const bad = await client.callTool({ name: 'move_work_order_stage', arguments: { order: 'order 41', stage: 'picked_up' } });
    expect(bad.isError).toBe(true);
    expect(text(bad)).toContain('close it out');
  });

  it('cierra cobrando y es idempotente al repetir', async () => {
    const { client, store } = await fixture();
    const first = await client.callTool({ name: 'close_out_work_order', arguments: { order: 'the Civic', paymentMethod: 'card' } });
    expect(first.isError).toBeFalsy();
    const second = await client.callTool({ name: 'close_out_work_order', arguments: { order: 'the Civic', paymentMethod: 'card' } });
    expect(text(second)).toContain('already closed');
    expect(await store.listPayments('b1', '2026-09-01', '2026-09-30')).toHaveLength(1);
  });

  it('pide aclaración cuando la referencia no existe', async () => {
    const { client } = await fixture();
    const r = await client.callTool({ name: 'move_work_order_stage', arguments: { order: 'the Accord', stage: 'in_bay' } });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain("I couldn't find");
  });

  it('reordena lo bajo y omite lo que ya está pedido', async () => {
    const { client, store } = await fixture();
    const first = await client.callTool({ name: 'reorder_parts', arguments: {} });
    expect(text(first)).toContain('Front brake pads');
    expect(await store.listOpenPurchaseOrders('b1')).toHaveLength(1);

    const second = await client.callTool({ name: 'reorder_parts', arguments: {} });
    expect(text(second)).toContain('already on order');
    expect(await store.listOpenPurchaseOrders('b1')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run test/integration/write-tools.test.ts`
Expected: FAIL — las tools de escritura no están registradas.

- [ ] **Step 3: Implementar `src/domain/assets.ts`**

```typescript
import type { AssetDef } from '../profiles/schema.js';

/** Rellena la plantilla spokenAs del perfil con los campos del activo. */
export function spokenLabel(asset: AssetDef, fields: Record<string, string | number>): string {
  return asset.spokenAs
    .replace(/\{([a-z0-9_]+)\}/g, (_, key: string) => String(fields[key] ?? ''))
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}
```

- [ ] **Step 4: Implementar `src/tools/open.ts`**

```typescript
import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { normalizeName, spokenLabel } from '../domain/assets.js';
import { resolveDue } from '../domain/dates.js';
import { newOrder } from '../domain/orders.js';
import type { OrderRef } from '../domain/resolver.js';
import { say } from '../speech/say.js';
import { openInput, toolSpecs } from './specs.js';
import { fail, loadRefs, ok, type ToolContext } from './context.js';

const output = z.object({
  orderId: z.string(), number: z.number(), stage: z.string(), label: z.string(), dueOn: z.string().optional()
});

const TWO_MINUTES_MS = 2 * 60 * 1000;

export function registerOpen(server: McpServer, ctx: ToolContext): void {
  const spec = toolSpecs(ctx.profile).open;

  server.registerTool(
    spec.name,
    { title: spec.title, description: spec.description, inputSchema: openInput(ctx.profile), outputSchema: output },
    async (args: Record<string, unknown>) => {
      const now = ctx.now();
      const customerName = String(args.customerName);
      const assetFields = (args.asset ?? {}) as Record<string, string | number>;
      const label = ctx.profile.asset ? spokenLabel(ctx.profile.asset, assetFields) : customerName;

      let dueOn: string | undefined;
      if (typeof args.due === 'string') {
        const resolved = resolveDue(args.due, ctx.business.timezone, now);
        if (!resolved) return fail(`I didn't catch the due date "${args.due}". Try a weekday or a date.`);
        dueOn = resolved;
      }

      // Idempotencia: misma orden recién creada.
      const refs = await loadRefs(ctx);
      const duplicate = refs.find(r =>
        normalizeName(r.customer.name) === normalizeName(customerName)
        && (r.asset?.spokenLabel ?? r.customer.name) === label
        && now.getTime() - new Date(r.order.createdAt).getTime() < TWO_MINUTES_MS);
      if (duplicate) {
        return ok(say.opened(ctx.profile, duplicate), toOutput(duplicate));
      }

      const customers = await ctx.store.listCustomers(ctx.business.id);
      let customer = customers.find(c => c.nameNormalized === normalizeName(customerName));
      if (!customer) {
        customer = { id: ctx.newId('cust'), name: customerName, nameNormalized: normalizeName(customerName) };
        if (typeof args.customerPhone === 'string') customer.phone = args.customerPhone;
        await ctx.store.putCustomer(ctx.business.id, customer);
      }

      let assetId: string | undefined;
      if (ctx.profile.asset) {
        const assets = await ctx.store.listAssets(ctx.business.id);
        const existing = assets.find(a => a.customerId === customer!.id && a.spokenLabel === label);
        if (existing) {
          assetId = existing.id;
        } else {
          assetId = ctx.newId('asset');
          await ctx.store.putAsset(ctx.business.id, { id: assetId, customerId: customer.id, fields: assetFields, spokenLabel: label });
        }
      }

      const fields = Object.fromEntries(
        ctx.profile.orderFields
          .filter(f => typeof args[f.id] === 'string' || typeof args[f.id] === 'number')
          .map(f => [f.id, String(args[f.id])])
      );

      const order = newOrder({
        id: ctx.newId('ord'),
        number: await ctx.store.takeOrderNumber(ctx.business.id),
        customerId: customer.id, assetId, fields, dueOn,
        description: typeof args.description === 'string' ? args.description : undefined,
        stage: ctx.profile.stages[0]!.id, now
      });
      await ctx.store.putOrder(ctx.business.id, order);

      const ref: OrderRef = {
        order, customer,
        asset: assetId ? { id: assetId, customerId: customer.id, fields: assetFields, spokenLabel: label } : undefined
      };
      return ok(say.opened(ctx.profile, ref), toOutput(ref));
    }
  );
}

function toOutput(ref: OrderRef) {
  return {
    orderId: ref.order.id, number: ref.order.number, stage: ref.order.stage,
    label: ref.asset?.spokenLabel ?? ref.customer.name, dueOn: ref.order.dueOn
  };
}
```

- [ ] **Step 5: Implementar `src/tools/move.ts`**

```typescript
import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { moveStage } from '../domain/orders.js';
import { resolveOrder } from '../domain/resolver.js';
import { say } from '../speech/say.js';
import { moveInput, toolSpecs } from './specs.js';
import { fail, loadRefs, ok, openOnly, stageLabel, type ToolContext } from './context.js';

const output = z.object({ orderId: z.string(), number: z.number(), stage: z.string(), stageLabel: z.string() });

export function registerMove(server: McpServer, ctx: ToolContext): void {
  const spec = toolSpecs(ctx.profile).move;

  server.registerTool(
    spec.name,
    {
      title: spec.title, description: spec.description,
      inputSchema: moveInput(ctx.profile), outputSchema: output,
      annotations: { idempotentHint: true }
    },
    async (args: { order: string; stage: string }) => {
      const refs = await loadRefs(ctx);
      const open = openOnly(ctx, refs);
      const found = resolveOrder(args.order, open, ctx.profile);
      if (found.kind === 'none') return fail(say.notFound(ctx.profile, args.order, open));
      if (found.kind === 'ambiguous') return fail(say.ambiguous(ctx.profile, found.refs));

      const moved = moveStage(found.ref.order, args.stage, ctx.profile, ctx.now());
      if (!moved.ok) {
        if (moved.reason === 'use_close_out') {
          return fail(`To finish ${say.orderName(ctx.profile, found.ref.order.number)}, close it out instead.`);
        }
        if (moved.reason === 'closed') {
          return fail(`${say.orderName(ctx.profile, found.ref.order.number)} is already closed, so it can't be moved.`);
        }
        return fail(`I don't know the stage "${args.stage}".`);
      }

      await ctx.store.putOrder(ctx.business.id, moved.order);
      const label = stageLabel(ctx.profile, args.stage);
      const ref = { ...found.ref, order: moved.order };
      return ok(say.moved(ctx.profile, ref, label), {
        orderId: moved.order.id, number: moved.order.number, stage: moved.order.stage, stageLabel: label
      });
    }
  );
}
```

- [ ] **Step 6: Implementar `src/tools/add-line.ts`**

```typescript
import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { addLineToOrder, findItem } from '../domain/inventory.js';
import { recalcTotals } from '../domain/orders.js';
import { resolveOrder } from '../domain/resolver.js';
import { say } from '../speech/say.js';
import { addLineInput, toolSpecs } from './specs.js';
import { fail, loadRefs, ok, openOnly, type ToolContext } from './context.js';

const output = z.object({
  orderId: z.string(), number: z.number(), itemName: z.string(), quantity: z.number(),
  backordered: z.number(), totalCents: z.number()
});

export function registerAddLine(server: McpServer, ctx: ToolContext): void {
  const spec = toolSpecs(ctx.profile).addLine;

  server.registerTool(
    spec.name,
    { title: spec.title, description: spec.description, inputSchema: addLineInput(ctx.profile), outputSchema: output },
    async (args: { order: string; item: string; quantity?: number }) => {
      const open = openOnly(ctx, await loadRefs(ctx));
      const found = resolveOrder(args.order, open, ctx.profile);
      if (found.kind === 'none') return fail(say.notFound(ctx.profile, args.order, open));
      if (found.kind === 'ambiguous') return fail(say.ambiguous(ctx.profile, found.refs));

      const items = await ctx.store.listItems(ctx.business.id);
      const match = findItem(args.item, items);
      if (match.kind === 'none') return fail(say.unknownItem(ctx.profile, args.item, match.suggestions));
      if (match.kind === 'ambiguous') return fail(`Did you mean ${say.list(match.candidates.map(c => c.name))}?`);

      const quantity = args.quantity ?? 1;
      const { line, itemUpdates } = addLineToOrder(match.item, quantity, items);
      const updated = recalcTotals(
        { ...found.ref.order, lines: [...found.ref.order.lines, line] },
        ctx.business.taxRateBps
      );

      await ctx.store.commitOrderWithItems(ctx.business.id, updated, itemUpdates);

      return ok(say.lineAdded(ctx.profile, found.ref, line, updated.totalCents), {
        orderId: updated.id, number: updated.number, itemName: line.name,
        quantity: line.quantity, backordered: line.backordered, totalCents: updated.totalCents
      });
    }
  );
}
```

- [ ] **Step 7: Implementar `src/tools/reorder.ts`**

```typescript
import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { findItem, planReorder } from '../domain/inventory.js';
import { say } from '../speech/say.js';
import { itemQueryInput, toolSpecs } from './specs.js';
import { fail, ok, type ToolContext } from './context.js';
import type { PurchaseOrder } from '../domain/types.js';

const output = z.object({
  ordered: z.array(z.object({ itemId: z.string(), name: z.string(), qty: z.number() })),
  skipped: z.array(z.object({ itemId: z.string(), name: z.string() })),
  purchaseOrderIds: z.array(z.string())
});

export function registerReorder(server: McpServer, ctx: ToolContext): void {
  const spec = toolSpecs(ctx.profile).reorder;

  server.registerTool(
    spec.name,
    {
      title: spec.title, description: spec.description,
      inputSchema: itemQueryInput(ctx.profile), outputSchema: output,
      annotations: { idempotentHint: true }
    },
    async (args: { item?: string }) => {
      const [items, orders, openPOs] = await Promise.all([
        ctx.store.listItems(ctx.business.id),
        ctx.store.listOrders(ctx.business.id),
        ctx.store.listOpenPurchaseOrders(ctx.business.id)
      ]);

      let only;
      if (args.item) {
        const match = findItem(args.item, items);
        if (match.kind === 'none') return fail(say.unknownItem(ctx.profile, args.item, match.suggestions));
        if (match.kind === 'ambiguous') return fail(`Did you mean ${say.list(match.candidates.map(c => c.name))}?`);
        only = match.item;
      }

      const open = orders.filter(o => o.stage !== ctx.profile.closedStage);
      const plan = planReorder(items, open, openPOs, only);
      const byId = new Map(items.map(i => [i.id, i]));

      const purchaseOrders: PurchaseOrder[] = plan.purchaseOrders.map(po => ({
        id: ctx.newId('po'), supplierId: po.supplierId, lines: po.lines,
        status: 'open', createdAt: ctx.now().toISOString()
      }));
      if (purchaseOrders.length > 0) await ctx.store.putPurchaseOrders(ctx.business.id, purchaseOrders);

      const ordered = plan.purchaseOrders.flatMap(po => po.lines.map(l => ({
        itemId: l.itemId, name: byId.get(l.itemId)?.name ?? l.itemId, qty: l.qty
      })));
      const skippedNames = plan.skipped.map(i => i.name);

      const parts: string[] = [];
      if (ordered.length > 0) parts.push(`Ordered ${say.list(ordered.map(o => `${o.qty} ${o.name}`))}.`);
      if (skippedNames.length > 0) parts.push(`${say.list(skippedNames)} ${skippedNames.length === 1 ? 'is' : 'are'} already on order.`);
      if (parts.length === 0) parts.push('Nothing needs reordering right now.');

      return ok(parts.join(' '), {
        ordered,
        skipped: plan.skipped.map(i => ({ itemId: i.id, name: i.name })),
        purchaseOrderIds: purchaseOrders.map(po => po.id)
      });
    }
  );
}
```

- [ ] **Step 8: Implementar `src/tools/close-out.ts`**

```typescript
import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { businessToday } from '../domain/dates.js';
import { closeOut } from '../domain/orders.js';
import { resolveOrder } from '../domain/resolver.js';
import { say } from '../speech/say.js';
import { closeOutInput, toolSpecs } from './specs.js';
import { fail, loadRefs, ok, stageLabel, type ToolContext } from './context.js';
import type { Payment } from '../domain/types.js';

const output = z.object({
  orderId: z.string(), number: z.number(), amountCents: z.number(),
  method: z.string(), alreadyClosed: z.boolean()
});

export function registerCloseOut(server: McpServer, ctx: ToolContext): void {
  const spec = toolSpecs(ctx.profile).closeOut;

  server.registerTool(
    spec.name,
    {
      title: spec.title, description: spec.description,
      inputSchema: closeOutInput(ctx.profile), outputSchema: output,
      annotations: { idempotentHint: true }
    },
    async (args: { order: string; paymentMethod: Payment['method'] }) => {
      const today = businessToday(ctx.business.timezone, ctx.now());
      const refs = await loadRefs(ctx);
      // Candidatas: abiertas, más las cerradas hoy, para que repetir el cierre sea idempotente.
      const candidates = refs.filter(r =>
        r.order.stage !== ctx.profile.closedStage || (r.order.closedAt ?? '').slice(0, 10) === today);

      const found = resolveOrder(args.order, candidates, ctx.profile);
      if (found.kind === 'none') {
        return fail(say.notFound(ctx.profile, args.order, candidates.filter(c => c.order.stage !== ctx.profile.closedStage)));
      }
      if (found.kind === 'ambiguous') return fail(say.ambiguous(ctx.profile, found.refs));

      const order = found.ref.order;

      if (order.stage === ctx.profile.closedStage) {
        return ok(say.alreadyClosed(ctx.profile, found.ref, order.totalCents), {
          orderId: order.id, number: order.number, amountCents: order.totalCents,
          method: args.paymentMethod, alreadyClosed: true
        });
      }

      const result = closeOut(order, args.paymentMethod, ctx.profile, ctx.now(), ctx.newId('pay'));
      if (!result.ok) {
        return fail(`${say.orderName(ctx.profile, order.number)} is still ${stageLabel(ctx.profile, order.stage)}. `
          + `Move it to ${stageLabel(ctx.profile, ctx.profile.closeFrom[0]!)} first.`);
      }

      await ctx.store.commitClose(ctx.business.id, result.order, result.payment);

      return ok(say.closed(ctx.profile, { ...found.ref, order: result.order }, result.payment), {
        orderId: result.order.id, number: result.order.number,
        amountCents: result.payment.amountCents, method: result.payment.method, alreadyClosed: false
      });
    }
  );
}
```

- [ ] **Step 9: Cerrar `registerTools` con las nueve**

En `src/tools/context.ts`, reemplaza `registerTools` por:

```typescript
export function registerTools(server: McpServer, ctx: ToolContext): void {
  registerSnapshot(server, ctx);
  registerFind(server, ctx);
  registerStock(server, ctx);
  registerSalesReport(server, ctx);
  registerOpen(server, ctx);
  registerMove(server, ctx);
  registerAddLine(server, ctx);
  registerReorder(server, ctx);
  registerCloseOut(server, ctx);
}
```

con los imports de los nueve módulos. Si alguna tool no estuviera terminada, **no se registra**: el requisito 13 de Alexa+ exige que todo lo que aparece en `tools/list` funcione.

- [ ] **Step 10: Correr toda la suite y verificar que pasa**

Run: `npx vitest run`
Expected: PASS en todo, incluido el caso de los nueve nombres de la Task 11.

- [ ] **Step 11: Commit**

```bash
git add src test
git commit -m "feat: add write tools for opening, staging, billing and reordering"
```

---

## Task 13: Servidor HTTP con sesiones por negocio

**Files:**
- Create: `src/http/auth.ts`, `src/http/sessions.ts`
- Modify: `src/http/app.ts` (reemplaza la versión de la Task 1), `src/index.ts`
- Test: `test/unit/auth.test.ts`, `test/integration/http.test.ts`

**Interfaces:**
- Consumes: `Store` (Task 8), `loadProfile` (Task 2), `registerTools` y `ToolContext` (Tasks 11–12).
- Produces:

```typescript
export function hashToken(token: string): string                    // sha256 hex
export function bearerFrom(header: string | undefined): string | null
export async function businessFor(store: Store, token: string): Promise<Business | null>
export class Sessions {
  get(sessionId: string, businessId: string): SessionEntry | null    // null si el negocio no coincide
  set(sessionId: string, entry: SessionEntry): void
  drop(sessionId: string): void
  sweep(now: number, idleMs: number): void
}
export interface SessionEntry { transport: NodeStreamableHTTPServerTransport; server: McpServer; businessId: string; lastSeen: number }
export function createApp(deps: { store: Store; devBusinessId?: string; host: string }): Express
```

**Regla de seguridad:** el modo local sin token (`COUNTERPART_DEV_BUSINESS`) solo se acepta si `host` es `127.0.0.1`. Con cualquier otro host, `createApp` lanza y el proceso no arranca.

- [ ] **Step 1: Escribir las pruebas que fallan**

`test/unit/auth.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { bearerFrom, hashToken } from '../../src/http/auth.js';
import { Sessions } from '../../src/http/sessions.js';

describe('autenticación', () => {
  it('extrae el bearer y rechaza lo demás', () => {
    expect(bearerFrom('Bearer abc123')).toBe('abc123');
    expect(bearerFrom('bearer abc123')).toBe('abc123');
    expect(bearerFrom('Basic abc123')).toBeNull();
    expect(bearerFrom(undefined)).toBeNull();
  });

  it('hashea de forma estable', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(hashToken('abc')).toHaveLength(64);
    expect(hashToken('abc')).not.toBe(hashToken('abd'));
  });
});

describe('sesiones', () => {
  const entry = { transport: {} as never, server: {} as never, businessId: 'b1', lastSeen: 0 };

  it('solo entrega la sesión al negocio dueño', () => {
    const s = new Sessions();
    s.set('sid', { ...entry });
    expect(s.get('sid', 'b1')).not.toBeNull();
    expect(s.get('sid', 'b2')).toBeNull();
    expect(s.get('otra', 'b1')).toBeNull();
  });

  it('descarta sesiones inactivas', () => {
    const s = new Sessions();
    s.set('sid', { ...entry, lastSeen: 1000 });
    s.sweep(1000 + 31 * 60 * 1000, 30 * 60 * 1000);
    expect(s.get('sid', 'b1')).toBeNull();
  });
});
```

`test/integration/http.test.ts`:

```typescript
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createApp } from '../../src/http/app.js';
import { hashToken } from '../../src/http/auth.js';
import { MemoryStore } from '../../src/store/memory.js';
import type { Business } from '../../src/domain/types.js';

const TOKEN = 'token-de-prueba';
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

  server = createApp({ store, host: '127.0.0.1' }).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', () => resolve()));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
});

afterAll(() => { server.close(); });

describe('HTTP', () => {
  it('responde el health check', async () => {
    const r = await fetch(`${base}/ping`);
    expect(r.status).toBe(200);
    expect(await r.text()).toBe('ok');
  });

  it('rechaza sin token', async () => {
    const r = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '0' } } })
    });
    expect(r.status).toBe(401);
  });

  it('abre sesión con token válido y expone las nueve tools', async () => {
    const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
      fetch: (input: string | URL | Request, init?: RequestInit) =>
        fetch(input, { ...init, headers: { ...(init?.headers ?? {}), authorization: `Bearer ${TOKEN}` } })
    });
    const client = new Client({ name: 'test', version: '1.0.0' });
    await client.connect(transport);

    const { tools } = await client.listTools();
    expect(tools).toHaveLength(9);
    expect(tools.map(t => t.name)).toContain('open_work_order');

    await client.close();
  });
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npx vitest run test/unit/auth.test.ts test/integration/http.test.ts`
Expected: FAIL — no existen `auth.ts` ni `sessions.ts`.

- [ ] **Step 3: Implementar `src/http/auth.ts`**

```typescript
import { createHash } from 'node:crypto';
import type { Business } from '../domain/types.js';
import type { Store } from '../store/store.js';

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function bearerFrom(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1]!.trim() : null;
}

export async function businessFor(store: Store, token: string): Promise<Business | null> {
  return store.getBusinessByTokenHash(hashToken(token));
}
```

- [ ] **Step 4: Implementar `src/http/sessions.ts`**

```typescript
import type { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
import type { McpServer } from '@modelcontextprotocol/server';

export interface SessionEntry {
  transport: NodeStreamableHTTPServerTransport;
  server: McpServer;
  businessId: string;
  lastSeen: number;
}

export class Sessions {
  private entries = new Map<string, SessionEntry>();

  /** Devuelve la sesión solo si pertenece al negocio del token. */
  get(sessionId: string, businessId: string): SessionEntry | null {
    const entry = this.entries.get(sessionId);
    if (!entry || entry.businessId !== businessId) return null;
    return entry;
  }

  set(sessionId: string, entry: SessionEntry): void {
    this.entries.set(sessionId, entry);
  }

  drop(sessionId: string): void {
    const entry = this.entries.get(sessionId);
    if (!entry) return;
    this.entries.delete(sessionId);
    void entry.transport.close();
    void entry.server.close();
  }

  touch(sessionId: string, now: number): void {
    const entry = this.entries.get(sessionId);
    if (entry) entry.lastSeen = now;
  }

  sweep(now: number, idleMs: number): void {
    for (const [sessionId, entry] of this.entries) {
      if (now - entry.lastSeen > idleMs) this.drop(sessionId);
    }
  }

  closeAll(): void {
    for (const sessionId of [...this.entries.keys()]) this.drop(sessionId);
  }
}
```

- [ ] **Step 5: Reescribir `src/http/app.ts`**

```typescript
import { randomUUID } from 'node:crypto';
import { createMcpExpressApp } from '@modelcontextprotocol/express';
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
import { McpServer } from '@modelcontextprotocol/server';
import type { Express, Request, Response } from 'express';
import { loadProfile } from '../profiles/load.js';
import { registerTools, type ToolContext } from '../tools/context.js';
import type { Store } from '../store/store.js';
import type { Business } from '../domain/types.js';
import { bearerFrom, businessFor } from './auth.js';
import { Sessions } from './sessions.js';

const IDLE_MS = 30 * 60 * 1000;

export function createApp(deps: { store: Store; devBusinessId?: string; host: string }): Express {
  if (deps.devBusinessId && deps.host !== '127.0.0.1') {
    throw new Error('COUNTERPART_DEV_BUSINESS solo se permite escuchando en 127.0.0.1');
  }

  const app = createMcpExpressApp({ host: deps.host });
  const sessions = new Sessions();
  const sweeper = setInterval(() => sessions.sweep(Date.now(), IDLE_MS), 60_000);
  sweeper.unref();

  app.get('/ping', (_req: Request, res: Response) => {
    res.status(200).type('text/plain').send('ok');
  });

  app.all('/mcp', async (req: Request, res: Response) => {
    const business = await resolveBusiness(deps, req);
    if (!business) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }

    const sessionId = req.header('mcp-session-id');

    if (sessionId) {
      const entry = sessions.get(sessionId, business.id);
      if (!entry) {
        res.status(403).json({ error: 'forbidden' });
        return;
      }
      sessions.touch(sessionId, Date.now());
      await entry.transport.handleRequest(req, res, req.body);
      return;
    }

    const server = new McpServer({ name: 'counterpart', version: '0.1.0' });
    const ctx: ToolContext = {
      business, profile: loadProfile(business.profileId), store: deps.store,
      now: () => new Date(), newId: prefix => `${prefix}-${randomUUID()}`
    };
    registerTools(server, ctx);

    const transport = new NodeStreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: id => sessions.set(id, { transport, server, businessId: business.id, lastSeen: Date.now() }),
      onsessionclosed: id => sessions.drop(id)
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  app.locals.sessions = sessions;
  return app;
}

async function resolveBusiness(deps: { store: Store; devBusinessId?: string }, req: Request): Promise<Business | null> {
  const token = bearerFrom(req.header('authorization'));
  if (token) return businessFor(deps.store, token);
  if (deps.devBusinessId) return deps.store.getBusiness(deps.devBusinessId);
  return null;
}
```

- [ ] **Step 6: Reescribir `src/index.ts`**

```typescript
import { createApp } from './http/app.js';
import { MemoryStore } from './store/memory.js';
import { seedAll } from '../seed/run.js';
import type { Sessions } from './http/sessions.js';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';
const devBusinessId = process.env.COUNTERPART_DEV_BUSINESS;

// El Plan B cambia MemoryStore por DynamoStore según una variable de entorno.
const store = new MemoryStore();
await seedAll(store);

const app = createApp({ store, host, devBusinessId });
const httpServer = app.listen(port, host, () => {
  console.log(JSON.stringify({ msg: 'listening', port, host }));
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    (app.locals.sessions as Sessions).closeAll();
    httpServer.close(() => process.exit(0));
  });
}
```

Nota: `src/index.ts` importa `seedAll`, que se crea en la Task 14. Haz esta tarea y la siguiente seguidas; hasta entonces `npm run dev` no levanta.

- [ ] **Step 7: Correr las pruebas y verificar que pasan**

Run: `npx vitest run test/unit/auth.test.ts test/integration/http.test.ts`
Expected: PASS, los 5 casos.

- [ ] **Step 8: Commit**

```bash
git add src/http src/index.ts test/unit/auth.test.ts test/integration/http.test.ts
git commit -m "feat: authenticate by bearer token and keep one MCP session per business"
```

---

## Task 14: Semillas y prueba de extremo a extremo

**Files:**
- Create: `seed/data.ts`, `seed/run.ts`
- Test: `test/integration/e2e.test.ts`

**Interfaces:**
- Consumes: `Store` (Task 8), `hashToken` (Task 13), tipos del dominio (Task 4).
- Produces:
  - `seedAll(store: Store): Promise<void>` — deja listos los dos negocios con sus tokens.
  - `DEMO_TOKENS = { shop: 'demo-shop-token', bakery: 'demo-bakery-token' }` — solo para desarrollo local; los tokens reales se generan en el Plan B.

**Desviación consciente del spec:** el spec pedía 40 ítems en el taller y 30 en la pastelería. Aquí se siembran 14 y 12. Es lo suficiente para que el resumen, el reorden y el top de ítems se vean reales en el video, y evita inventar decenas de nombres sin valor. Si en el video se nota vacío, agregar ítems es trivial porque es solo data.

- [ ] **Step 1: Escribir la prueba que falla**

`test/integration/e2e.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { McpServer } from '@modelcontextprotocol/server';
import { loadProfile } from '../../src/profiles/load.js';
import { MemoryStore } from '../../src/store/memory.js';
import { registerTools, type ToolContext } from '../../src/tools/context.js';
import { seedAll } from '../../seed/run.js';

const NOW = new Date('2026-09-15T15:00:00Z'); // martes

async function connect(bizId: string): Promise<Client> {
  const store = new MemoryStore();
  await seedAll(store);
  const business = (await store.getBusiness(bizId))!;
  const server = new McpServer({ name: 'counterpart', version: '0.1.0' });
  let n = 0;
  const ctx: ToolContext = {
    business, profile: loadProfile(business.profileId), store,
    now: () => NOW, newId: p => `${p}-${++n}`
  };
  registerTools(server, ctx);

  const [clientEnd, serverEnd] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'e2e', version: '1.0.0' });
  await server.server.connect(serverEnd);
  await client.connect(clientEnd);
  return client;
}

const text = (r: { content: unknown[] }): string => (r.content[0] as { text: string }).text;

describe('flujo completo', () => {
  it('taller: abrir, cobrar partida, avanzar, cerrar y verlo en el reporte', async () => {
    const client = await connect('shop');

    const opened = await client.callTool({
      name: 'open_work_order',
      arguments: { customerName: 'Sam Reyes', asset: { year: 2020, make: 'Ford', model: 'F-150' }, description: 'oil change' }
    });
    expect(opened.isError).toBeFalsy();

    const added = await client.callTool({
      name: 'add_parts_or_labor', arguments: { order: 'the F-150', item: 'oil change' }
    });
    expect(added.isError).toBeFalsy();

    const moved = await client.callTool({
      name: 'move_work_order_stage', arguments: { order: 'the F-150', stage: 'ready_for_pickup' }
    });
    expect(text(moved)).toContain('ready for pickup');

    const closed = await client.callTool({
      name: 'close_out_work_order', arguments: { order: 'the F-150', paymentMethod: 'card' }
    });
    expect(text(closed)).toContain('They paid');

    const report = await client.callTool({ name: 'sales_report', arguments: { period: 'today' } });
    const data = report.structuredContent as { count: number; totalCents: number };
    expect(data.count).toBeGreaterThanOrEqual(1);
    expect(data.totalCents).toBeGreaterThan(0);

    await client.close();
  });

  it('pastelería: tomar pedido con fecha y encontrarlo por día', async () => {
    const client = await connect('bakery');

    const taken = await client.callTool({
      name: 'take_cake_order',
      arguments: { customerName: 'Priya Shah', flavor: 'chocolate', size: '10-inch', due: 'saturday' }
    });
    expect(taken.isError).toBeFalsy();
    expect((taken.structuredContent as { dueOn: string }).dueOn).toBe('2026-09-19');

    const found = await client.callTool({ name: 'find_cake_orders', arguments: { due: 'saturday' } });
    const data = found.structuredContent as { total: number };
    expect(data.total).toBeGreaterThanOrEqual(1);

    await client.close();
  });

  it('el resumen de la pastelería no usa vocabulario del taller', async () => {
    const client = await connect('bakery');
    const r = await client.callTool({ name: 'get_bakery_snapshot', arguments: {} });
    expect(text(r)).not.toContain('work order');
    await client.close();
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run test/integration/e2e.test.ts`
Expected: FAIL — no existe `seed/run.ts`.

- [ ] **Step 3: Implementar `seed/data.ts`**

```typescript
import type { CatalogItem } from '../src/domain/types.js';

type ItemSeed = Omit<CatalogItem, 'version'>;

const item = (i: Partial<ItemSeed> & { id: string; name: string }): CatalogItem => ({
  synonyms: [], kind: 'part', unit: 'each', priceCents: 1000, taxable: true, stocked: true,
  onHand: 10, reorderPoint: 3, reorderQty: 12, supplierId: 'sup-1', consumes: {}, version: 1, ...i
});

export const SHOP_ITEMS: CatalogItem[] = [
  item({ id: 'pads-front', name: 'Front brake pads', synonyms: ['brake pads', 'pads'], priceCents: 4500, onHand: 1, reorderPoint: 2 }),
  item({ id: 'pads-rear', name: 'Rear brake pads', synonyms: [], priceCents: 4200, onHand: 6 }),
  item({ id: 'rotor', name: 'Brake rotor', synonyms: ['rotor'], priceCents: 6800, onHand: 2, reorderPoint: 4 }),
  item({ id: 'oil-filter', name: 'Oil filter', synonyms: ['filter'], priceCents: 900, onHand: 3, reorderPoint: 5 }),
  item({ id: 'oil-5w30', name: '5W-30 quart', synonyms: ['5w30', 'oil'], unit: 'quart', priceCents: 750, onHand: 24, reorderPoint: 10 }),
  item({ id: 'air-filter', name: 'Air filter', synonyms: [], priceCents: 1900, onHand: 7 }),
  item({ id: 'wiper', name: 'Wiper blade', synonyms: ['wipers'], priceCents: 1600, onHand: 9 }),
  item({ id: 'battery', name: 'Battery', synonyms: [], priceCents: 15900, onHand: 2, reorderPoint: 2, supplierId: 'sup-2' }),
  item({ id: 'coolant', name: 'Coolant gallon', synonyms: ['antifreeze'], unit: 'gallon', priceCents: 2400, onHand: 5, supplierId: 'sup-2' }),
  item({ id: 'spark-plug', name: 'Spark plug', synonyms: ['plugs'], priceCents: 1200, onHand: 16 }),
  item({ id: 'labor-oil', name: 'Oil change', kind: 'labor', stocked: false, taxable: false, unit: 'job', priceCents: 6000, consumes: { 'oil-filter': 1, 'oil-5w30': 5 } }),
  item({ id: 'labor-brake', name: 'Brake job labor', kind: 'labor', stocked: false, taxable: false, unit: 'hour', priceCents: 12000 }),
  item({ id: 'labor-diag', name: 'Diagnostic', kind: 'labor', stocked: false, taxable: false, unit: 'hour', priceCents: 9500 }),
  item({ id: 'labor-align', name: 'Alignment', kind: 'labor', stocked: false, taxable: false, unit: 'job', priceCents: 11000 })
];

export const BAKERY_ITEMS: CatalogItem[] = [
  item({ id: 'cake-8', name: '8-inch round cake', kind: 'product', stocked: false, priceCents: 4500, unit: 'cake', consumes: { 'box-8': 1, 'board-8': 1 } }),
  item({ id: 'cake-10', name: '10-inch round cake', kind: 'product', stocked: false, priceCents: 6500, unit: 'cake', consumes: { 'box-10': 1, 'board-10': 1 } }),
  item({ id: 'cupcakes', name: 'Cupcake dozen', kind: 'product', stocked: false, priceCents: 3600, unit: 'dozen' }),
  item({ id: 'filling', name: 'Custom filling', kind: 'product', stocked: false, priceCents: 900, unit: 'each' }),
  item({ id: 'delivery', name: 'Delivery', kind: 'product', stocked: false, taxable: false, priceCents: 2500, unit: 'trip' }),
  item({ id: 'box-8', name: '8-inch cake box', kind: 'supply', priceCents: 120, onHand: 40, reorderPoint: 20, reorderQty: 100 }),
  item({ id: 'box-10', name: '10-inch cake box', kind: 'supply', priceCents: 150, onHand: 12, reorderPoint: 20, reorderQty: 100 }),
  item({ id: 'board-8', name: '8-inch cake board', kind: 'supply', priceCents: 80, onHand: 35, reorderPoint: 20, reorderQty: 100 }),
  item({ id: 'board-10', name: '10-inch cake board', kind: 'supply', priceCents: 95, onHand: 8, reorderPoint: 20, reorderQty: 100 }),
  item({ id: 'flour', name: 'Flour', kind: 'ingredient', unit: 'pound', priceCents: 90, onHand: 60, reorderPoint: 25, reorderQty: 100, supplierId: 'sup-3' }),
  item({ id: 'butter', name: 'Butter', kind: 'ingredient', unit: 'pound', priceCents: 480, onHand: 14, reorderPoint: 20, reorderQty: 40, supplierId: 'sup-3' }),
  item({ id: 'cocoa', name: 'Cocoa powder', kind: 'ingredient', unit: 'pound', priceCents: 720, onHand: 6, reorderPoint: 8, reorderQty: 20, supplierId: 'sup-3' })
];

/** PRNG determinista, para que la semilla sea idéntica en cada corrida. */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

- [ ] **Step 4: Implementar `seed/run.ts`**

```typescript
import { hashToken } from '../src/http/auth.js';
import { loadProfile } from '../src/profiles/load.js';
import { spokenLabel } from '../src/domain/assets.js';
import { newOrder, recalcTotals } from '../src/domain/orders.js';
import type { Business, Order, Payment } from '../src/domain/types.js';
import type { Store } from '../src/store/store.js';
import { BAKERY_ITEMS, SHOP_ITEMS, mulberry32 } from './data.js';

export const DEMO_TOKENS = { shop: 'demo-shop-token', bakery: 'demo-bakery-token' };

const SHOP: Business = {
  id: 'shop', name: 'Oak Street Auto', profileId: 'auto-repair',
  timezone: 'America/Chicago', taxRateBps: 825, nextOrderNumber: 41, version: 1
};
const BAKERY: Business = {
  id: 'bakery', name: 'Sweet Crumb Bakery', profileId: 'bakery',
  timezone: 'America/Chicago', taxRateBps: 825, nextOrderNumber: 12, version: 1
};

const VEHICLES: Array<[string, Record<string, string | number>, string]> = [
  ['Dana Lee', { year: 2019, make: 'Honda', model: 'Civic', plate: 'JHK 4821' }, 'estimate'],
  ['Mark Ortiz', { year: 2016, make: 'Toyota', model: 'Camry' }, 'approved'],
  ['Priya Shah', { year: 2018, make: 'Toyota', model: 'Camry' }, 'in_bay'],
  ['Alex Nowak', { year: 2015, make: 'Subaru', model: 'Outback' }, 'in_bay'],
  ['Rosa Medina', { year: 2021, make: 'Kia', model: 'Sorento' }, 'waiting_on_parts'],
  ['Tom Becker', { year: 2017, make: 'Chevrolet', model: 'Malibu' }, 'waiting_on_parts'],
  ['Nina Patel', { year: 2020, make: 'Mazda', model: 'CX-5' }, 'ready_for_pickup'],
  ['Owen Clark', { year: 2014, make: 'Ram', model: '1500' }, 'ready_for_pickup']
];

const CAKES: Array<[string, Record<string, string>, string, number]> = [
  ['Grace Kim', { flavor: 'vanilla', size: '8-inch', inscription: 'Happy Birthday' }, 'ordered', 1],
  ['Luis Romero', { flavor: 'chocolate', size: '10-inch' }, 'ordered', 4],
  ['Emma Wright', { flavor: 'red velvet', size: '10-inch', inscription: 'Congrats' }, 'baking', 4],
  ['Jonas Meyer', { flavor: 'carrot', size: '8-inch' }, 'decorating', 4],
  ['Ada Silva', { flavor: 'lemon', size: '8-inch' }, 'ready', 0],
  ['Ben Haddad', { flavor: 'chocolate', size: '10-inch', inscription: 'Thank You' }, 'ready', 2]
];

/** Siembra los dos negocios del demo. Determinista: la misma corrida produce los mismos datos. */
export async function seedAll(store: Store, now: Date = new Date()): Promise<void> {
  await seedShop(store, now);
  await seedBakery(store, now);
}

async function seedShop(store: Store, now: Date): Promise<void> {
  await store.putBusiness(SHOP);
  await store.putToken(hashToken(DEMO_TOKENS.shop), SHOP.id);
  await store.putItems(SHOP.id, SHOP_ITEMS);

  const profile = loadProfile('auto-repair');
  let n = 0;

  for (const [name, fields, stage] of VEHICLES) {
    n += 1;
    const customerId = `shop-cust-${n}`;
    const assetId = `shop-asset-${n}`;
    await store.putCustomer(SHOP.id, { id: customerId, name, nameNormalized: name.toLowerCase() });
    await store.putAsset(SHOP.id, {
      id: assetId, customerId, fields, spokenLabel: spokenLabel(profile.asset!, fields)
    });

    const order = newOrder({
      id: `shop-ord-${n}`, number: await store.takeOrderNumber(SHOP.id),
      customerId, assetId, fields: {}, stage, now
    });
    await store.putOrder(SHOP.id, order);
  }

  await seedPayments(store, SHOP.id, now, 1234, 9000, 48000);
}

async function seedBakery(store: Store, now: Date): Promise<void> {
  await store.putBusiness(BAKERY);
  await store.putToken(hashToken(DEMO_TOKENS.bakery), BAKERY.id);
  await store.putItems(BAKERY.id, BAKERY_ITEMS);

  let n = 0;
  for (const [name, fields, stage, dueInDays] of CAKES) {
    n += 1;
    const customerId = `bakery-cust-${n}`;
    await store.putCustomer(BAKERY.id, { id: customerId, name, nameNormalized: name.toLowerCase() });

    const due = new Date(now.getTime() + dueInDays * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const order = newOrder({
      id: `bakery-ord-${n}`, number: await store.takeOrderNumber(BAKERY.id),
      customerId, fields, dueOn: due, stage, now
    });
    await store.putOrder(BAKERY.id, order);
  }

  await seedPayments(store, BAKERY.id, now, 4321, 3000, 14000);
}

/** 30 días de cobros con más movimiento los viernes y sábados. */
async function seedPayments(
  store: Store, bizId: string, now: Date, seed: number, minCents: number, maxCents: number
): Promise<void> {
  const random = mulberry32(seed);

  for (let dayOffset = 29; dayOffset >= 0; dayOffset--) {
    const date = new Date(now.getTime() - dayOffset * 24 * 3600 * 1000);
    const weekday = date.getUTCDay();
    if (weekday === 0) continue; // cerrado los domingos

    const sales = weekday === 5 || weekday === 6 ? 4 + Math.floor(random() * 3) : 2 + Math.floor(random() * 3);
    for (let i = 0; i < sales; i++) {
      const amount = Math.round(minCents + random() * (maxCents - minCents));
      const paidAt = `${date.toISOString().slice(0, 10)}T${String(14 + (i % 6)).padStart(2, '0')}:05:00.000Z`;
      const order: Order = recalcTotals(
        newOrder({ id: `${bizId}-hist-${dayOffset}-${i}`, number: 1000 + dayOffset * 10 + i,
                   customerId: 'history', fields: {}, stage: 'history', now: date }),
        0
      );
      const payment: Payment = {
        id: `${bizId}-pay-${dayOffset}-${i}`, orderId: order.id,
        amountCents: amount, method: i % 2 === 0 ? 'card' : 'cash', paidAt
      };
      await store.commitClose(bizId, { ...order, totalCents: amount }, payment);
    }
  }
}
```

Nota: las órdenes históricas se guardan en la etapa `history`, que no existe en ningún perfil. Eso es a propósito: no aparecen en los conteos por etapa (que iteran las etapas del perfil) ni en las candidatas de las referencias habladas con puntaje suficiente, pero sí alimentan el reporte de ventas.

- [ ] **Step 5: Correr toda la suite**

Run: `npx vitest run`
Expected: PASS en todo, incluidos los 3 casos de extremo a extremo.

- [ ] **Step 6: Probar a mano con el host de MCP Apps**

```bash
COUNTERPART_DEV_BUSINESS=shop HOST=127.0.0.1 npm run dev
```

En otra terminal, desde el repo de ext-apps clonado:

```bash
cd examples/basic-host && npm install && SERVERS='["http://127.0.0.1:3000/mcp"]' npm start
```

Abre `http://localhost:8080` y confirma que aparecen las nueve tools del taller y que `get_shop_snapshot` responde. Si basic-host permite mandar headers, úsalo con `Authorization: Bearer demo-shop-token` en vez del modo local.

- [ ] **Step 7: Commit**

```bash
git add seed test/integration/e2e.test.ts
git commit -m "feat: seed both demo businesses and cover the full flow end to end"
```

---

## Self-Review

**1. Cobertura del spec.** Cada requisito del spec tiene tarea, salvo lo que pertenece al Plan B:

| Sección del spec | Dónde queda |
|---|---|
| §4.1 perfiles, §7.2 generación de tools | Tasks 2 y 10 |
| §4.2 las nueve tools | Tasks 11 y 12 |
| §7.1 sesiones y autenticación | Task 13 |
| §7.3 modelo de datos | Tasks 4 y 8 (forma y store en memoria); DynamoDB en el Plan B |
| §7.4 reglas de dominio | Tasks 3, 4, 5 |
| §7.5 referencias habladas | Task 6 |
| §7.6 entradas por tool | Task 10 |
| §7.7 contrato de respuesta y errores | Tasks 11 y 12 |
| §7.8 idempotencia | Task 12 (open, move, closeOut, reorder) |
| §7.10 `/ping`, apagado ordenado, logs | Task 13 |
| §9 datos semilla | Task 14, con la desviación documentada de 14 y 12 ítems |
| §11 pruebas capas 1 y 2 | Todas las tareas |
| §7.9 MCP Apps, §8 infraestructura, §10 demo, §11 capas 3 y 4, §12 spikes, §13 entregables | **Plan B** |

**Hueco consciente:** el spec pide logs JSON con `requestId`, `sessionId`, tool y duración. La Task 13 deja el arranque y el apagado; el middleware de logging por tool entra en el Plan B junto con CloudWatch, porque sin destino de logs no hay forma de verificarlo.

**2. Placeholders.** No hay "TBD", "pendiente" ni pasos sin código. Las dos dependencias hacia adelante están marcadas explícitamente: `inventory.ts` usa `tokenScore` de la Task 6, y `src/index.ts` usa `seedAll` de la Task 14.

**3. Consistencia de tipos.** Nombres verificados de punta a punta: `Profile.toolNames`, `OrderRef { order, customer, asset? }`, `Store.commitOrderWithItems`, `Store.commitClose`, `ToolContext { business, profile, store, now, newId }`, `say.orderPhrase`, `refLabel`, `spokenLabel`, `tokenScore`, `resolveOrder`, `findItem`, `planReorder`, `buildSnapshot`, `buildSalesReport`, `periodRange`, `resolveDue`, `taxOn`, `formatMoney`, `hashToken`, `bearerFrom`, `Sessions.get`.

---

## Ejecución

Cuando termines el Plan A tendrás un servidor MCP funcionando en local, con los dos perfiles, las nueve tools, autenticación por token y sesiones por negocio, cubierto por pruebas unitarias y de integración. A partir de ahí entra el Plan B.
