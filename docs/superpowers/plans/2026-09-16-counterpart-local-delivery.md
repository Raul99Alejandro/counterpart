# Counterpart Local Delivery — Implementation Plan (Plan B1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar Counterpart listo para desplegar y demostrar sin depender todavía de cuentas de AWS ni de Alexa: persistencia en DynamoDB (probada contra DynamoDB Local), logs estructurados, las dos UIs de MCP Apps, imagen Docker, scripts de siembra y tokens, frases de oro y los entregables escritos del hackathon.

**Architecture:** Se agrega un `DynamoStore` que cumple la misma interfaz `Store` que `MemoryStore`, verificado por una suite de contrato compartida. El arranque elige el store por variables de entorno. Un proxy sobre `McpServer` instrumenta cada tool con logs JSON correlacionados con la petición HTTP mediante `AsyncLocalStorage`. Las tools de resumen y de reporte pasan a ser tools de MCP Apps que apuntan a dos HTML de un solo archivo construidos con Vite.

**Tech Stack:** Node.js 24, TypeScript ESM, `@modelcontextprotocol/server`/`node`/`express`/`client` 2.0.0, `@modelcontextprotocol/ext-apps` 2.0.0, AWS SDK v3 (`@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`), DynamoDB Local en Docker, Vite + `vite-plugin-singlefile`, vitest.

**Spec:** `docs/superpowers/specs/2026-09-15-counterpart-alexa-mcp-design.md`

**Contexto previo:** el Plan A (`docs/superpowers/plans/2026-09-15-counterpart-core.md`) está completo e integrado en `main`: 92 pruebas en verde. Lo que dejó abierto está en `docs/plan-b-carryover.md`. **Plan B2** (aparte, se escribe cuando existan las cuentas): spikes en AWS, despliegue en ECS Express Mode, bridge de Alexa, corrida de frases de oro, video y submission.

## Global Constraints

- **Ninguna tarea de este plan necesita cuentas de AWS ni de Alexa.** Todo corre en la máquina local; DynamoDB se prueba contra DynamoDB Local en Docker.
- **Protocolo MCP `2025-11-25`.** Paquetes MCP en versión exacta `2.0.0`, sin `^`: `@modelcontextprotocol/server`, `node`, `express`, `client`, y ahora también `@modelcontextprotocol/ext-apps`.
- **AWS SDK v3** con `^3.1133.0`: `@aws-sdk/client-dynamodb` y `@aws-sdk/lib-dynamodb`. El `DynamoDBDocumentClient` siempre con `marshallOptions: { removeUndefinedValues: true }`, porque las entidades tienen campos opcionales en `undefined`.
- **DynamoDB Local:** imagen `amazon/dynamodb-local`, puerto `8000`. Las pruebas que la necesitan solo corren si existe la variable `DYNAMODB_ENDPOINT`; sin ella aparecen como omitidas, nunca como aprobadas.
- **Tabla única** `counterpart` con llave `pk` (partición) y `sk` (orden), ambas string, facturación on-demand. Formatos de llave del spec §7.3: `TOKEN#<sha256>`/`TOKEN`, `BIZ#<id>`/`META`, `CUST#<id>`, `ASSET#<id>`, `ORD#<id>`, `ITEM#<id>`, `PO#<id>`, `PAY#<YYYY-MM-DD>#<id>`.
- **El store preserva dos invariantes del Plan A:** `commitOrderWithItems` valida todas las versiones antes de escribir cualquier registro, y `listPayments(from, to)` es un rango de fechas civiles inclusivo en ambos extremos.
- **Fechas:** `YYYY-MM-DD` en la zona horaria del negocio, nunca la del servidor ni la de UTC.
- **Logs:** un objeto JSON por línea en **stdout**, con campo `level`. Nunca se registra un token en claro.
- **MCP Apps:** helpers de servidor desde `@modelcontextprotocol/ext-apps/server`; esquemas como `z.object(...)`. Cada UI se construye con Vite en `build/ui/<nombre>/index.html`. El texto de `content` de cada tool debe bastar por sí solo.
- **Todo el texto hablado va en inglés (en-US)**, en una o dos oraciones, sin markdown, y sale de `say.*` o del vocabulario del perfil. Comentarios de código en español.
- **Errores de dominio:** `isError: true` con solo texto y sin `structuredContent`.
- **zod v4** como `import * as z from 'zod/v4'`. TypeScript ESM con imports `.js`.
- **Verificación al cerrar cada tarea:** `npm test` en verde (desde la Task 6 compila las UIs antes de probar), `npm run typecheck` limpio y `npm run build` limpio. Hoy hay 92 pruebas: ninguna se borra ni se debilita.
- Un commit por tarea como mínimo, en inglés, estilo conventional commits.

---

## File Structure

| Archivo | Tarea | Responsabilidad |
|---|---|---|
| `src/domain/types.ts` | 1 | `Payment` gana `paidOn` (fecha civil del cobro) |
| `src/domain/orders.ts`, `src/domain/reports.ts` | 1 | Cobro con fecha civil; reportes agrupan por `paidOn` |
| `src/tools/close-out.ts` | 1 | Pasa la fecha civil y compara cierres por fecha civil |
| `seed/run.ts` | 1, 2 | Cobros y vencimientos en la zona del negocio |
| `src/speech/say.ts` | 2 | Concordancia de número y singular en "no encontrado" |
| `src/tools/snapshot.ts`, `src/tools/sales-report.ts` | 2, 6 | Máximo dos oraciones; luego, tools de MCP Apps |
| `src/domain/resolver.ts` | 2 | Busca en todos los campos del activo, no solo `plate` |
| `src/profiles/load.ts` | 2 | Rechaza ids reservados en `orderFields` |
| `src/store/dynamo.ts` | 3 | `DynamoStore` y construcción del cliente |
| `src/store/table.ts` | 3 | Crear y borrar la tabla |
| `test/contract/store-contract.ts` | 3 | Suite de contrato que cumplen ambos stores |
| `src/store/from-env.ts` | 4 | Elegir y abrir el store según el entorno |
| `seed/cli.ts`, `infra/create-token.ts` | 4 | Sembrar DynamoDB y emitir tokens |
| `src/log.ts`, `src/http/request-context.ts` | 5 | Logs JSON y contexto de petición |
| `src/tools/instrument.ts` | 5 | Proxy que mide y registra cada tool |
| `ui/**` | 6 | Las dos UIs y su build |
| `src/tools/ui-assets.ts` | 6 | Registrar los recursos `ui://` y ubicar los bundles |
| `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `tsconfig.build.json`, `infra/smoke.ts` | 7 | Imagen, entorno local completo y prueba de humo |
| `test/golden/*.yaml` | 8 | Frases de oro por perfil |
| `README.md`, `LICENSE`, `docs/*.md` | 9 | Entregables del hackathon |

---

## Task 1: Fecha civil del cobro

El Plan A guarda la fecha de un cobro como los primeros diez caracteres de `paidAt`, que es un instante en UTC, y la compara contra fechas civiles del negocio. Un cobro a las 20:30 en Chicago es el día siguiente en UTC: queda fuera del reporte de "hoy". Lo mismo rompe la idempotencia del cierre de noche. Esta tarea va antes que el `DynamoStore` porque la llave de los cobros en DynamoDB usa esa fecha.

**Files:**
- Modify: `src/domain/types.ts`, `src/domain/orders.ts`, `src/domain/reports.ts`, `src/store/memory.ts`, `src/tools/close-out.ts`, `seed/run.ts`
- Modify (fixtures): `test/unit/orders.test.ts`, `test/unit/reports.test.ts`, `test/unit/memory-store.test.ts`
- Test: `test/integration/civil-date.test.ts` (nuevo)

**Interfaces:**
- Consumes: `businessToday`, `shiftDays` de `src/domain/dates.ts`.
- Produces:
  - `interface Payment { id: string; orderId: string; amountCents: number; method: 'cash' | 'card' | 'check'; paidAt: string; paidOn: string }` — `paidOn` es `YYYY-MM-DD` en la zona del negocio.
  - `closeOut(order, method, profile, now, paymentId, paidOn: string)` — nuevo último parámetro.
  - `Store.listPayments(bizId, from, to)` filtra por `paidOn`.

- [ ] **Step 1: Escribir la prueba de regresión que falla**

`test/integration/civil-date.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { McpServer } from '@modelcontextprotocol/server';
import { MemoryStore } from '../../src/store/memory.js';
import { loadProfile } from '../../src/profiles/load.js';
import { registerTools, type ToolContext } from '../../src/tools/context.js';
import type { Business, Order } from '../../src/domain/types.js';

// 20:30 del 15 de septiembre en Chicago = 01:30 del 16 en UTC.
const EVENING = new Date('2026-09-16T01:30:00Z');

const business: Business = {
  id: 'b1', name: 'Oak Street Auto', profileId: 'auto-repair',
  timezone: 'America/Chicago', taxRateBps: 825, nextOrderNumber: 43, version: 1
};

async function connect(): Promise<Client> {
  const store = new MemoryStore();
  await store.putBusiness(business);
  await store.putCustomer('b1', { id: 'c1', name: 'Dana Lee', nameNormalized: 'dana lee' });
  await store.putAsset('b1', {
    id: 'a1', customerId: 'c1',
    fields: { year: 2019, make: 'Honda', model: 'Civic' }, spokenLabel: '2019 Honda Civic'
  });
  const order: Order = {
    id: 'o1', number: 41, customerId: 'c1', assetId: 'a1', stage: 'ready_for_pickup', fields: {},
    lines: [{ itemId: 'i1', name: 'Oil change', quantity: 1, unitPriceCents: 6000, taxable: false, backordered: 0 }],
    subtotalCents: 6000, taxCents: 0, totalCents: 6000, stageHistory: [],
    createdAt: '2026-09-14T15:00:00.000Z', version: 1
  };
  await store.putOrder('b1', order);

  let n = 0;
  const ctx: ToolContext = {
    business, profile: loadProfile('auto-repair'), store,
    now: () => EVENING, newId: p => `${p}-${++n}`
  };
  const server = new McpServer({ name: 'counterpart', version: '0.1.0' });
  registerTools(server, ctx);
  const [clientEnd, serverEnd] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1.0.0' });
  await server.server.connect(serverEnd);
  await client.connect(clientEnd);
  return client;
}

const text = (r: { content: unknown[] }): string => (r.content[0] as { text: string }).text;

describe('fecha civil del cobro', () => {
  it('un cobro de noche cuenta en el día del negocio, no en el de UTC', async () => {
    const client = await connect();
    const closed = await client.callTool({
      name: 'close_out_work_order', arguments: { order: 'the Civic', paymentMethod: 'card' }
    });
    expect(closed.isError).toBeFalsy();

    const report = await client.callTool({ name: 'sales_report', arguments: { period: 'today' } });
    const data = report.structuredContent as { from: string; count: number; totalCents: number };
    expect(data.from).toBe('2026-09-15');
    expect(data.count).toBe(1);
    expect(data.totalCents).toBe(6000);
    await client.close();
  });

  it('repetir el cierre de noche sigue siendo idempotente', async () => {
    const client = await connect();
    await client.callTool({ name: 'close_out_work_order', arguments: { order: 'the Civic', paymentMethod: 'card' } });
    const again = await client.callTool({
      name: 'close_out_work_order', arguments: { order: 'the Civic', paymentMethod: 'card' }
    });
    expect(text(again)).toContain('already closed');

    const report = await client.callTool({ name: 'sales_report', arguments: { period: 'today' } });
    expect((report.structuredContent as { count: number }).count).toBe(1);
    await client.close();
  });
});
```

- [ ] **Step 2: Correr y verificar que falla por la razón correcta**

Run: `npx vitest run test/integration/civil-date.test.ts`
Expected: FAIL en los dos casos. El primero da `count` 0, porque el cobro queda con fecha `2026-09-16`. El segundo no contiene `already closed`, porque el cierre anterior no entra entre las candidatas "cerradas hoy".

- [ ] **Step 3: Agregar `paidOn` al tipo y al dominio**

En `src/domain/types.ts`, reemplaza la línea de `Payment` por:

```typescript
export interface Payment { id: string; orderId: string; amountCents: number; method: 'cash' | 'card' | 'check'; paidAt: string; paidOn: string }
```

En `src/domain/orders.ts`, cambia la firma y el cuerpo de `closeOut`:

```typescript
/**
 * `paidOn` es la fecha civil del cobro en la zona del negocio. La calcula quien llama,
 * porque el dominio no conoce zonas horarias.
 */
export function closeOut(
  order: Order, method: Payment['method'], profile: Profile, now: Date, paymentId: string, paidOn: string
): { ok: true; order: Order; payment: Payment } | { ok: false; code: 'CANNOT_CLOSE' } {
  if (!profile.closeFrom.includes(order.stage)) return { ok: false, code: 'CANNOT_CLOSE' };
  const at = now.toISOString();
  return {
    ok: true,
    order: {
      ...order, stage: profile.closedStage, closedAt: at,
      stageHistory: [...order.stageHistory, { stage: profile.closedStage, at }]
    },
    payment: { id: paymentId, orderId: order.id, amountCents: order.totalCents, method, paidAt: at, paidOn }
  };
}
```

En `src/domain/reports.ts`, reemplaza la línea de `day`:

```typescript
const day = (p: Payment): string => p.paidOn;
```

En `src/store/memory.ts`, dentro de `listPayments`, reemplaza el filtro:

```typescript
  async listPayments(bizId: string, from: string, to: string): Promise<Payment[]> {
    return copy(this.tenant(bizId).payments.filter(p => p.paidOn >= from && p.paidOn <= to));
  }
```

- [ ] **Step 4: Pasar la fecha civil desde la tool de cierre**

En `src/tools/close-out.ts`, reemplaza el filtro de candidatas y la llamada a `closeOut`:

```typescript
      const today = businessToday(ctx.business.timezone, ctx.now());
      const refs = await loadRefs(ctx);
      // Candidatas: abiertas, más las cerradas hoy en la fecha del negocio, para que repetir el cierre sea idempotente.
      const closedToday = (closedAt: string | undefined): boolean =>
        closedAt !== undefined && businessToday(ctx.business.timezone, new Date(closedAt)) === today;
      const candidates = refs.filter(r =>
        r.order.stage !== ctx.profile.closedStage || closedToday(r.order.closedAt));
```

y más abajo:

```typescript
      const result = closeOut(order, paymentMethod, ctx.profile, ctx.now(), ctx.newId('pay'), today);
```

- [ ] **Step 5: Sembrar cobros en la zona del negocio**

En `seed/run.ts`, agrega el import:

```typescript
import { businessToday, shiftDays } from '../src/domain/dates.js';
```

y reemplaza el bucle de `seedPayments` desde `for (let dayOffset = 29; ...` hasta el cierre de ese `for` por:

```typescript
  const today = businessToday(biz.timezone, now);

  for (let dayOffset = 29; dayOffset >= 0; dayOffset--) {
    // Fecha civil del negocio; el día de la semana sale de esa fecha, no del reloj UTC.
    const civil = shiftDays(today, -dayOffset);
    const weekday = new Date(`${civil}T12:00:00Z`).getUTCDay();
    if (weekday === 0) continue; // cerrado los domingos

    const sales = weekday === 5 || weekday === 6 ? 4 + Math.floor(random() * 3) : 2 + Math.floor(random() * 3);
    for (let i = 0; i < sales; i++) {
      // 14:05Z–19:05Z cae entre las 8 y las 14 h en Chicago: siempre dentro del mismo día civil.
      const paidAt = `${civil}T${String(14 + (i % 6)).padStart(2, '0')}:05:00.000Z`;
      const lines = pickItems(menu, 2 + Math.floor(random() * 2), random)
        .map(item => line(item, 1 + Math.floor(random() * 2)));

      const order: Order = recalcTotals({
        ...newOrder({
          id: `${biz.id}-hist-${dayOffset}-${i}`, number: 1000 + dayOffset * 10 + i,
          customerId: walkIn.id, fields: {}, stage: profile.closedStage, now: new Date(paidAt)
        }),
        lines, closedAt: paidAt
      }, biz.taxRateBps);

      const payment: Payment = {
        id: `${biz.id}-pay-${dayOffset}-${i}`, orderId: order.id,
        amountCents: order.totalCents, method: i % 2 === 0 ? 'card' : 'cash', paidAt, paidOn: civil
      };
      await store.commitClose(biz.id, order, payment);
    }
  }
```

- [ ] **Step 6: Actualizar las fixtures que construyen cobros**

`test/unit/orders.test.ts`: las dos llamadas a `closeOut` reciben la fecha civil como último argumento, y el cobro esperado la incluye:

```typescript
    const r = closeOut(ready, 'card', profile, NOW, 'p1', '2026-09-15');
```

```typescript
        id: 'p1', orderId: 'o1', amountCents: 27743, method: 'card', paidAt: NOW.toISOString(), paidOn: '2026-09-15'
```

```typescript
    const r = closeOut({ ...orderWithLines(), stage: 'in_bay' }, 'cash', profile, NOW, 'p1', '2026-09-15');
```

`test/unit/reports.test.ts`, helper `pay`:

```typescript
  return { id, orderId, amountCents: cents, method: 'card', paidAt: `${date}T18:00:00.000Z`, paidOn: date };
```

`test/unit/memory-store.test.ts`: el cobro literal gana `paidOn: '2026-09-15'`, y se agrega este caso al `describe`:

```typescript
  it('filtra cobros por fecha civil, no por el día UTC del instante', async () => {
    const store = newStore();
    await store.commitClose('b1', { ...order, version: 1 }, {
      id: 'p9', orderId: 'o1', amountCents: 500, method: 'card',
      paidAt: '2026-09-16T01:30:00.000Z', paidOn: '2026-09-15'
    });
    expect(await store.listPayments('b1', '2026-09-15', '2026-09-15')).toHaveLength(1);
    expect(await store.listPayments('b1', '2026-09-16', '2026-09-16')).toHaveLength(0);
  });
```

- [ ] **Step 7: Correr todo y verificar**

Run: `npx vitest run`
Expected: PASS en todo — 92 pruebas previas más las 3 nuevas.

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add src seed test
git commit -m "fix: date payments by the business's civil day, not UTC"
```

---

## Task 2: Arreglos de habla y de datos para el demo

Seis defectos pequeños que se oyen o se ven en el video, más una guarda en el punto de extensión de perfiles.

**Files:**
- Modify: `src/speech/say.ts`, `src/tools/snapshot.ts`, `src/tools/sales-report.ts`, `src/domain/resolver.ts`, `src/profiles/load.ts`, `seed/run.ts`
- Test: `test/unit/say.test.ts`, `test/unit/resolver.test.ts`, `test/unit/profiles.test.ts`, `test/integration/spoken-summaries.test.ts` (nuevo), `test/integration/seed.test.ts` (nuevo)

**Interfaces:**
- Consumes: `resolveDue` de `src/domain/dates.ts`; `seedAll` de `seed/run.ts`.
- Produces: sin cambios de firma. Cambia el texto hablado y un nuevo error de validación de perfiles cuyo mensaje contiene `reservado`.

- [ ] **Step 1: Escribir las pruebas que fallan**

Agrega a `test/unit/say.test.ts`, dentro del `describe` existente (usa las fixtures `profile` y `ref` que ya están en el archivo):

```typescript
  it('concuerda en número el stock y el backorder', () => {
    const three = { itemId: 'i1', name: 'Front brake pads', quantity: 3, unitPriceCents: 4500, taxable: true, backordered: 1 };
    expect(say.lineAdded(profile, ref, three, 41250))
      .toBe('Added 3 Front brake pads to work order 42, but only 2 were in stock, so 1 is backordered. The total is now $412.50.');

    const none = { ...three, quantity: 2, backordered: 2 };
    expect(say.lineAdded(profile, ref, none, 41250))
      .toBe('Added 2 Front brake pads to work order 42, but none were in stock, so 2 are backordered. The total is now $412.50.');
  });

  it('habla en singular cuando solo hay una orden abierta', () => {
    expect(say.notFound(profile, 'Accord', [ref]))
      .toBe(`I couldn't find an open work order for "Accord". The only open one is work order 42, Dana Lee's 2019 Honda Civic.`);
  });
```

Agrega a `test/unit/resolver.test.ts`, dentro del `describe` existente:

```typescript
  it('busca en cualquier campo del activo, no solo en la placa', () => {
    const truck: OrderRef = {
      ...ref(90, 'Kim Park', 'Box Truck'),
      asset: { id: 'a90', customerId: 'c90', fields: { vin: 'ZX9' }, spokenLabel: 'Box Truck' }
    };
    expect(resolveOrder('ZX9', [civic, truck], profile)).toEqual({ kind: 'one', ref: truck });
  });
```

Agrega a `test/unit/profiles.test.ts`, dentro del `describe` existente:

```typescript
  it('rechaza un orderFields con un id reservado por las tools', () => {
    const bad = minimal();
    bad.orderFields = [{ id: 'due', type: 'string', required: true }];
    expect(() => parseProfile(bad)).toThrow(/reservado/);
  });
```

Crea `test/integration/seed.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../../src/store/memory.js';
import { resolveDue } from '../../src/domain/dates.js';
import { seedAll } from '../../seed/run.js';

const MOMENTS: Array<[string, Date]> = [
  ['martes', new Date('2026-09-15T15:00:00Z')],
  ['viernes', new Date('2026-09-18T15:00:00Z')],
  ['sábado', new Date('2026-09-19T15:00:00Z')]
];

describe('semilla de la pastelería', () => {
  for (const [label, now] of MOMENTS) {
    it(`deja exactamente tres pasteles para el sábado sembrando en ${label}`, async () => {
      const store = new MemoryStore();
      await seedAll(store, now);
      const saturday = resolveDue('saturday', 'America/Chicago', now);
      const orders = await store.listOrders('bakery');
      expect(orders.filter(o => o.stage !== 'picked_up' && o.dueOn === saturday)).toHaveLength(3);
    });
  }
});
```

Crea `test/integration/spoken-summaries.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { McpServer } from '@modelcontextprotocol/server';
import { MemoryStore } from '../../src/store/memory.js';
import { loadProfile } from '../../src/profiles/load.js';
import { registerTools, type ToolContext } from '../../src/tools/context.js';
import { seedAll } from '../../seed/run.js';
import type { Business, Order } from '../../src/domain/types.js';

const NOW = new Date('2026-09-15T15:00:00Z');
const sentences = (t: string): number => t.trim().split(/(?<=[.!?])\s+/).length;
const text = (r: { content: unknown[] }): string => (r.content[0] as { text: string }).text;

async function connectTo(store: MemoryStore, bizId: string): Promise<Client> {
  const business = (await store.getBusiness(bizId))!;
  let n = 0;
  const ctx: ToolContext = {
    business, profile: loadProfile(business.profileId), store, now: () => NOW, newId: p => `${p}-${++n}`
  };
  const server = new McpServer({ name: 'counterpart', version: '0.1.0' });
  registerTools(server, ctx);
  const [clientEnd, serverEnd] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1.0.0' });
  await server.server.connect(serverEnd);
  await client.connect(clientEnd);
  return client;
}

describe('resúmenes hablados', () => {
  for (const [bizId, snapshotTool] of [['shop', 'get_shop_snapshot'], ['bakery', 'get_bakery_snapshot']] as const) {
    it(`${bizId}: el resumen y los reportes caben en dos oraciones`, async () => {
      const store = new MemoryStore();
      await seedAll(store, NOW);
      const client = await connectTo(store, bizId);

      expect(sentences(text(await client.callTool({ name: snapshotTool, arguments: {} })))).toBeLessThanOrEqual(2);
      for (const period of ['today', 'this_week', 'last_month'] as const) {
        const r = await client.callTool({ name: 'sales_report', arguments: { period } });
        expect(sentences(text(r))).toBeLessThanOrEqual(2);
      }
      await client.close();
    });
  }

  it('dice "1 sale", no "1 sales"', async () => {
    const store = new MemoryStore();
    const business: Business = {
      id: 'b1', name: 'Oak Street Auto', profileId: 'auto-repair',
      timezone: 'America/Chicago', taxRateBps: 0, nextOrderNumber: 1, version: 1
    };
    await store.putBusiness(business);
    const order: Order = {
      id: 'o1', number: 1, customerId: 'c1', stage: 'picked_up', fields: {}, lines: [],
      subtotalCents: 1000, taxCents: 0, totalCents: 1000, stageHistory: [],
      createdAt: NOW.toISOString(), closedAt: NOW.toISOString(), version: 1
    };
    await store.commitClose('b1', order, {
      id: 'p1', orderId: 'o1', amountCents: 1000, method: 'cash', paidAt: NOW.toISOString(), paidOn: '2026-09-15'
    });
    const client = await connectTo(store, 'b1');

    const r = text(await client.callTool({ name: 'sales_report', arguments: { period: 'today' } }));
    expect(r).toContain('from 1 sale,');
    expect(r).not.toContain('1 sales');
    await client.close();
  });
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npx vitest run test/unit/say.test.ts test/unit/resolver.test.ts test/unit/profiles.test.ts test/integration/seed.test.ts test/integration/spoken-summaries.test.ts`
Expected: FAIL en los casos nuevos. `say` todavía dice "only 2 was" y "Open ones are"; el resolver no encuentra `ZX9`; el perfil acepta `due`; sembrando en viernes quedan 0 pasteles para el sábado; el resumen tiene tres oraciones y el reporte dice "1 sales". Los casos previos siguen pasando.

- [ ] **Step 3: Corregir las frases en `src/speech/say.ts`**

Reemplaza `lineAdded` y `notFound`:

```typescript
  lineAdded(profile: Profile, ref: OrderRef, line: OrderLine, totalCents: number): string {
    const orderName = say.orderName(profile, ref.order.number);
    const total = `The total is now ${formatMoney(totalCents)}.`;
    if (line.backordered === 0) return `Added ${line.quantity} ${line.name} to ${orderName}. ${total}`;

    const inStock = line.quantity - line.backordered;
    const stock = inStock <= 0 ? 'none were in stock' : `only ${inStock} ${inStock === 1 ? 'was' : 'were'} in stock`;
    return `Added ${line.quantity} ${line.name} to ${orderName}, but ${stock}, `
      + `so ${line.backordered} ${line.backordered === 1 ? 'is' : 'are'} backordered. ${total}`;
  },
```

```typescript
  notFound(profile: Profile, query: string, open: OrderRef[]): string {
    if (open.length === 0) return `I couldn't find "${query}", and there are no open ${profile.nouns.orders} right now.`;
    const names = open.slice(0, 5).map(r => say.orderPhrase(profile, r));
    const which = names.length === 1 ? `The only open one is ${names[0]}.` : `Open ones are ${list(names)}.`;
    return `I couldn't find an open ${profile.nouns.order} for "${query}". ${which}`;
  },
```

- [ ] **Step 4: Resumen y reporte en dos oraciones**

En `src/tools/snapshot.ts`, reemplaza el armado de `text`:

```typescript
      const stages = snapshot.byStage.map(s => `${s.count} ${s.label}`);
      const low = snapshot.low.length;
      const open = stages.length > 0 ? `, with ${say.list(stages)}` : `, with no open ${ctx.profile.nouns.orders}`;
      const stock = low === 0
        ? 'Stock looks fine.'
        : `${low} ${low === 1 ? ctx.profile.nouns.item : ctx.profile.nouns.items} ${low === 1 ? 'is' : 'are'} running low.`;
      const text = `Today you've taken in ${formatMoney(snapshot.todayRevenueCents)}${open}. ${stock}`;
```

En `src/tools/sales-report.ts`, reemplaza desde `const comparison = ...` hasta el `return ok(...)`:

```typescript
      const sales = `${report.count} ${report.count === 1 ? 'sale' : 'sales'}`;
      const first = `${formatMoney(report.totalCents)} from ${sales}, averaging ${formatMoney(report.averageTicketCents)}.`;

      const trend = args.compare !== false && report.prevTotalCents > 0
        ? `That's ${report.totalCents >= report.prevTotalCents ? 'up' : 'down'} from ${formatMoney(report.prevTotalCents)} the period before`
        : '';
      const best = report.topItems[0]?.name;
      // Una sola segunda oración, sea cual sea la combinación.
      const second = trend && best ? ` ${trend}, and the best seller was ${best}.`
        : trend ? ` ${trend}.`
        : best ? ` The best seller was ${best}.`
        : '';

      return ok(first + second, report);
```

- [ ] **Step 5: Buscar en todos los campos del activo**

En `src/domain/resolver.ts`, reemplaza `orderHaystack`:

```typescript
/** Todo el texto por el que se puede nombrar una orden hablando (§7.5). */
export function orderHaystack(ref: OrderRef): string {
  return [
    ref.customer.name, ref.asset?.spokenLabel ?? '',
    ...Object.values(ref.asset?.fields ?? {}).map(String),
    ...Object.values(ref.order.fields), ref.order.description ?? ''
  ].join(' ');
}
```

- [ ] **Step 6: Reservar los ids que usan las tools**

En `src/profiles/load.ts`, agrega arriba de `parseProfile`:

```typescript
/** Propiedades que la tool de abrir orden ya usa; un campo propio con ese id la pisaría en silencio. */
const RESERVED_FIELD_IDS = new Set(['customerName', 'customerPhone', 'description', 'asset', 'due']);
```

y dentro de `parseProfile`, antes del `return p;`:

```typescript
  for (const f of p.orderFields) {
    if (RESERVED_FIELD_IDS.has(f.id)) throw new Error(`orderFields usa el id reservado "${f.id}"`);
  }
```

- [ ] **Step 7: Fijar los vencimientos de la pastelería a días de la semana**

En `seed/run.ts`, agrega `resolveDue` al import de `../src/domain/dates.js`:

```typescript
import { businessToday, resolveDue, shiftDays } from '../src/domain/dates.js';
```

Reemplaza la constante `CAKES` (el cuarto elemento pasa de días relativos a un día de la semana, y ninguno salvo los tres del sábado coincide con otro):

```typescript
// Vencimientos por día de la semana: "tres para el sábado" es cierto siembres el día que siembres.
const CAKES: Array<[string, Record<string, string>, string, string]> = [
  ['Grace Kim', { flavor: 'vanilla', size: '8-inch', inscription: 'Happy Birthday' }, 'ordered', 'wednesday'],
  ['Luis Romero', { flavor: 'chocolate', size: '10-inch' }, 'ordered', 'saturday'],
  ['Emma Wright', { flavor: 'red velvet', size: '10-inch', inscription: 'Congrats' }, 'baking', 'saturday'],
  ['Jonas Meyer', { flavor: 'carrot', size: '8-inch' }, 'decorating', 'saturday'],
  ['Ada Silva', { flavor: 'lemon', size: '8-inch' }, 'ready', 'thursday'],
  ['Ben Haddad', { flavor: 'chocolate', size: '10-inch', inscription: 'Thank You' }, 'ready', 'monday']
];
```

En `seedBakery`, reemplaza la desestructuración y el cálculo de `due`:

```typescript
  for (const [name, fields, stage, dueWeekday] of CAKES) {
```

```typescript
    const due = resolveDue(dueWeekday, BAKERY.timezone, now)!;
```

Borra la constante `DAY_MS` si ya no la usa nadie en el archivo.

- [ ] **Step 8: Correr todo y verificar**

Run: `npx vitest run`
Expected: PASS en todo.

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 9: Commit**

```bash
git add src seed test
git commit -m "fix: tighten spoken summaries and pin demo seed dates to weekdays"
```

---

## Task 3: `DynamoStore` y suite de contrato

**Files:**
- Create: `src/store/dynamo.ts`, `src/store/table.ts`, `test/contract/store-contract.ts`, `test/integration/dynamo-store.test.ts`
- Modify: `test/unit/memory-store.test.ts` (pasa a usar el contrato), `package.json`
- Test: los dos archivos de prueba anteriores

**Interfaces:**
- Consumes: `Store`, `ConflictError` de `src/store/store.ts`; tipos del dominio (con `Payment.paidOn` de la Task 1).
- Produces:

```typescript
export function dynamoClient(opts: { region: string; endpoint?: string }): DynamoDBClient
export class DynamoStore implements Store { constructor(client: DynamoDBClient, table: string) }
export async function ensureTable(client: DynamoDBClient, table: string): Promise<void>   // idempotente, espera a que exista
export async function dropTable(client: DynamoDBClient, table: string): Promise<void>     // idempotente
export function runStoreContract(name: string, makeStore: () => Promise<Store>): void
```

- [ ] **Step 1: Instalar dependencias y agregar scripts**

```bash
npm i @aws-sdk/client-dynamodb@^3.1133.0 @aws-sdk/lib-dynamodb@^3.1133.0
npm i -D cross-env
npm pkg set scripts.dynamo:up="docker run -d --rm --name counterpart-dynamo -p 8000:8000 amazon/dynamodb-local"
npm pkg set scripts.dynamo:down="docker stop counterpart-dynamo"
npm pkg set scripts.test:dynamo="cross-env DYNAMODB_ENDPOINT=http://localhost:8000 vitest run test/integration/dynamo-store.test.ts"
```

- [ ] **Step 2: Escribir la suite de contrato**

`test/contract/store-contract.ts` (no termina en `.test.ts`: la importan los archivos de prueba). Los cinco casos que hoy viven en `memory-store.test.ts`, más el de fecha civil de la Task 1, se mudan aquí sin cambiar sus aserciones; el `void` del arranque pasa a `await`.

```typescript
import { describe, expect, it } from 'vitest';
import { ConflictError, type Store } from '../../src/store/store.js';
import type { Business, CatalogItem, Order, Payment, PurchaseOrder } from '../../src/domain/types.js';

const biz: Business = {
  id: 'b1', name: 'Oak Street Auto', profileId: 'auto-repair',
  timezone: 'America/Chicago', taxRateBps: 825, nextOrderNumber: 41, version: 1
};

const order: Order = {
  id: 'o1', number: 41, customerId: 'c1', stage: 'in_bay', fields: {}, lines: [],
  subtotalCents: 0, taxCents: 0, totalCents: 0, stageHistory: [],
  createdAt: '2026-09-15T15:00:00.000Z', version: 1
};

const item: CatalogItem = {
  id: 'i1', name: 'Wheel', synonyms: [], kind: 'part', unit: 'ea', priceCents: 5000,
  taxable: true, stocked: true, onHand: 10, reorderPoint: 3, reorderQty: 5, consumes: {}, version: 1
};

const payment = (id: string, paidOn: string, paidAt = `${paidOn}T18:00:00.000Z`): Payment => ({
  id, orderId: 'o1', amountCents: 1000, method: 'cash', paidAt, paidOn
});

/** Lo que cualquier implementación de Store tiene que cumplir. La corren MemoryStore y DynamoStore. */
export function runStoreContract(name: string, makeStore: () => Promise<Store>): void {
  describe(`contrato de Store: ${name}`, () => {
    async function ready(): Promise<Store> {
      const store = await makeStore();
      await store.putBusiness(biz);
      await store.putToken('hash-abc', 'b1');
      return store;
    }

    it('encuentra el negocio por hash de token', async () => {
      const store = await ready();
      expect((await store.getBusinessByTokenHash('hash-abc'))?.id).toBe('b1');
      expect(await store.getBusinessByTokenHash('otro')).toBeNull();
    });

    it('devuelve null para un negocio que no existe', async () => {
      const store = await ready();
      expect(await store.getBusiness('nadie')).toBeNull();
    });

    it('entrega números de orden consecutivos', async () => {
      const store = await ready();
      expect(await store.takeOrderNumber('b1')).toBe(41);
      expect(await store.takeOrderNumber('b1')).toBe(42);
    });

    it('no entrega números de orden para un negocio desconocido', async () => {
      const store = await ready();
      await expect(store.takeOrderNumber('nadie')).rejects.toThrow();
    });

    it('sube la versión al guardar y rechaza versiones viejas', async () => {
      const store = await ready();
      await store.putOrder('b1', order);
      expect((await store.getOrder('b1', 'o1'))?.version).toBe(2);
      await expect(store.putOrder('b1', order)).rejects.toBeInstanceOf(ConflictError);
    });

    it('devuelve copias, no referencias', async () => {
      const store = await ready();
      await store.putOrder('b1', order);
      const first = await store.getOrder('b1', 'o1');
      first!.stage = 'mutado';
      expect((await store.getOrder('b1', 'o1'))?.stage).toBe('in_bay');
    });

    it('guarda y lista clientes y activos', async () => {
      const store = await ready();
      await store.putCustomer('b1', { id: 'c1', name: 'Dana Lee', nameNormalized: 'dana lee' });
      await store.putAsset('b1', { id: 'a1', customerId: 'c1', fields: { year: 2019 }, spokenLabel: '2019 Honda Civic' });
      expect((await store.listCustomers('b1')).map(c => c.name)).toEqual(['Dana Lee']);
      expect((await store.listAssets('b1'))[0]).toEqual({
        id: 'a1', customerId: 'c1', fields: { year: 2019 }, spokenLabel: '2019 Honda Civic'
      });
    });

    it('filtra cobros por rango de fechas inclusivo', async () => {
      const store = await ready();
      await store.commitClose('b1', { ...order, version: 1 }, payment('p1', '2026-09-15'));
      expect(await store.listPayments('b1', '2026-09-15', '2026-09-15')).toHaveLength(1);
      expect(await store.listPayments('b1', '2026-09-16', '2026-09-20')).toHaveLength(0);
    });

    it('filtra cobros por fecha civil, no por el día UTC del instante', async () => {
      const store = await ready();
      await store.commitClose('b1', { ...order, version: 1 }, payment('p9', '2026-09-15', '2026-09-16T01:30:00.000Z'));
      expect(await store.listPayments('b1', '2026-09-15', '2026-09-15')).toHaveLength(1);
      expect(await store.listPayments('b1', '2026-09-16', '2026-09-16')).toHaveLength(0);
    });

    it('commitClose con versión vieja no registra el cobro', async () => {
      const store = await ready();
      await store.putOrder('b1', order);
      await expect(store.commitClose('b1', { ...order, version: 1 }, payment('p2', '2026-09-15')))
        .rejects.toBeInstanceOf(ConflictError);
      expect(await store.listPayments('b1', '2026-09-01', '2026-09-30')).toHaveLength(0);
    });

    it('commitOrderWithItems es atómico: rechaza si hay conflicto sin escribir nada', async () => {
      const store = await ready();
      await store.putOrder('b1', order);
      await store.putItems('b1', [item]);
      const itemBefore = (await store.listItems('b1'))[0];

      await expect(
        store.commitOrderWithItems('b1', { ...order, version: 1 }, [{ ...item, version: 2 }])
      ).rejects.toBeInstanceOf(ConflictError);

      expect((await store.listItems('b1'))[0]).toEqual(itemBefore);
    });

    it('putItems es todo o nada', async () => {
      const store = await ready();
      await store.putItems('b1', [item]);
      const fresh: CatalogItem = { ...item, id: 'i2', name: 'Tire' };
      await expect(store.putItems('b1', [fresh, { ...item, version: 1 }])).rejects.toBeInstanceOf(ConflictError);
      expect((await store.listItems('b1')).map(i => i.id)).toEqual(['i1']);
    });

    it('lista solo las órdenes de compra abiertas', async () => {
      const store = await ready();
      const po = (id: string, status: PurchaseOrder['status']): PurchaseOrder => ({
        id, supplierId: 's1', lines: [{ itemId: 'i1', qty: 5 }], status, createdAt: '2026-09-15T15:00:00.000Z'
      });
      await store.putPurchaseOrders('b1', [po('po1', 'open'), po('po2', 'received')]);
      expect((await store.listOpenPurchaseOrders('b1')).map(p => p.id)).toEqual(['po1']);
    });
  });
}
```

- [ ] **Step 3: Pasar `MemoryStore` a la suite de contrato**

Reemplaza el contenido completo de `test/unit/memory-store.test.ts`:

```typescript
import { runStoreContract } from '../contract/store-contract.js';
import { MemoryStore } from '../../src/store/memory.js';

runStoreContract('MemoryStore', async () => new MemoryStore());
```

Run: `npx vitest run test/unit/memory-store.test.ts`
Expected: PASS. Si algún caso nuevo falla contra `MemoryStore`, es un defecto de `MemoryStore`: corrígelo ahí y dilo en el reporte.

- [ ] **Step 4: Escribir la prueba de `DynamoStore` y verificar que falla**

`test/integration/dynamo-store.test.ts`:

```typescript
import { randomUUID } from 'node:crypto';
import { afterAll, describe } from 'vitest';
import { runStoreContract } from '../contract/store-contract.js';
import { DynamoStore, dynamoClient } from '../../src/store/dynamo.js';
import { dropTable, ensureTable } from '../../src/store/table.js';

const endpoint = process.env.DYNAMODB_ENDPOINT;

describe.skipIf(!endpoint)('DynamoStore contra DynamoDB Local', () => {
  const client = dynamoClient({ region: 'us-east-1', endpoint });
  const tables: string[] = [];

  afterAll(async () => {
    for (const table of tables) await dropTable(client, table);
  });

  runStoreContract('DynamoStore', async () => {
    const table = `counterpart-test-${randomUUID()}`;
    tables.push(table);
    await ensureTable(client, table);
    return new DynamoStore(client, table);
  });
});
```

Run: `npm run dynamo:up`, luego `npm run test:dynamo`
Expected: FAIL — no existen `src/store/dynamo.ts` ni `src/store/table.ts`.

- [ ] **Step 5: Implementar `src/store/table.ts`**

```typescript
import {
  CreateTableCommand, DeleteTableCommand, DynamoDBClient,
  ResourceInUseException, ResourceNotFoundException, waitUntilTableExists
} from '@aws-sdk/client-dynamodb';

/** Crea la tabla única si no existe y espera a que esté activa. */
export async function ensureTable(client: DynamoDBClient, table: string): Promise<void> {
  try {
    await client.send(new CreateTableCommand({
      TableName: table,
      BillingMode: 'PAY_PER_REQUEST',
      AttributeDefinitions: [
        { AttributeName: 'pk', AttributeType: 'S' },
        { AttributeName: 'sk', AttributeType: 'S' }
      ],
      KeySchema: [
        { AttributeName: 'pk', KeyType: 'HASH' },
        { AttributeName: 'sk', KeyType: 'RANGE' }
      ]
    }));
  } catch (err) {
    if (!(err instanceof ResourceInUseException)) throw err;
  }
  await waitUntilTableExists({ client, maxWaitTime: 60 }, { TableName: table });
}

export async function dropTable(client: DynamoDBClient, table: string): Promise<void> {
  try {
    await client.send(new DeleteTableCommand({ TableName: table }));
  } catch (err) {
    if (!(err instanceof ResourceNotFoundException)) throw err;
  }
}
```

- [ ] **Step 6: Implementar `src/store/dynamo.ts`**

```typescript
import {
  ConditionalCheckFailedException, DynamoDBClient, TransactionCanceledException
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, TransactWriteCommand, UpdateCommand,
  type QueryCommandInput
} from '@aws-sdk/lib-dynamodb';
import type { Asset, Business, CatalogItem, Customer, Order, Payment, PurchaseOrder } from '../domain/types.js';
import { ConflictError, type Store } from './store.js';

type Row = Record<string, unknown>;

const bizKey = (bizId: string): string => `BIZ#${bizId}`;
const TRANSACTION_LIMIT = 100;

/** Cliente de DynamoDB. Con `endpoint` apunta a DynamoDB Local y usa credenciales de mentira. */
export function dynamoClient(opts: { region: string; endpoint?: string }): DynamoDBClient {
  return new DynamoDBClient({
    region: opts.region,
    ...(opts.endpoint
      ? { endpoint: opts.endpoint, credentials: { accessKeyId: 'local', secretAccessKey: 'local' } }
      : {})
  });
}

/** Quita las llaves de la tabla para devolver la entidad tal como la usa el dominio. */
function strip<T>(row: Row): T {
  const { pk: _pk, sk: _sk, ...entity } = row;
  return entity as T;
}

function isConditionFailure(err: unknown): boolean {
  if (err instanceof ConditionalCheckFailedException) return true;
  if (err instanceof TransactionCanceledException) {
    return (err.CancellationReasons ?? []).some(r => r.Code === 'ConditionalCheckFailed');
  }
  return false;
}

export class DynamoStore implements Store {
  private readonly doc: DynamoDBDocumentClient;

  constructor(client: DynamoDBClient, private readonly table: string) {
    this.doc = DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } });
  }

  /** Put con la regla de versiones del contrato: crear siempre, actualizar solo si la versión coincide. */
  private versionedPut(pk: string, sk: string, entity: { version: number }) {
    return {
      TableName: this.table,
      Item: { ...entity, pk, sk, version: entity.version + 1 },
      ConditionExpression: 'attribute_not_exists(pk) OR #version = :expected',
      ExpressionAttributeNames: { '#version': 'version' },
      ExpressionAttributeValues: { ':expected': entity.version }
    };
  }

  private async guarded(what: string, run: () => Promise<unknown>): Promise<void> {
    try {
      await run();
    } catch (err) {
      if (isConditionFailure(err)) throw new ConflictError(what);
      throw err;
    }
  }

  private async get<T>(pk: string, sk: string): Promise<T | null> {
    const out = await this.doc.send(new GetCommand({ TableName: this.table, Key: { pk, sk }, ConsistentRead: true }));
    return out.Item ? strip<T>(out.Item) : null;
  }

  private async queryAll<T>(input: Omit<QueryCommandInput, 'TableName' | 'ExclusiveStartKey'>): Promise<T[]> {
    const rows: T[] = [];
    let start: Record<string, unknown> | undefined;
    do {
      const out = await this.doc.send(new QueryCommand({
        ...input, TableName: this.table, ConsistentRead: true, ExclusiveStartKey: start
      }));
      for (const item of out.Items ?? []) rows.push(strip<T>(item));
      start = out.LastEvaluatedKey;
    } while (start);
    return rows;
  }

  private byPrefix<T>(bizId: string, prefix: string): Promise<T[]> {
    return this.queryAll<T>({
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
      ExpressionAttributeValues: { ':pk': bizKey(bizId), ':prefix': prefix }
    });
  }

  private async put(pk: string, sk: string, entity: object): Promise<void> {
    await this.doc.send(new PutCommand({ TableName: this.table, Item: { ...entity, pk, sk } }));
  }

  async putBusiness(b: Business): Promise<void> {
    await this.guarded('business', () => this.doc.send(new PutCommand(this.versionedPut(bizKey(b.id), 'META', b))));
  }

  getBusiness(bizId: string): Promise<Business | null> {
    return this.get<Business>(bizKey(bizId), 'META');
  }

  async putToken(tokenHash: string, bizId: string): Promise<void> {
    await this.put(`TOKEN#${tokenHash}`, 'TOKEN', { businessId: bizId });
  }

  async getBusinessByTokenHash(tokenHash: string): Promise<Business | null> {
    const token = await this.get<{ businessId: string }>(`TOKEN#${tokenHash}`, 'TOKEN');
    return token ? this.getBusiness(token.businessId) : null;
  }

  async takeOrderNumber(bizId: string): Promise<number> {
    try {
      const out = await this.doc.send(new UpdateCommand({
        TableName: this.table,
        Key: { pk: bizKey(bizId), sk: 'META' },
        UpdateExpression: 'SET nextOrderNumber = nextOrderNumber + :one, #version = #version + :one',
        ConditionExpression: 'attribute_exists(pk)',
        ExpressionAttributeNames: { '#version': 'version' },
        ExpressionAttributeValues: { ':one': 1 },
        ReturnValues: 'UPDATED_OLD'
      }));
      return out.Attributes!.nextOrderNumber as number;
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) throw new Error(`negocio desconocido: ${bizId}`);
      throw err;
    }
  }

  listCustomers(bizId: string): Promise<Customer[]> { return this.byPrefix<Customer>(bizId, 'CUST#'); }
  putCustomer(bizId: string, c: Customer): Promise<void> { return this.put(bizKey(bizId), `CUST#${c.id}`, c); }
  listAssets(bizId: string): Promise<Asset[]> { return this.byPrefix<Asset>(bizId, 'ASSET#'); }
  putAsset(bizId: string, a: Asset): Promise<void> { return this.put(bizKey(bizId), `ASSET#${a.id}`, a); }
  listOrders(bizId: string): Promise<Order[]> { return this.byPrefix<Order>(bizId, 'ORD#'); }
  getOrder(bizId: string, orderId: string): Promise<Order | null> { return this.get<Order>(bizKey(bizId), `ORD#${orderId}`); }
  listItems(bizId: string): Promise<CatalogItem[]> { return this.byPrefix<CatalogItem>(bizId, 'ITEM#'); }

  async putOrder(bizId: string, o: Order): Promise<void> {
    await this.guarded(`order ${o.id}`, () =>
      this.doc.send(new PutCommand(this.versionedPut(bizKey(bizId), `ORD#${o.id}`, o))));
  }

  async putItems(bizId: string, items: CatalogItem[]): Promise<void> {
    if (items.length === 0) return;
    if (items.length > TRANSACTION_LIMIT) throw new Error(`putItems admite hasta ${TRANSACTION_LIMIT} ítems por llamada`);
    await this.guarded('items', () => this.doc.send(new TransactWriteCommand({
      TransactItems: items.map(i => ({ Put: this.versionedPut(bizKey(bizId), `ITEM#${i.id}`, i) }))
    })));
  }

  async commitOrderWithItems(bizId: string, order: Order, items: CatalogItem[]): Promise<void> {
    if (items.length + 1 > TRANSACTION_LIMIT) throw new Error('demasiados ítems para una sola transacción');
    // Una transacción: DynamoDB valida todas las condiciones antes de escribir cualquier registro.
    await this.guarded(`order ${order.id}`, () => this.doc.send(new TransactWriteCommand({
      TransactItems: [
        ...items.map(i => ({ Put: this.versionedPut(bizKey(bizId), `ITEM#${i.id}`, i) })),
        { Put: this.versionedPut(bizKey(bizId), `ORD#${order.id}`, order) }
      ]
    })));
  }

  async commitClose(bizId: string, order: Order, payment: Payment): Promise<void> {
    await this.guarded(`order ${order.id}`, () => this.doc.send(new TransactWriteCommand({
      TransactItems: [
        { Put: this.versionedPut(bizKey(bizId), `ORD#${order.id}`, order) },
        {
          Put: {
            TableName: this.table,
            Item: { ...payment, pk: bizKey(bizId), sk: `PAY#${payment.paidOn}#${payment.id}` }
          }
        }
      ]
    })));
  }

  listPayments(bizId: string, from: string, to: string): Promise<Payment[]> {
    // '~' ordena después de '#' y de los dígitos: cubre todos los cobros del último día.
    return this.queryAll<Payment>({
      KeyConditionExpression: 'pk = :pk AND sk BETWEEN :from AND :to',
      ExpressionAttributeValues: { ':pk': bizKey(bizId), ':from': `PAY#${from}`, ':to': `PAY#${to}~` }
    });
  }

  async listOpenPurchaseOrders(bizId: string): Promise<PurchaseOrder[]> {
    return (await this.byPrefix<PurchaseOrder>(bizId, 'PO#')).filter(po => po.status === 'open');
  }

  async putPurchaseOrders(bizId: string, pos: PurchaseOrder[]): Promise<void> {
    for (const po of pos) await this.put(bizKey(bizId), `PO#${po.id}`, po);
  }
}
```

- [ ] **Step 7: Correr el contrato contra DynamoDB Local**

Run: `npm run test:dynamo`
Expected: PASS en los 13 casos del contrato, y el encabezado de la corrida dice `DynamoStore contra DynamoDB Local` sin la marca de omitido. Si ves la suite omitida, `DYNAMODB_ENDPOINT` no llegó: revisa el script antes de seguir.

Run: `npx vitest run`
Expected: PASS; la suite de DynamoDB aparece como omitida (no hay variable) y el resto pasa.

Run: `npm run dynamo:down`

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/store test
git commit -m "feat: add DynamoDB store behind a shared store contract"
```

---

## Task 4: Selección de store, siembra y tokens

**Files:**
- Create: `src/store/from-env.ts`, `seed/cli.ts`, `infra/create-token.ts`, `test/unit/from-env.test.ts`
- Modify: `src/index.ts`, `seed/run.ts` (opción `demoTokens`), `tsconfig.json` (incluye `infra`), `package.json`, `test/integration/seed.test.ts`

**Interfaces:**
- Consumes: `DynamoStore`, `dynamoClient`, `ensureTable`, `dropTable` (Task 3); `MemoryStore`; `hashToken`; `seedAll`, `DEMO_TOKENS`.
- Produces:

```typescript
export interface StoreConfig { kind: 'memory' | 'dynamo'; table: string; region: string; endpoint?: string }
export function storeConfig(env: NodeJS.ProcessEnv): StoreConfig
export function openStore(cfg: StoreConfig): { store: Store; client?: DynamoDBClient }
export async function seedAll(store: Store, now?: Date, opts?: { demoTokens?: boolean }): Promise<void>  // demoTokens por defecto true
```

- Variables de entorno: `COUNTERPART_STORE` (`memory` por defecto, o `dynamo`), `DYNAMODB_TABLE` (`counterpart`), `AWS_REGION` (`us-east-1`), `DYNAMODB_ENDPOINT` (solo para DynamoDB Local). Una cadena vacía cuenta como no definida.

**Reglas de seguridad de las CLIs:**
- `npm run seed` borra y recrea la tabla, así que exige `--reset`. Sin `DYNAMODB_ENDPOINT` (es decir, apuntando a AWS) además exige `COUNTERPART_ALLOW_REMOTE_RESET=1`.
- Contra AWS la siembra **no** instala los tokens de demo, que son públicos en el repo. Contra DynamoDB Local sí los instala.
- `npm run token` imprime el token por stdout una sola vez; en la tabla queda solo su hash.

- [ ] **Step 1: Escribir las pruebas que fallan**

`test/unit/from-env.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { storeConfig } from '../../src/store/from-env.js';

describe('configuración del store', () => {
  it('usa memoria por defecto', () => {
    expect(storeConfig({})).toEqual({ kind: 'memory', table: 'counterpart', region: 'us-east-1', endpoint: undefined });
  });

  it('lee la configuración de DynamoDB', () => {
    expect(storeConfig({
      COUNTERPART_STORE: 'dynamo', DYNAMODB_TABLE: 'demo', AWS_REGION: 'us-west-2', DYNAMODB_ENDPOINT: 'http://localhost:8000'
    })).toEqual({ kind: 'dynamo', table: 'demo', region: 'us-west-2', endpoint: 'http://localhost:8000' });
  });

  it('trata las cadenas vacías como no definidas', () => {
    expect(storeConfig({ COUNTERPART_STORE: 'dynamo', DYNAMODB_TABLE: '', DYNAMODB_ENDPOINT: '' }))
      .toEqual({ kind: 'dynamo', table: 'counterpart', region: 'us-east-1', endpoint: undefined });
  });

  it('rechaza un tipo de store desconocido', () => {
    expect(() => storeConfig({ COUNTERPART_STORE: 'postgres' })).toThrow(/COUNTERPART_STORE/);
  });
});
```

Agrega a `test/integration/seed.test.ts` (importa `hashToken` de `../../src/http/auth.js` y `DEMO_TOKENS` de `../../seed/run.js`):

```typescript
describe('tokens de demo', () => {
  it('se instalan por defecto', async () => {
    const store = new MemoryStore();
    await seedAll(store, new Date('2026-09-15T15:00:00Z'));
    expect((await store.getBusinessByTokenHash(hashToken(DEMO_TOKENS.shop)))?.id).toBe('shop');
  });

  it('se pueden omitir', async () => {
    const store = new MemoryStore();
    await seedAll(store, new Date('2026-09-15T15:00:00Z'), { demoTokens: false });
    expect(await store.getBusinessByTokenHash(hashToken(DEMO_TOKENS.shop))).toBeNull();
    expect(await store.getBusinessByTokenHash(hashToken(DEMO_TOKENS.bakery))).toBeNull();
  });
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npx vitest run test/unit/from-env.test.ts test/integration/seed.test.ts`
Expected: FAIL — no existe `from-env.ts`, y `seedAll` ignora el tercer argumento.

- [ ] **Step 3: Implementar `src/store/from-env.ts`**

```typescript
import type { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoStore, dynamoClient } from './dynamo.js';
import { MemoryStore } from './memory.js';
import type { Store } from './store.js';

export interface StoreConfig { kind: 'memory' | 'dynamo'; table: string; region: string; endpoint?: string }

export function storeConfig(env: NodeJS.ProcessEnv): StoreConfig {
  const kind = env.COUNTERPART_STORE || 'memory';
  if (kind !== 'memory' && kind !== 'dynamo') {
    throw new Error(`COUNTERPART_STORE debe ser "memory" o "dynamo", no "${kind}"`);
  }
  return {
    kind,
    table: env.DYNAMODB_TABLE || 'counterpart',
    region: env.AWS_REGION || 'us-east-1',
    endpoint: env.DYNAMODB_ENDPOINT || undefined
  };
}

/** Abre el store configurado. Con DynamoDB devuelve también el cliente, para operar sobre la tabla. */
export function openStore(cfg: StoreConfig): { store: Store; client?: DynamoDBClient } {
  if (cfg.kind === 'memory') return { store: new MemoryStore() };
  const client = dynamoClient({ region: cfg.region, endpoint: cfg.endpoint });
  return { store: new DynamoStore(client, cfg.table), client };
}
```

- [ ] **Step 4: Opción `demoTokens` en la semilla**

En `seed/run.ts`, cambia `seedAll` y las dos funciones que instalan tokens:

```typescript
/** Siembra los dos negocios del demo. Determinista: la misma corrida produce los mismos datos. */
export async function seedAll(
  store: Store, now: Date = new Date(), opts: { demoTokens?: boolean } = {}
): Promise<void> {
  const demoTokens = opts.demoTokens ?? true;
  await seedShop(store, now, demoTokens);
  await seedBakery(store, now, demoTokens);
}
```

```typescript
async function seedShop(store: Store, now: Date, demoTokens: boolean): Promise<void> {
  await store.putBusiness(SHOP);
  if (demoTokens) await store.putToken(hashToken(DEMO_TOKENS.shop), SHOP.id);
```

```typescript
async function seedBakery(store: Store, now: Date, demoTokens: boolean): Promise<void> {
  await store.putBusiness(BAKERY);
  if (demoTokens) await store.putToken(hashToken(DEMO_TOKENS.bakery), BAKERY.id);
```

- [ ] **Step 5: Arranque según el store**

Reemplaza `src/index.ts`:

```typescript
import { createApp } from './http/app.js';
import type { Sessions } from './http/sessions.js';
import { openStore, storeConfig } from './store/from-env.js';
import { ensureTable } from './store/table.js';
import { seedAll } from '../seed/run.js';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';
const devBusinessId = process.env.COUNTERPART_DEV_BUSINESS;

const cfg = storeConfig(process.env);
const { store, client } = openStore(cfg);

if (cfg.kind === 'memory') {
  // En memoria nada persiste: el demo se siembra en cada arranque.
  await seedAll(store);
} else if (cfg.endpoint && client) {
  // Contra DynamoDB Local la tabla puede no existir todavía. En AWS la crea la infraestructura.
  await ensureTable(client, cfg.table);
}

const app = createApp({ store, host, devBusinessId });
const httpServer = app.listen(port, host, () => {
  console.log(JSON.stringify({ msg: 'listening', port, host, store: cfg.kind }));
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    (app.locals.sessions as Sessions).closeAll();
    httpServer.close(() => process.exit(0));
  });
}
```

- [ ] **Step 6: CLI de siembra**

`seed/cli.ts`:

```typescript
import { openStore, storeConfig } from '../src/store/from-env.js';
import { dropTable, ensureTable } from '../src/store/table.js';
import { DEMO_TOKENS, seedAll } from './run.js';

// Uso: npm run seed -- --reset   (con COUNTERPART_STORE=dynamo)
const cfg = storeConfig(process.env);
const local = cfg.endpoint !== undefined;

if (cfg.kind !== 'dynamo') {
  console.error('Con el store en memoria la siembra ocurre al arrancar el servidor. Esta CLI es para COUNTERPART_STORE=dynamo.');
  process.exit(1);
}
if (!process.argv.includes('--reset')) {
  console.error(`Esta CLI borra y recrea la tabla "${cfg.table}". Repite con --reset para confirmarlo.`);
  process.exit(1);
}
if (!local && process.env.COUNTERPART_ALLOW_REMOTE_RESET !== '1') {
  console.error('Sin DYNAMODB_ENDPOINT esto apunta a AWS. Para borrar una tabla remota define COUNTERPART_ALLOW_REMOTE_RESET=1.');
  process.exit(1);
}

const { store, client } = openStore(cfg);
await dropTable(client!, cfg.table);
await ensureTable(client!, cfg.table);
// Los tokens de demo son públicos en el repo: solo se instalan en DynamoDB Local.
await seedAll(store, new Date(), { demoTokens: local });

console.log(`Tabla "${cfg.table}" sembrada con los negocios "shop" y "bakery".`);
if (local) console.log(`Tokens de demo: shop=${DEMO_TOKENS.shop} bakery=${DEMO_TOKENS.bakery}`);
else console.log('Sin tokens de demo. Emite uno por negocio con: npm run token -- <businessId>');
```

- [ ] **Step 7: CLI de tokens**

`infra/create-token.ts`:

```typescript
import { randomBytes } from 'node:crypto';
import { hashToken } from '../src/http/auth.js';
import { openStore, storeConfig } from '../src/store/from-env.js';

// Uso: npm run token -- <businessId>   (con COUNTERPART_STORE=dynamo)
const bizId = process.argv[2];
if (!bizId) {
  console.error('Uso: npm run token -- <businessId>');
  process.exit(1);
}

const cfg = storeConfig(process.env);
if (cfg.kind !== 'dynamo') {
  console.error('Un token solo sirve si queda guardado: usa COUNTERPART_STORE=dynamo.');
  process.exit(1);
}

const { store } = openStore(cfg);
if (!(await store.getBusiness(bizId))) {
  console.error(`No existe el negocio "${bizId}" en la tabla "${cfg.table}".`);
  process.exit(1);
}

const token = randomBytes(32).toString('base64url');
await store.putToken(hashToken(token), bizId);
// El token va solo a stdout, para poder redirigirlo; el aviso va a stderr.
console.log(token);
console.error(`Token emitido para "${bizId}". Guárdalo ahora: en la tabla solo queda su hash.`);
```

- [ ] **Step 8: Scripts y alcance del chequeo de tipos**

```bash
npm pkg set scripts.seed="tsx seed/cli.ts"
npm pkg set scripts.token="tsx infra/create-token.ts"
npm pkg set scripts.typecheck="tsc -p tsconfig.json --noEmit"
```

En `tsconfig.json`, cambia `"include"` a `["src", "seed", "test", "infra"]`. (`infra/copy-assets.mjs` es JavaScript y `tsc` lo ignora.)

- [ ] **Step 9: Correr las pruebas**

Run: `npx vitest run`
Expected: PASS en todo.

Run: `npm run typecheck` y `npm run build`
Expected: exit 0 en ambos.

- [ ] **Step 10: Verificar las CLIs contra DynamoDB Local**

```bash
npm run dynamo:up
npx cross-env COUNTERPART_STORE=dynamo DYNAMODB_ENDPOINT=http://localhost:8000 npm run seed
npx cross-env COUNTERPART_STORE=dynamo DYNAMODB_ENDPOINT=http://localhost:8000 npm run seed -- --reset
npx cross-env COUNTERPART_STORE=dynamo DYNAMODB_ENDPOINT=http://localhost:8000 npm run token -- shop
npx cross-env COUNTERPART_STORE=dynamo DYNAMODB_ENDPOINT=http://localhost:8000 npm run token -- nadie
```

Expected, en orden: la primera siembra se niega y pide `--reset` (exit 1); la segunda siembra y muestra los tokens de demo; `token -- shop` imprime una cadena base64url de 43 caracteres; `token -- nadie` falla con "No existe el negocio" (exit 1).

Después levanta el servidor contra la tabla sembrada y confirma que responde, en otra terminal:

```bash
npx cross-env COUNTERPART_STORE=dynamo DYNAMODB_ENDPOINT=http://localhost:8000 PORT=45991 npm run dev
curl -sS http://127.0.0.1:45991/ping
```

Expected: `ok`, y la línea de arranque dice `"store":"dynamo"`. Detén el servidor y corre `npm run dynamo:down`. Anota las salidas en el reporte.

- [ ] **Step 11: Commit**

```bash
git add package.json tsconfig.json src seed infra test
git commit -m "feat: choose the store from the environment and add seed and token CLIs"
```

---

## Task 5: Logs estructurados (§7.10)

**Files:**
- Create: `src/log.ts`, `src/http/request-context.ts`, `src/tools/instrument.ts`, `test/unit/log.test.ts`, `test/integration/logging.test.ts`
- Modify: `src/http/app.ts`, `src/http/sessions.ts`, `src/tools/context.ts`, `src/index.ts`

**Interfaces:**
- Consumes: `ToolContext`, `ToolResult`, `fail`, `guard` (context.ts); `createApp`; `seedAll`, `DEMO_TOKENS`.
- Produces:

```typescript
export interface LogEvent { level: 'info' | 'error'; msg: string; [key: string]: unknown }
export function log(event: LogEvent): void
export function captureLogs(): { lines: () => Array<Record<string, unknown>>; restore: () => void }
export interface RequestContext { requestId: string; businessId?: string; sessionId?: string }
export function withRequest<T>(ctx: RequestContext, run: () => T): T
export function currentRequest(): RequestContext | undefined
export const internalResults: WeakSet<object>
export function instrument(server: McpServer, ctx: ToolContext): McpServer
```

**Formato de los eventos:**
- `msg: 'http'` — `requestId`, `method`, `path`, `status`, `businessId`, `sessionId`, `durationMs`. Uno por petición a `/mcp`.
- `msg: 'tool'` — `tool`, `businessId`, `requestId`, `sessionId`, `durationMs`, `outcome` (`ok`, `domain_error` o `internal`). Uno por llamada a una tool.
- `msg: 'internal'` — `level: 'error'`, `code: 'INTERNAL'`, `requestId`, `error`, `stack`.
- `msg: 'session_close_failed'` — `level: 'error'`, `sessionId`, `error`.

**Simplificación consciente:** el spec pide también "código de error". Los errores de dominio salen de `fail()` sin código, así que el log los agrupa como `outcome: 'domain_error'`. Darles código requeriría tocar cada llamada a `fail()` y no cambia nada de lo que se ve en el demo.

- [ ] **Step 1: Escribir las pruebas que fallan**

`test/unit/log.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { captureLogs, log } from '../../src/log.js';

describe('logs', () => {
  it('escribe un objeto JSON por evento, con marca de tiempo', () => {
    const cap = captureLogs();
    try {
      log({ level: 'info', msg: 'hola', n: 1 });
      const [line] = cap.lines();
      expect(line).toMatchObject({ level: 'info', msg: 'hola', n: 1 });
      expect(typeof line!.ts).toBe('string');
    } finally {
      cap.restore();
    }
  });
});
```

`test/integration/logging.test.ts`:

```typescript
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { Client, InMemoryTransport, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { McpServer } from '@modelcontextprotocol/server';
import { createApp } from '../../src/http/app.js';
import { captureLogs } from '../../src/log.js';
import { loadProfile } from '../../src/profiles/load.js';
import { MemoryStore } from '../../src/store/memory.js';
import { registerTools, type ToolContext } from '../../src/tools/context.js';
import { DEMO_TOKENS, seedAll } from '../../seed/run.js';

const NOW = new Date('2026-09-15T15:00:00Z');
const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 25));

let server: Server;
let base: string;

beforeAll(async () => {
  const store = new MemoryStore();
  await seedAll(store, NOW);
  server = createApp({ store, host: '127.0.0.1' }).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', () => resolve()));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
});

afterAll(() => { server.close(); });

async function connectOverHttp(token: string): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
    fetch: (input: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      headers.set('authorization', `Bearer ${token}`);
      return fetch(input, { ...init, headers });
    }
  });
  const client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(transport);
  return client;
}

describe('logs estructurados', () => {
  it('registra la petición y la tool con la misma requestId, y nunca el token', async () => {
    const cap = captureLogs();
    try {
      const client = await connectOverHttp(DEMO_TOKENS.shop);
      await client.callTool({ name: 'get_shop_snapshot', arguments: {} });
      await client.close();
      await settle();

      const lines = cap.lines();
      const tool = lines.find(l => l.msg === 'tool' && l.tool === 'get_shop_snapshot');
      expect(tool).toMatchObject({ level: 'info', businessId: 'shop', outcome: 'ok' });
      expect(typeof tool!.durationMs).toBe('number');

      const http = lines.filter(l => l.msg === 'http');
      expect(http.some(l => l.businessId === 'shop' && typeof l.sessionId === 'string')).toBe(true);
      // La línea de la tool comparte requestId con la petición HTTP que la originó.
      expect(http.map(l => l.requestId)).toContain(tool!.requestId);

      expect(JSON.stringify(lines)).not.toContain(DEMO_TOKENS.shop);
    } finally {
      cap.restore();
    }
  });

  it('una petición sin token queda registrada como 401 y sin negocio', async () => {
    const cap = captureLogs();
    try {
      await fetch(`${base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      await settle();
      const http = cap.lines().find(l => l.msg === 'http');
      expect(http).toMatchObject({ status: 401 });
      expect(http!.businessId).toBeUndefined();
    } finally {
      cap.restore();
    }
  });

  it('una excepción inesperada queda registrada como INTERNAL', async () => {
    class BrokenStore extends MemoryStore {
      override async listItems(): Promise<never> { throw new TypeError('boom'); }
    }
    const store = new BrokenStore();
    await seedAll(store, NOW);
    const business = (await store.getBusiness('shop'))!;
    const ctx: ToolContext = {
      business, profile: loadProfile('auto-repair'), store, now: () => NOW, newId: p => `${p}-1`
    };
    const mcp = new McpServer({ name: 'counterpart', version: '0.1.0' });
    registerTools(mcp, ctx);
    const [clientEnd, serverEnd] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test', version: '1.0.0' });
    await mcp.server.connect(serverEnd);
    await client.connect(clientEnd);

    const cap = captureLogs();
    try {
      await client.callTool({ name: 'get_shop_snapshot', arguments: {} });
      const lines = cap.lines();
      expect(lines.find(l => l.msg === 'internal')).toMatchObject({ level: 'error', code: 'INTERNAL' });
      expect(lines.find(l => l.msg === 'tool')).toMatchObject({ tool: 'get_shop_snapshot', outcome: 'internal' });
    } finally {
      cap.restore();
      await client.close();
    }
  });
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npx vitest run test/unit/log.test.ts test/integration/logging.test.ts`
Expected: FAIL — no existe `src/log.ts`.

- [ ] **Step 3: Implementar `src/log.ts` y `src/http/request-context.ts`**

`src/log.ts`:

```typescript
export interface LogEvent { level: 'info' | 'error'; msg: string; [key: string]: unknown }

type Sink = (line: string) => void;

const stdout: Sink = line => { process.stdout.write(`${line}\n`); };
let sink: Sink = stdout;

/** Una línea JSON por evento en stdout (§7.10). Nunca pases tokens aquí. */
export function log(event: LogEvent): void {
  sink(JSON.stringify({ ts: new Date().toISOString(), ...event }));
}

/** Para pruebas: captura los logs y devuelve cómo restaurar la salida anterior. */
export function captureLogs(): { lines: () => Array<Record<string, unknown>>; restore: () => void } {
  const captured: string[] = [];
  const previous = sink;
  sink = line => { captured.push(line); };
  return {
    lines: () => captured.map(line => JSON.parse(line) as Record<string, unknown>),
    restore: () => { sink = previous; }
  };
}
```

`src/http/request-context.ts`:

```typescript
import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext { requestId: string; businessId?: string; sessionId?: string }

const storage = new AsyncLocalStorage<RequestContext>();

/** Ejecuta `run` con el contexto de la petición disponible para todo lo que llame, incluidas las tools. */
export function withRequest<T>(ctx: RequestContext, run: () => T): T {
  return storage.run(ctx, run);
}

export function currentRequest(): RequestContext | undefined {
  return storage.getStore();
}
```

- [ ] **Step 4: Instrumentar las tools**

`src/tools/instrument.ts`:

```typescript
import type { McpServer } from '@modelcontextprotocol/server';
import { currentRequest } from '../http/request-context.js';
import { log } from '../log.js';
import type { ToolContext, ToolResult } from './context.js';

/** Resultados producidos por la frontera INTERNAL: el log los distingue de un error de negocio. */
export const internalResults = new WeakSet<object>();

type Callback = (...args: unknown[]) => Promise<ToolResult>;
type RegisterTool = (name: string, config: unknown, cb: Callback) => unknown;

/**
 * Proxy sobre McpServer que mide y registra cada llamada a una tool. Las tools y los helpers
 * de MCP Apps lo reciben como si fuera el servidor real; todo lo demás pasa sin cambios.
 */
export function instrument(server: McpServer, ctx: ToolContext): McpServer {
  return new Proxy(server, {
    get(target, prop) {
      if (prop === 'registerTool') {
        const register = (target.registerTool as unknown as RegisterTool).bind(target);
        return (name: string, config: unknown, cb: Callback) => register(name, config, timed(name, ctx, cb));
      }
      // Sin `receiver`: los getters y métodos corren con el servidor real como `this`,
      // así funcionan aunque la clase use campos privados (#campo).
      const value: unknown = Reflect.get(target, prop);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
}

function timed(tool: string, ctx: ToolContext, cb: Callback): Callback {
  return async (...args) => {
    const started = performance.now();
    const result = await cb(...args);
    const request = currentRequest();
    log({
      level: 'info', msg: 'tool', tool, businessId: ctx.business.id,
      requestId: request?.requestId, sessionId: request?.sessionId,
      durationMs: Math.round(performance.now() - started),
      outcome: internalResults.has(result) ? 'internal' : result.isError ? 'domain_error' : 'ok'
    });
    return result;
  };
}
```

En `src/tools/context.ts`:
- Quita el import de `randomUUID`.
- Agrega:

```typescript
import { currentRequest } from '../http/request-context.js';
import { log } from '../log.js';
import { instrument, internalResults } from './instrument.js';
```

- Reemplaza el `catch` de `guard`:

```typescript
    } catch (err) {
      const failed = fail(INTERNAL_TEXT);
      internalResults.add(failed);
      log({
        level: 'error', msg: 'internal', code: 'INTERNAL',
        requestId: currentRequest()?.requestId,
        error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
        stack: err instanceof Error ? err.stack : undefined
      });
      return failed;
    }
```

- Reemplaza `registerTools`:

```typescript
export function registerTools(server: McpServer, ctx: ToolContext): void {
  const s = instrument(server, ctx);
  registerSnapshot(s, ctx);
  registerFind(s, ctx);
  registerStock(s, ctx);
  registerSalesReport(s, ctx);
  registerOpen(s, ctx);
  registerMove(s, ctx);
  registerAddLine(s, ctx);
  registerReorder(s, ctx);
  registerCloseOut(s, ctx);
}
```

La importación entre `context.ts` e `instrument.ts` es circular solo en tipos (`import type`), así que no hay ciclo en tiempo de ejecución.

- [ ] **Step 5: Contexto y log de cada petición HTTP**

En `src/http/app.ts`, agrega los imports:

```typescript
import { log } from '../log.js';
import { withRequest, type RequestContext } from './request-context.js';
```

y reemplaza el handler de `/mcp` completo por:

```typescript
  app.all('/mcp', (req: Request, res: Response) => {
    const context: RequestContext = { requestId: randomUUID() };
    const started = performance.now();

    res.on('finish', () => {
      const assigned = res.getHeader('mcp-session-id');
      log({
        level: 'info', msg: 'http', requestId: context.requestId,
        method: req.method, path: req.path, status: res.statusCode,
        businessId: context.businessId,
        sessionId: context.sessionId ?? (assigned === undefined ? undefined : String(assigned)),
        durationMs: Math.round(performance.now() - started)
      });
    });

    return withRequest(context, async () => {
      const business = await resolveBusiness(deps, req);
      if (!business) {
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
      context.businessId = business.id;

      const sessionId = req.header('mcp-session-id');
      context.sessionId = sessionId;

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
  });
```

- [ ] **Step 6: Registrar las fallas al cerrar sesiones y el arranque**

En `src/http/sessions.ts`, agrega `import { log } from '../log.js';` y reemplaza las dos líneas de cierre en `drop`:

```typescript
    // try/catch: en pruebas, transport y server pueden ser dobles sin close() real.
    try { entry.transport.close().catch(err => closeFailed(sessionId, err)); } catch { /* doble de prueba */ }
    try { entry.server.close().catch(err => closeFailed(sessionId, err)); } catch { /* doble de prueba */ }
```

y al final del archivo:

```typescript
function closeFailed(sessionId: string, err: unknown): void {
  log({
    level: 'error', msg: 'session_close_failed', sessionId,
    error: err instanceof Error ? err.message : String(err)
  });
}
```

En `src/index.ts`, agrega `import { log } from './log.js';` y reemplaza el `console.log` del arranque:

```typescript
  log({ level: 'info', msg: 'listening', port, host, store: cfg.kind });
```

- [ ] **Step 7: Correr y verificar**

Run: `npx vitest run test/unit/log.test.ts test/integration/logging.test.ts`
Expected: PASS en los 4 casos.

**Si falla únicamente la aserción de correlación** (`toContain(tool!.requestId)`) porque la línea de la tool trae `requestId` indefinido, significa que el SDK procesa la llamada fuera del contexto asíncrono de la petición. No la debilites: reporta `DONE_WITH_CONCERNS` con la salida exacta, para decidir si la correlación se quita del spec.

Run: `npx vitest run`, `npm run typecheck` y `npm run build`
Expected: todo en verde. Ya no debe haber `console.log` ni `console.error` en `src/` fuera de `src/log.ts`; verifícalo con `grep -rn "console\." src`.

- [ ] **Step 8: Commit**

```bash
git add src test
git commit -m "feat: emit structured JSON logs for requests and tool calls"
```

---

## Task 6: UIs de MCP Apps

Dos UIs, una por tool: el resumen del día y el reporte de ventas (§7.9). Son HTML de un solo archivo y reciben los datos por `structuredContent`.

**Files:**
- Create: `ui/vite.config.ts`, `ui/shared/render.ts`, `ui/shared/styles.css`, `ui/snapshot/index.html`, `ui/snapshot/main.ts`, `ui/sales-report/index.html`, `ui/sales-report/main.ts`, `src/tools/ui-assets.ts`, `test/global-setup.ts`, `test/unit/ui-render.test.ts`, `test/integration/mcp-apps.test.ts`
- Modify: `src/tools/snapshot.ts`, `src/tools/sales-report.ts`, `src/tools/context.ts`, `vitest.config.ts`, `package.json`, `.gitignore`

**Interfaces:**
- Consumes: `instrument` (Task 5), las dos tools de lectura existentes.
- Produces:

```typescript
export const UI: { snapshot: 'ui://counterpart/snapshot.html'; salesReport: 'ui://counterpart/sales-report.html' }
export function packageRoot(from?: string): string
export function uiBundlePath(name: 'snapshot' | 'sales-report'): string   // <raíz>/build/ui/<name>/index.html
export function registerUiResources(server: McpServer): void
// ui/shared/render.ts
export function money(cents: number): string            // "$1,234.56": formato visual, con separador de miles
export function escapeHtml(text: string): string
export function snapshotHtml(d: SnapshotView): string
export function salesChartSvg(daily: Array<{ date: string; cents: number }>, width?: number, height?: number): string
export function salesReportHtml(r: SalesReportView): string
```

**Decisiones:**
- La UI no conoce el vocabulario del perfil, así que usa etiquetas neutras ("Open by stage", "Running low"). Así nunca muestra "work order" en la pastelería.
- `ui/shared/render.ts` tiene su propio formateador de dinero en vez de importar `src/domain/money.ts`: el visual lleva separador de miles y el hablado no, y así el bundle no depende de cómo Vite resuelva imports `.js` hacia `.ts`. Los módulos de `ui/` se importan entre sí con extensión `.ts` explícita.
- Las pruebas que leen los bundles los construyen si faltan (`test/global-setup.ts`). Si cambias algo en `ui/`, corre `npm run build:ui` antes de probar: el setup no detecta bundles viejos.

- [ ] **Step 1: Dependencias, scripts y `.gitignore`**

```bash
npm i --save-exact @modelcontextprotocol/ext-apps@2.0.0
npm i -D vite@^6 vite-plugin-singlefile@^2.3
npm pkg set scripts.build:ui="cross-env UI_NAME=snapshot vite build --config ui/vite.config.ts && cross-env UI_NAME=sales-report vite build --config ui/vite.config.ts"
npm pkg set scripts.build="tsc -p tsconfig.json && npm run build:ui && node infra/copy-assets.mjs"
```

Agrega `build/` a `.gitignore`. React aparece como dependencia par *opcional* de ext-apps: no hace falta instalarla.

- [ ] **Step 2: Escribir las pruebas que fallan**

`test/unit/ui-render.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { escapeHtml, money, salesChartSvg, salesReportHtml, snapshotHtml } from '../../ui/shared/render.js';

const emptySnapshot = { todayRevenueCents: 0, sameDayLastWeekCents: 0, byStage: [], dueToday: [], low: [] };

describe('render de las UIs', () => {
  it('formatea dinero con separador de miles', () => {
    expect(money(123456)).toBe('$1,234.56');
    expect(money(5)).toBe('$0.05');
  });

  it('escapa HTML', () => {
    expect(escapeHtml(`<b>"x" & 'y'</b>`)).toBe('&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;');
  });

  it('no inyecta HTML de los datos', () => {
    const html = snapshotHtml({
      ...emptySnapshot,
      byStage: [{ stage: 'x', label: '<img src=x onerror=alert(1)>', count: 1 }]
    });
    expect(html).not.toContain('<img');
  });

  it('muestra estados vacíos en el resumen', () => {
    const html = snapshotHtml(emptySnapshot);
    expect(html).toContain('Nothing open.');
    expect(html).toContain('Nothing due today.');
    expect(html).toContain('Stock looks fine.');
  });

  it('dibuja una barra por día y nunca produce NaN', () => {
    expect(salesChartSvg([])).toContain('No sales in this period');
    expect(salesChartSvg([{ date: '2026-09-15', cents: 0 }])).not.toContain('NaN');
    const svg = salesChartSvg([
      { date: '2026-09-14', cents: 1000 }, { date: '2026-09-15', cents: 3000 }, { date: '2026-09-16', cents: 2000 }
    ]);
    expect(svg.match(/<rect/g)).toHaveLength(3);
    expect(svg).not.toContain('NaN');
  });

  it('omite la comparación cuando no hay periodo anterior', () => {
    const html = salesReportHtml({
      from: '2026-09-14', to: '2026-09-20', prevFrom: '2026-09-07', prevTo: '2026-09-13',
      totalCents: 5000, prevTotalCents: 0, count: 2, averageTicketCents: 2500, daily: [], topItems: []
    });
    expect(html).not.toContain('%');
    expect(html).toContain('No items sold.');
  });
});
```

`test/integration/mcp-apps.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { McpServer } from '@modelcontextprotocol/server';
import { RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { MemoryStore } from '../../src/store/memory.js';
import { loadProfile } from '../../src/profiles/load.js';
import { registerTools, type ToolContext } from '../../src/tools/context.js';
import { UI } from '../../src/tools/ui-assets.js';
import { seedAll } from '../../seed/run.js';

const NOW = new Date('2026-09-15T15:00:00Z');

async function connect(bizId: 'shop' | 'bakery'): Promise<Client> {
  const store = new MemoryStore();
  await seedAll(store, NOW);
  const business = (await store.getBusiness(bizId))!;
  let n = 0;
  const ctx: ToolContext = {
    business, profile: loadProfile(business.profileId), store, now: () => NOW, newId: p => `${p}-${++n}`
  };
  const server = new McpServer({ name: 'counterpart', version: '0.1.0' });
  registerTools(server, ctx);
  const [clientEnd, serverEnd] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1.0.0' });
  await server.server.connect(serverEnd);
  await client.connect(clientEnd);
  return client;
}

const uiOf = (tool: { _meta?: unknown }): string | undefined =>
  (tool._meta as { ui?: { resourceUri?: string } } | undefined)?.ui?.resourceUri;

describe('MCP Apps', () => {
  it('solo el resumen y el reporte de ventas llevan UI', async () => {
    const client = await connect('shop');
    const { tools } = await client.listTools();
    const withUi = Object.fromEntries(tools.filter(t => uiOf(t)).map(t => [t.name, uiOf(t)]));
    expect(withUi).toEqual({ get_shop_snapshot: UI.snapshot, sales_report: UI.salesReport });
    await client.close();
  });

  it('publica los dos recursos ui://', async () => {
    const client = await connect('bakery');
    const { resources } = await client.listResources();
    expect(resources.map(r => r.uri).sort()).toEqual([UI.salesReport, UI.snapshot].sort());
    await client.close();
  });

  it('sirve cada UI como un solo HTML, sin recursos externos', async () => {
    const client = await connect('shop');
    for (const uri of [UI.snapshot, UI.salesReport]) {
      const { contents } = await client.readResource({ uri });
      const page = contents[0] as { text: string; mimeType: string };
      expect(page.mimeType).toBe(RESOURCE_MIME_TYPE);
      expect(page.text).toContain('<main id="root">');
      expect(page.text).not.toMatch(/<script[^>]+src=/);
      expect(page.text).not.toMatch(/<link[^>]+href=/);
    }
    await client.close();
  });

  it('las tools con UI siguen contestando con texto hablable', async () => {
    const client = await connect('shop');
    const r = await client.callTool({ name: 'get_shop_snapshot', arguments: {} });
    expect((r.content[0] as { text: string }).text).toMatch(/^Today you've taken in \$/);
    expect(r.structuredContent).toBeDefined();
    await client.close();
  });
});
```

- [ ] **Step 3: Correr y verificar que fallan**

Run: `npx vitest run test/unit/ui-render.test.ts test/integration/mcp-apps.test.ts`
Expected: FAIL — no existen `ui/shared/render.ts` ni `src/tools/ui-assets.ts`.

- [ ] **Step 4: Render puro de las UIs**

`ui/shared/render.ts`:

```typescript
// Render puro de las UIs: sin DOM, para poder probarlo en node.

export interface SnapshotView {
  todayRevenueCents: number;
  sameDayLastWeekCents: number;
  byStage: Array<{ stage: string; label: string; count: number }>;
  dueToday: Array<{ orderId: string; number: number; label: string }>;
  low: Array<{ itemId: string; name: string; onHand: number; reorderPoint: number }>;
}

export interface SalesReportView {
  from: string; to: string; prevFrom: string; prevTo: string;
  totalCents: number; prevTotalCents: number; count: number; averageTicketCents: number;
  daily: Array<{ date: string; cents: number }>;
  topItems: Array<{ name: string; quantity: number; cents: number }>;
}

/** Formato visual: con separador de miles, a diferencia del texto hablado. */
export function money(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}$${Math.floor(abs / 100).toLocaleString('en-US')}.${String(abs % 100).padStart(2, '0')}`;
}

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, ch => ENTITIES[ch]!);
}

function trend(current: number, previous: number, suffix: string): string {
  if (previous === 0) return '';
  const up = current >= previous;
  return `<span class="${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${suffix}</span>`;
}

export function snapshotHtml(d: SnapshotView): string {
  const delta = Math.abs(d.todayRevenueCents - d.sameDayLastWeekCents);
  const max = Math.max(1, ...d.byStage.map(s => s.count));

  const stages = d.byStage.length === 0
    ? '<p class="empty">Nothing open.</p>'
    : d.byStage.map(s =>
        `<div class="bar"><span class="label">${escapeHtml(s.label)}</span>`
        + `<span class="track"><span class="fill" style="width:${Math.round((s.count / max) * 100)}%"></span></span>`
        + `<span class="count">${s.count}</span></div>`).join('');

  const due = d.dueToday.length === 0
    ? '<p class="empty">Nothing due today.</p>'
    : `<ul>${d.dueToday.map(o => `<li><b>#${o.number}</b> ${escapeHtml(o.label)}</li>`).join('')}</ul>`;

  const low = d.low.length === 0
    ? '<p class="empty">Stock looks fine.</p>'
    : `<ul>${d.low.map(i =>
        `<li>${escapeHtml(i.name)} <span class="muted">${i.onHand} left · reorder at ${i.reorderPoint}</span></li>`).join('')}</ul>`;

  return `<section class="kpi"><div class="kpi-label">Today</div>`
    + `<div class="kpi-value">${money(d.todayRevenueCents)}</div>`
    + `${trend(d.todayRevenueCents, d.sameDayLastWeekCents, `${money(delta)} vs. last week`)}</section>`
    + `<section><h2>Open by stage</h2>${stages}</section>`
    + `<section class="split"><div><h2>Due today</h2>${due}</div><div><h2>Running low</h2>${low}</div></section>`;
}

export function salesChartSvg(daily: Array<{ date: string; cents: number }>, width = 560, height = 160): string {
  if (daily.length === 0) {
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="No sales in this period">`
      + `<text x="${width / 2}" y="${height / 2}" text-anchor="middle" class="muted">No sales in this period</text></svg>`;
  }
  const max = Math.max(...daily.map(d => d.cents));
  const gap = 4;
  const barWidth = Math.max(1, Math.floor((width - gap * (daily.length - 1)) / daily.length));
  const bars = daily.map((d, i) => {
    const h = max === 0 ? 0 : Math.round((d.cents / max) * (height - 20));
    const x = i * (barWidth + gap);
    return `<rect x="${x}" y="${height - h}" width="${barWidth}" height="${h}" rx="2">`
      + `<title>${escapeHtml(d.date)}: ${money(d.cents)}</title></rect>`;
  }).join('');
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Daily sales">${bars}</svg>`;
}

export function salesReportHtml(r: SalesReportView): string {
  const pct = r.prevTotalCents === 0 ? 0 : Math.round((Math.abs(r.totalCents - r.prevTotalCents) / r.prevTotalCents) * 100);
  const top = r.topItems.length === 0
    ? '<p class="empty">No items sold.</p>'
    : `<ol>${r.topItems.map(t =>
        `<li>${escapeHtml(t.name)} <span class="muted">${t.quantity} · ${money(t.cents)}</span></li>`).join('')}</ol>`;

  return `<section class="kpis">`
    + `<div><div class="kpi-label">Total</div><div class="kpi-value">${money(r.totalCents)}</div>`
    + `${trend(r.totalCents, r.prevTotalCents, `${pct}% vs. previous period`)}</div>`
    + `<div><div class="kpi-label">Sales</div><div class="kpi-value">${r.count}</div></div>`
    + `<div><div class="kpi-label">Average</div><div class="kpi-value">${money(r.averageTicketCents)}</div></div>`
    + `</section>`
    + `<section><h2>${escapeHtml(r.from)} – ${escapeHtml(r.to)}</h2>${salesChartSvg(r.daily)}</section>`
    + `<section><h2>Best sellers</h2>${top}</section>`;
}
```

- [ ] **Step 5: Estilos, páginas y entradas**

`ui/shared/styles.css`:

```css
:root {
  --bg: #ffffff; --fg: #1b1f24; --muted: #6a737d; --line: #e4e7eb;
  --accent: #2f6fde; --up: #1a7f37; --down: #cf222e;
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #16181d; --fg: #e6e8eb; --muted: #9aa3ad; --line: #2a2f37; --accent: #6ea2ff; --up: #3fb950; --down: #f85149; }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { padding: 16px; display: grid; gap: 16px; }
h2 { margin: 0 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
ul, ol { margin: 0; padding-left: 18px; }
li { margin: 2px 0; }
.muted, .empty { color: var(--muted); }
.empty { margin: 0; }
.kpi-label { font-size: 12px; color: var(--muted); }
.kpi-value { font-size: 28px; font-weight: 650; font-variant-numeric: tabular-nums; }
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; }
.up { color: var(--up); font-size: 12px; }
.down { color: var(--down); font-size: 12px; }
.split { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; }
.bar { display: grid; grid-template-columns: 9em 1fr 2em; align-items: center; gap: 8px; margin: 4px 0; }
.track { height: 8px; background: var(--line); border-radius: 4px; overflow: hidden; }
.fill { display: block; height: 100%; background: var(--accent); }
.count { text-align: right; font-variant-numeric: tabular-nums; }
svg { width: 100%; height: auto; }
svg rect { fill: var(--accent); }
svg text { fill: var(--muted); font-size: 12px; }
```

`ui/snapshot/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Counterpart · Today</title>
  </head>
  <body>
    <main id="root"><p class="empty">Loading…</p></main>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

`ui/snapshot/main.ts`:

```typescript
import { App } from '@modelcontextprotocol/ext-apps';
import '../shared/styles.css';
import { snapshotHtml, type SnapshotView } from '../shared/render.ts';

const root = document.getElementById('root')!;
const app = new App({ name: 'counterpart-snapshot', version: '0.1.0' });

// Se asigna antes de conectar para no perder el primer resultado.
app.ontoolresult = result => {
  const data = result.structuredContent as SnapshotView | undefined;
  root.innerHTML = data ? snapshotHtml(data) : '<p class="empty">No data yet.</p>';
};

void app.connect();
```

`ui/sales-report/index.html`: igual que el de snapshot, con `<title>Counterpart · Sales</title>`.

`ui/sales-report/main.ts`:

```typescript
import { App } from '@modelcontextprotocol/ext-apps';
import '../shared/styles.css';
import { salesReportHtml, type SalesReportView } from '../shared/render.ts';

const root = document.getElementById('root')!;
const app = new App({ name: 'counterpart-sales-report', version: '0.1.0' });

// Se asigna antes de conectar para no perder el primer resultado.
app.ontoolresult = result => {
  const data = result.structuredContent as SalesReportView | undefined;
  root.innerHTML = data ? salesReportHtml(data) : '<p class="empty">No data yet.</p>';
};

void app.connect();
```

`ui/vite.config.ts`:

```typescript
import path from 'node:path';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Una UI por corrida: `UI_NAME=snapshot` o `UI_NAME=sales-report`.
const name = process.env.UI_NAME;
if (name !== 'snapshot' && name !== 'sales-report') {
  throw new Error('UI_NAME debe ser "snapshot" o "sales-report"');
}

export default defineConfig({
  root: path.resolve(import.meta.dirname, name),
  plugins: [viteSingleFile()],
  build: {
    outDir: path.resolve(import.meta.dirname, '..', 'build', 'ui', name),
    emptyOutDir: true,
    target: 'es2022'
  }
});
```

Run: `npm run build:ui`
Expected: exit 0, y existen `build/ui/snapshot/index.html` y `build/ui/sales-report/index.html`, cada uno sin `<script src=` ni `<link href=`.

- [ ] **Step 6: Ubicar y registrar los recursos**

`src/tools/ui-assets.ts`:

```typescript
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/server';
import { registerAppResource, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';

export const UI = {
  snapshot: 'ui://counterpart/snapshot.html',
  salesReport: 'ui://counterpart/sales-report.html'
} as const;

/** Raíz del paquete: sube hasta encontrar package.json. Sirve igual desde src/ que desde dist/. */
export function packageRoot(from: string = import.meta.dirname): string {
  let dir = from;
  while (!fsSync.existsSync(path.join(dir, 'package.json'))) {
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error('no se encontró package.json');
    dir = parent;
  }
  return dir;
}

export function uiBundlePath(name: 'snapshot' | 'sales-report'): string {
  return path.join(packageRoot(), 'build', 'ui', name, 'index.html');
}

export function registerUiResources(server: McpServer): void {
  const pages = [['snapshot', UI.snapshot], ['sales-report', UI.salesReport]] as const;
  for (const [name, uri] of pages) {
    registerAppResource(server, `Counterpart ${name}`, uri, { mimeType: RESOURCE_MIME_TYPE }, async () => ({
      contents: [{ uri, mimeType: RESOURCE_MIME_TYPE, text: await fs.readFile(uiBundlePath(name), 'utf8') }]
    }));
  }
}
```

En `src/tools/context.ts`, importa `registerUiResources` de `./ui-assets.js` y agrégalo al final de `registerTools`:

```typescript
  registerUiResources(s);
```

- [ ] **Step 7: Convertir las dos tools en tools de MCP Apps**

En `src/tools/snapshot.ts`, agrega:

```typescript
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import { UI } from './ui-assets.js';
```

y cambia `server.registerTool(` por `registerAppTool(server, `, agregando `_meta` a la configuración:

```typescript
  registerAppTool(
    server,
    spec.name,
    {
      title: spec.title, description: spec.description,
      inputSchema: z.object({}), outputSchema: output,
      annotations: { readOnlyHint: true, idempotentHint: true },
      _meta: { ui: { resourceUri: UI.snapshot } }
    },
    guard(async () => {
```

Haz lo mismo en `src/tools/sales-report.ts` con `resourceUri: UI.salesReport`. El cuerpo de ambos handlers no cambia. Si TypeScript rechaza el tipo del callback frente a `ToolCallback`, ajusta la anotación con un cast sin cambiar el comportamiento, y dilo en el reporte.

- [ ] **Step 8: Construir las UIs antes de las pruebas que las leen**

`test/global-setup.ts`:

```typescript
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { uiBundlePath } from '../src/tools/ui-assets.js';

/** Las pruebas de MCP Apps leen los bundles construidos. Si faltan, se construyen una sola vez. */
export default function setup(): void {
  const missing = (['snapshot', 'sales-report'] as const).some(name => !fs.existsSync(uiBundlePath(name)));
  if (missing) execSync('npm run build:ui', { stdio: 'inherit' });
}
```

Reemplaza `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['test/global-setup.ts']
  }
});
```

- [ ] **Step 9: Correr y verificar**

Run: `npx vitest run test/unit/ui-render.test.ts test/integration/mcp-apps.test.ts`
Expected: PASS en los 10 casos.

Run: `npm test`, `npm run typecheck` y `npm run build`
Expected: todo en verde. Tras `npm run build`, existen `build/ui/*/index.html`.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json .gitignore vitest.config.ts ui src test
git commit -m "feat: render the snapshot and sales report as MCP Apps"
```

---

## Task 7: Imagen Docker, entorno local completo y prueba de humo

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `tsconfig.build.json`, `infra/smoke.ts`
- Modify: `infra/copy-assets.mjs`, `package.json`

**Interfaces:**
- Consumes: `npm run build` (Task 6), `npm run seed` (Task 4), los tokens de demo.
- Produces: la imagen que el Plan B2 sube a ECR, y `npm run smoke -- <url> <token>`, que el Plan B2 reutiliza contra la URL desplegada.

**Decisiones:**
- `tsconfig.build.json` compila solo `src`, `seed` e `infra`, y excluye `src/toy.ts` e `infra/smoke.ts`. El servidor de juguete del Plan A queda fuera de la imagen (sigue sirviendo para los spikes del Plan B2), y la prueba de humo depende del cliente MCP, que es una dependencia de desarrollo. `npm run typecheck` sigue revisando todo, pruebas incluidas.
- La imagen corre como el usuario `node`, sin herramientas de desarrollo, y trae un health check en Node porque `node:24-slim` no incluye `curl`.
- En Compose, el servidor se reinicia si arranca antes que DynamoDB Local (`restart: on-failure`).

- [ ] **Step 1: Configuración de build**

`tsconfig.build.json`:

```json
{
  "extends": "./tsconfig.json",
  "include": ["src", "seed", "infra"],
  "exclude": ["src/toy.ts", "infra/smoke.ts"]
}
```

Reemplaza `infra/copy-assets.mjs`:

```javascript
import fs from 'node:fs';

// Solo los YAML de perfiles: el código ya lo compiló tsc.
fs.cpSync('src/profiles', 'dist/src/profiles', { recursive: true, filter: p => !p.endsWith('.ts') });
```

```bash
npm pkg set scripts.build="tsc -p tsconfig.build.json && npm run build:ui && node infra/copy-assets.mjs"
npm pkg set scripts.smoke="tsx infra/smoke.ts"
```

Run: `npm run build`
Expected: exit 0. `dist/src/toy.js` y `dist/infra/smoke.js` **no** existen, y `dist/src/profiles/` tiene los dos `.yaml` y ningún `.ts`. Verifícalo con `ls`.

- [ ] **Step 2: Prueba de humo**

`infra/smoke.ts`:

```typescript
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

// Uso: npm run smoke -- <url del /mcp> <token>
// Se conecta como lo haría un cliente real: lista tools, llama al resumen y lee su UI.
const [url, token] = process.argv.slice(2);
if (!url || !token) {
  console.error('Uso: npm run smoke -- <url del /mcp> <token>');
  process.exit(1);
}

const transport = new StreamableHTTPClientTransport(new URL(url), {
  fetch: (input: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    headers.set('authorization', `Bearer ${token}`);
    return fetch(input, { ...init, headers });
  }
});
const client = new Client({ name: 'counterpart-smoke', version: '0.1.0' });
await client.connect(transport);

const { tools } = await client.listTools();
console.log(`tools (${tools.length}): ${tools.map(t => t.name).join(', ')}`);

const snapshot = tools.find(t => t.name.endsWith('_snapshot'));
if (!snapshot) throw new Error('el servidor no expone una tool de resumen');

const result = await client.callTool({ name: snapshot.name, arguments: {} });
console.log(`${snapshot.name}: ${(result.content as Array<{ text?: string }>)[0]?.text ?? '(sin texto)'}`);

const uri = (snapshot._meta as { ui?: { resourceUri?: string } } | undefined)?.ui?.resourceUri;
if (!uri) throw new Error(`${snapshot.name} no declara su UI`);
const page = await client.readResource({ uri });
console.log(`ui ${uri}: ${(page.contents[0] as { text?: string }).text?.length ?? 0} bytes`);

await client.close();
```

- [ ] **Step 3: Imagen y entorno**

`Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1

# Build: TypeScript y UIs, con todas las dependencias.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY seed ./seed
COPY infra ./infra
COPY ui ./ui
RUN npm run build

# Final: dependencias de producción, código compilado y bundles de UI.
FROM node:24-slim
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/build/ui ./build/ui
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/ping').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "dist/src/index.js"]
```

`.dockerignore`:

```
node_modules
dist
build
coverage
test
docs
.git
.superpowers
*.log
.env
.env.*
Dockerfile
docker-compose.yml
```

`docker-compose.yml`:

```yaml
# Entorno local completo: Counterpart contra DynamoDB Local.
services:
  dynamodb:
    image: amazon/dynamodb-local
    ports:
      - "8000:8000"

  counterpart:
    build: .
    ports:
      - "3000:3000"
    environment:
      COUNTERPART_STORE: dynamo
      DYNAMODB_ENDPOINT: http://dynamodb:8000
      DYNAMODB_TABLE: counterpart
      AWS_REGION: us-east-1
    depends_on:
      - dynamodb
    # Si arranca antes que DynamoDB Local, crear la tabla falla: se reintenta.
    restart: on-failure
```

- [ ] **Step 4: Levantar todo y verificar de punta a punta**

Si el contenedor de la Task 3 sigue corriendo, detenlo primero (`npm run dynamo:down`), porque ocupa el puerto 8000.

```bash
docker compose up -d --build
npx cross-env COUNTERPART_STORE=dynamo DYNAMODB_ENDPOINT=http://localhost:8000 npm run seed -- --reset
curl -sS http://localhost:3000/ping
npm run smoke -- http://localhost:3000/mcp demo-shop-token
npm run smoke -- http://localhost:3000/mcp demo-bakery-token
npm run smoke -- http://localhost:3000/mcp token-que-no-existe
docker compose logs counterpart --tail 30
docker inspect --format "{{.State.Health.Status}}" $(docker compose ps -q counterpart)
docker compose down
```

Expected:
- `ping` responde `ok`.
- El taller lista 9 tools con nombres de taller y la pastelería 9 con nombres de pastelería. Cada corrida imprime la frase del resumen y una UI de más de 1000 bytes.
- El token inexistente falla con un error de conexión o 401 y el proceso termina con código distinto de cero.
- Los logs del contenedor son líneas JSON con `msg` `http` y `tool`, y no contienen `demo-shop-token` ni `demo-bakery-token`.
- El estado de salud es `healthy`.

Pega las salidas en el reporte. Si algún paso falla, no sigas: reporta `BLOCKED` con la salida.

- [ ] **Step 5: Correr la suite y commit**

Run: `npm test`, `npm run typecheck`
Expected: verde.

```bash
git add Dockerfile .dockerignore docker-compose.yml tsconfig.build.json infra package.json
git commit -m "feat: containerize the server and add an end-to-end smoke check"
```

---

## Task 8: Frases de oro

Las frases con las que el Plan B2 va a medir si el agente del bridge elige la tool correcta (meta: 18 de 20). Esta tarea las escribe y verifica que cada una apunte a una tool real con argumentos válidos. Correrlas contra el modelo requiere las cuentas y queda para el Plan B2.

**Files:**
- Create: `test/golden/auto-repair.yaml`, `test/golden/bakery.yaml`, `test/unit/golden.test.ts`

**Interfaces:**
- Consumes: `toolSpecs` y los esquemas de entrada de `src/tools/specs.ts`; `loadProfile`.
- Produces: formato `{ profile: string; phrases: Array<{ say: string; tool: string; args: object }> }`, que el Plan B2 lee tal cual.

- [ ] **Step 1: Escribir la prueba estructural**

`test/unit/golden.test.ts`:

```typescript
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import * as z from 'zod/v4';
import { loadProfile } from '../../src/profiles/load.js';
import type { Profile, ToolKey } from '../../src/profiles/schema.js';
import {
  addLineInput, closeOutInput, findInput, itemQueryInput, moveInput, openInput, salesReportInput, toolSpecs
} from '../../src/tools/specs.js';

interface Golden { profile: string; phrases: Array<{ say: string; tool: string; args: Record<string, unknown> }> }

function inputFor(profile: Profile, key: ToolKey): z.ZodObject<z.ZodRawShape> {
  switch (key) {
    case 'snapshot': return z.object({});
    case 'find': return findInput(profile);
    case 'open': return openInput(profile);
    case 'move': return moveInput(profile);
    case 'addLine': return addLineInput(profile);
    case 'stock':
    case 'reorder': return itemQueryInput(profile);
    case 'closeOut': return closeOutInput(profile);
    case 'salesReport': return salesReportInput;
  }
}

for (const file of ['auto-repair.yaml', 'bakery.yaml']) {
  const golden = parseYaml(fs.readFileSync(path.join(import.meta.dirname, '..', 'golden', file), 'utf8')) as Golden;
  const profile = loadProfile(golden.profile);
  const keyByName = new Map(Object.entries(toolSpecs(profile)).map(([key, spec]) => [spec.name, key as ToolKey]));

  describe(`frases de oro: ${golden.profile}`, () => {
    it('tiene al menos 20 frases y cubre las nueve tools', () => {
      expect(golden.phrases.length).toBeGreaterThanOrEqual(20);
      expect(new Set(golden.phrases.map(p => p.tool))).toEqual(new Set(keyByName.keys()));
    });

    for (const phrase of golden.phrases) {
      it(`"${phrase.say}" apunta a una tool real con argumentos válidos`, () => {
        const key = keyByName.get(phrase.tool);
        expect(key, `tool desconocida: ${phrase.tool}`).toBeDefined();
        const schema = inputFor(profile, key!);
        for (const arg of Object.keys(phrase.args)) {
          expect(Object.keys(schema.shape), `argumento desconocido: ${arg}`).toContain(arg);
        }
        expect(schema.safeParse(phrase.args).success, 'argumentos inválidos o incompletos').toBe(true);
      });
    }
  });
}
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run test/unit/golden.test.ts`
Expected: FAIL — no existen los archivos de frases.

- [ ] **Step 3: Escribir las frases**

`test/golden/auto-repair.yaml`:

```yaml
profile: auto-repair
phrases:
  - say: "How's the shop looking today?"
    tool: get_shop_snapshot
    args: {}
  - say: "Give me the rundown for today"
    tool: get_shop_snapshot
    args: {}
  - say: "What's waiting on parts?"
    tool: find_work_orders
    args: { stage: waiting_on_parts }
  - say: "What's in the bay right now?"
    tool: find_work_orders
    args: { stage: in_bay }
  - say: "Anything ready for pickup?"
    tool: find_work_orders
    args: { stage: ready_for_pickup }
  - say: "Pull up Dana Lee's job"
    tool: find_work_orders
    args: { query: "Dana Lee" }
  - say: "Open a work order for Dana Lee's 2019 Honda Civic, front brakes"
    tool: open_work_order
    args: { customerName: "Dana Lee", asset: { year: 2019, make: "Honda", model: "Civic" }, description: "front brakes" }
  - say: "Start a new RO for Sam Reyes, 2020 Ford F-150, oil change"
    tool: open_work_order
    args: { customerName: "Sam Reyes", asset: { year: 2020, make: "Ford", model: "F-150" }, description: "oil change" }
  - say: "Move the Civic to in the bay"
    tool: move_work_order_stage
    args: { order: "the Civic", stage: in_bay }
  - say: "The Outback is waiting on parts"
    tool: move_work_order_stage
    args: { order: "the Outback", stage: waiting_on_parts }
  - say: "Mark order 44 ready for pickup"
    tool: move_work_order_stage
    args: { order: "order 44", stage: ready_for_pickup }
  - say: "Add front brake pads to the Civic"
    tool: add_parts_or_labor
    args: { order: "the Civic", item: "front brake pads" }
  - say: "Put two hours of diagnostic on the Malibu"
    tool: add_parts_or_labor
    args: { order: "the Malibu", item: "diagnostic", quantity: 2 }
  - say: "Add an oil change to Sam's truck"
    tool: add_parts_or_labor
    args: { order: "Sam's truck", item: "oil change" }
  - say: "Do we have 5W-30?"
    tool: check_parts_stock
    args: { item: "5W-30" }
  - say: "What parts are running low?"
    tool: check_parts_stock
    args: {}
  - say: "Reorder whatever's low"
    tool: reorder_parts
    args: {}
  - say: "Order more brake rotors"
    tool: reorder_parts
    args: { item: "brake rotors" }
  - say: "Close out the CX-5, they paid by card"
    tool: close_out_work_order
    args: { order: "the CX-5", paymentMethod: card }
  - say: "Owen paid cash for the Ram, close it out"
    tool: close_out_work_order
    args: { order: "the Ram", paymentMethod: cash }
  - say: "How did we do this week compared to last week?"
    tool: sales_report
    args: { period: this_week }
  - say: "What were yesterday's sales?"
    tool: sales_report
    args: { period: yesterday }
```

`test/golden/bakery.yaml`:

```yaml
profile: bakery
phrases:
  - say: "How's the bakery doing today?"
    tool: get_bakery_snapshot
    args: {}
  - say: "What's on the board today?"
    tool: get_bakery_snapshot
    args: {}
  - say: "How many cakes are due Saturday?"
    tool: find_cake_orders
    args: { due: saturday }
  - say: "What's due tomorrow?"
    tool: find_cake_orders
    args: { due: tomorrow }
  - say: "What's in the oven?"
    tool: find_cake_orders
    args: { stage: baking }
  - say: "Which cakes are ready?"
    tool: find_cake_orders
    args: { stage: ready }
  - say: "Find Luis Romero's order"
    tool: find_cake_orders
    args: { query: "Luis Romero" }
  - say: "Take a cake order for Priya Shah, a 10-inch chocolate cake, due Saturday"
    tool: take_cake_order
    args: { customerName: "Priya Shah", flavor: chocolate, size: "10-inch", due: saturday }
  - say: "New order for Grace Kim, 8-inch vanilla, due Friday, write Happy Birthday"
    tool: take_cake_order
    args: { customerName: "Grace Kim", flavor: vanilla, size: "8-inch", inscription: "Happy Birthday", due: friday }
  - say: "Order for Tom, lemon, 8-inch, pickup tomorrow"
    tool: take_cake_order
    args: { customerName: "Tom", flavor: lemon, size: "8-inch", due: tomorrow }
  - say: "Emma's red velvet is being decorated now"
    tool: move_cake_order_stage
    args: { order: "Emma's red velvet", stage: decorating }
  - say: "Start baking Luis's cake"
    tool: move_cake_order_stage
    args: { order: "Luis's cake", stage: baking }
  - say: "Jonas's carrot cake is ready"
    tool: move_cake_order_stage
    args: { order: "Jonas's carrot cake", stage: ready }
  - say: "Add custom filling to Ben's order"
    tool: add_to_cake_order
    args: { order: "Ben's order", item: "custom filling" }
  - say: "Add delivery to Luis's chocolate cake"
    tool: add_to_cake_order
    args: { order: "Luis's chocolate cake", item: delivery }
  - say: "How much butter do we have?"
    tool: check_ingredients
    args: { item: butter }
  - say: "What ingredients are running low?"
    tool: check_ingredients
    args: {}
  - say: "Reorder whatever's low"
    tool: reorder_ingredients
    args: {}
  - say: "Order more cake boxes"
    tool: reorder_ingredients
    args: { item: "cake boxes" }
  - say: "Ada picked up her lemon cake and paid cash"
    tool: close_out_cake_order
    args: { order: "Ada's lemon cake", paymentMethod: cash }
  - say: "Close out Ben's chocolate cake, card"
    tool: close_out_cake_order
    args: { order: "Ben's chocolate cake", paymentMethod: card }
  - say: "How were sales this month?"
    tool: sales_report
    args: { period: this_month }
```

- [ ] **Step 4: Correr y verificar**

Run: `npx vitest run test/unit/golden.test.ts`
Expected: PASS — dos casos de cobertura y uno por frase (44).

Run: `npm test`
Expected: verde.

- [ ] **Step 5: Commit**

```bash
git add test/golden test/unit/golden.test.ts
git commit -m "test: add golden phrases for both demo profiles"
```

---

## Task 9: Entregables del hackathon

Los documentos que exige la submission (spec §13), en inglés porque los leen los jueces, salvo el guion del demo, que es para quien graba. Esta tarea no tiene pruebas automáticas: el criterio es que cada afirmación de estos documentos sea verdadera **hoy**. Donde algo depende del Plan B2, el documento lo dice explícitamente.

**Files:**
- Create: `README.md`, `LICENSE`, `docs/friction-log.md`, `docs/product-feedback.md`, `docs/aws-builder.md`, `docs/demo-script.md`

- [ ] **Step 1: `LICENSE`**

Texto MIT estándar, con esta línea de copyright (usa el nombre de `git config user.name`, que hoy es `Raul99Alejandro`; si el autor prefiere su nombre legal, se cambia ahí):

```
MIT License

Copyright (c) 2026 Raul99Alejandro

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 2: `README.md`**

````markdown
# Counterpart

**One voice assistant for any small business that runs on orders.**

Counterpart is a self-hosted [MCP](https://modelcontextprotocol.io) server that lets Alexa+ run a small business's day by voice: open a job, move it along, add parts or labor, check and reorder stock, take payment, and hear how the day is going. Built for the Alexa+ track of *Build, Ship, Shape: Amazon Developer Hackathon* (2026).

## The idea

A mechanic under a car and a baker with frosting on their hands have the same problem: the system that runs their shop is on a computer across the room. Their businesses look nothing alike, but they share a shape — orders that move through stages, items that get used up, payments at the end.

Counterpart has one engine for that shape and a **business profile** for each kind of business. A profile is a YAML file with the business's vocabulary, stages, and tool names. The server generates each tool's name, description, and input schema from it, so Alexa+ reads a repair shop's `open_work_order` ("Open a new work order, also called a repair order, RO, ticket or job…") and a bakery's `take_cake_order` from the same code.

## Tools

| Intent | Auto repair | Bakery |
|---|---|---|
| Day summary (with UI) | `get_shop_snapshot` | `get_bakery_snapshot` |
| Find orders | `find_work_orders` | `find_cake_orders` |
| Open an order | `open_work_order` | `take_cake_order` |
| Change stage | `move_work_order_stage` | `move_cake_order_stage` |
| Add to an order | `add_parts_or_labor` | `add_to_cake_order` |
| Check stock | `check_parts_stock` | `check_ingredients` |
| Reorder | `reorder_parts` | `reorder_ingredients` |
| Close out and charge | `close_out_work_order` | `close_out_cake_order` |
| Sales report (with UI) | `sales_report` | `sales_report` |

Every reply is one or two plain English sentences meant to be spoken. People say "the Civic" or "Dana's", not "order 4821", so every tool accepts spoken references and asks "which one?" when two orders match. Writes are idempotent because voice assistants retry. The two reporting tools also return an [MCP Apps](https://github.com/modelcontextprotocol/ext-apps) UI for screen devices.

## Architecture

```
MCP client (Alexa+ or any MCP host)
        │  Streamable HTTP · MCP 2025-11-25 · Authorization: Bearer <token>
        ▼
Counterpart
  http/      /ping · /mcp · token → business · one MCP session per business · JSON logs
  tools/     nine tools generated from the business profile · MCP Apps UIs
  domain/    pure rules: orders · inventory · spoken references · reports
  store/     MemoryStore (dev) · DynamoStore (single-table DynamoDB)
```

The bearer token decides which business is calling. Each business gets its own MCP session, built from its own profile, and a session can only be used with the token that opened it.

## Quick start

Requirements: Node.js 24 and npm. Docker if you want DynamoDB.

```bash
npm ci
npm run dev
```

The in-memory store seeds two demo businesses at startup, with the development-only tokens `demo-shop-token` and `demo-bakery-token`. Check the server end to end:

```bash
npm run smoke -- http://127.0.0.1:3000/mcp demo-shop-token
```

To use a graphical MCP client such as the [MCP Inspector](https://github.com/modelcontextprotocol/inspector), point it at `http://127.0.0.1:3000/mcp` with the header `Authorization: Bearer demo-shop-token`. For hosts that cannot send headers, run locally without a token instead:

```bash
npx cross-env COUNTERPART_DEV_BUSINESS=shop HOST=127.0.0.1 npm run dev
```

That mode is refused on any address other than `127.0.0.1`.

## Run with DynamoDB Local

```bash
docker compose up -d --build
npx cross-env COUNTERPART_STORE=dynamo DYNAMODB_ENDPOINT=http://localhost:8000 npm run seed -- --reset
npm run smoke -- http://localhost:3000/mcp demo-shop-token
```

To issue a real token for a business, stored only as a SHA-256 hash:

```bash
npx cross-env COUNTERPART_STORE=dynamo DYNAMODB_ENDPOINT=http://localhost:8000 npm run token -- shop
```

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `COUNTERPART_STORE` | `memory` | `memory` or `dynamo` |
| `DYNAMODB_TABLE` | `counterpart` | Table name |
| `AWS_REGION` | `us-east-1` | AWS region |
| `DYNAMODB_ENDPOINT` | — | DynamoDB Local URL; unset for AWS |
| `COUNTERPART_DEV_BUSINESS` | — | Local no-token mode, only on `127.0.0.1` |

## Tests

```bash
npm test                                   # unit and integration
npm run dynamo:up && npm run test:dynamo   # store contract against DynamoDB Local
npm run typecheck
```

`MemoryStore` and `DynamoStore` run the same contract suite, including atomic writes and inclusive civil-date ranges. `test/golden/` holds spoken phrases paired with the tool each should trigger, for evaluating tool selection against a real model.

## Adding a business

Add a YAML file to `src/profiles/` with the business's nouns and synonyms, its stages and which one closes an order, its nine tool names, an optional asset (for example a vehicle) and any order fields (for example a cake's flavor). Profiles are validated at startup: tool names must be unique and well formed, the closing stage must exist, and order fields cannot reuse the ids the tools already use. Seed data lives in `seed/`.

## Project layout

```
src/profiles/   business profiles and their validation
src/domain/     pure business rules
src/store/      store interface, in-memory and DynamoDB implementations
src/speech/     spoken English phrasing
src/tools/      the nine MCP tools and the MCP Apps resources
src/http/       Express app, auth, sessions, request context
ui/             the two MCP Apps UIs (built with Vite into single HTML files)
seed/           deterministic demo data and the seeding CLI
infra/          token CLI, smoke check, build helpers
test/           unit, integration, contract and golden-phrase tests
```

## Status

Done: the server, both profiles, the nine tools, token auth with per-business sessions, DynamoDB persistence, structured logs, the two MCP Apps UIs, the container image, and the tests.

In progress: deployment to AWS (ECS Express Mode with DynamoDB) and a live voice demo on Alexa. The Alexa+ MCP Toolkit is not publicly available (`@alexa-ai/cli` is served from a private registry), so the voice demo uses an Alexa Skill bridge that emulates the Alexa+ orchestrator. See [docs/friction-log.md](docs/friction-log.md).

## License

[MIT](LICENSE)
````

- [ ] **Step 3: `docs/friction-log.md`**

````markdown
# Friction log

Problems we hit while building Counterpart, in the order we hit them. Each entry says what happened, what it cost, and what would have helped.

## 1. The Alexa+ MCP Toolkit CLI is not installable

- **Area:** Alexa+ MCP Toolkit, `@alexa-ai/cli`
- **What happened:** The quickstart installs the CLI with `npm install -g @alexa-ai/cli`. On the public npm registry that package returns 404. The setup guide mentions an AWS CodeArtifact registry in `us-west-2`, which only allowlisted accounts can read, and there is no self-serve way to request access.
- **Impact:** We could not onboard our MCP server to Alexa+ or use the Alexa+ web simulator. We built the server to the Alexa+ requirements anyway and planned the voice demo around an Alexa Skill bridge that emulates the orchestrator.
- **Suggestion:** For a global hackathon with an Alexa+ track, publish the CLI (or a sandbox) to participants, or state the access requirement on the track page before people start building.

## 2. The CLI does not support Windows and needs Node 24

- **Area:** Alexa AI CLI setup guide
- **What happened:** Supported systems are macOS and Ubuntu, and Node.js 24 or later is required.
- **Impact:** Windows developers need WSL or a container just for the CLI.
- **Suggestion:** Support Windows, or document a ready-made container image for the CLI.

## 3. The Toolkit is US-only

- **Area:** Alexa+ MCP Toolkit
- **What happened:** The Toolkit overview says it is available in the United States. The hackathon is open to all countries.
- **Impact:** Participants outside the US cannot tell up front whether they can test an Alexa+ add-on at all.
- **Suggestion:** Say on the track page what non-US participants can and cannot test.

## 4. Amazon Cognito omits `code_challenge_methods_supported`

- **Area:** Alexa+ account linking with Amazon Cognito
- **What happened:** Alexa+ account linking blocks deployment unless the authorization server advertises PKCE `S256`. Cognito supports PKCE but no longer lists `code_challenge_methods_supported` in its OpenID discovery document.
- **Impact:** Cognito, the obvious AWS choice, fails the deploy-time check as-is. The workaround is to serve your own authorization-server metadata that adds the field and points at Cognito's endpoints.
- **Suggestion:** Document this workaround in the account linking guide, or have the check accept Cognito.

## 5. AWS App Runner is closed to new customers

- **Area:** Hosting on AWS
- **What happened:** App Runner, the simplest way to run a container behind HTTPS, stopped accepting new customers on April 30, 2026. The replacement is ECS Express Mode.
- **Impact:** Guides and community examples that use App Runner no longer work for new accounts.
- **Suggestion:** Point hackathon resources at ECS Express Mode.

## 6. MCP Apps docs show SDK v1 imports

- **Area:** `@modelcontextprotocol/ext-apps` 2.0
- **What happened:** ext-apps 2.0 requires the split v2 SDK packages (`@modelcontextprotocol/server`), but the quickstart still imports `McpServer` from the v1 package and passes raw zod shapes as `inputSchema`.
- **Impact:** Following the quickstart with current packages leads to type errors. We read the package's type definitions to find the v2 form (`z.object(...)`).
- **Suggestion:** Update the quickstart to the v2 imports.

## 7. Spreading a `Headers` object silently drops headers

- **Area:** MCP TypeScript SDK v2 client, custom `fetch`
- **What happened:** To add an `Authorization` header we wrapped `fetch` and spread `init.headers`. The SDK passes a `Headers` instance, and spreading it yields `{}`, which dropped the SDK's own `Accept` header. The server answered 406.
- **Impact:** An hour on a misleading status code.
- **Suggestion:** Add a first-class option for extra request headers, or an example that uses `new Headers(init.headers)`.

## 8. The DNS rebinding warning has no example

- **Area:** MCP TypeScript SDK v2 server, `createMcpExpressApp`
- **What happened:** Binding to `0.0.0.0` logs "Server is binding to 0.0.0.0 without DNS rebinding protection. Consider using the allowedHosts option…", but we could not find an example of `allowedHosts` for a server behind a load balancer.
- **Impact:** Unclear what "correct" looks like for a containerized deployment.
- **Suggestion:** Document `allowedHosts` for the common load-balancer case.

## 9. Bee Developer Mode is hidden

- **Area:** Bee CLI
- **What happened:** The CLI needs Developer Mode in the Bee app, enabled by tapping the app version five times in Settings.
- **Impact:** Easy to miss; the CLI fails to log in until it is on.
- **Suggestion:** Show the setting, or have the CLI's error message say how to enable it.
````

- [ ] **Step 4: `docs/product-feedback.md`**

````markdown
# Product feedback

## Alexa+ MCP Toolkit

**What worked:** The design around a standard MCP server is the right call. We could build and test everything with ordinary MCP tooling, and the functional requirements are concrete and useful: every listed tool must work, descriptions should carry synonyms, results should return stable identifiers, and errors go through `isError`. Support for MCP Apps and for account linking with any OAuth 2.1 provider covers what a real business add-on needs.

**What needs improvement:** Access. The CLI lives in a private registry, the Toolkit is US-only, and the setup guide doesn't support Windows. For a hackathon, that meant the one part of the track we could not touch was Alexa+ itself. A public sandbox or a hosted simulator would change that.

**Onboarding:** The quickstart reads well, but the first command fails for anyone outside the allowlist, with nothing explaining why.

## MCP TypeScript SDK v2

**What worked:** Standard Schema support (zod v4 objects), output schemas that skip validation on `isError`, tool annotations, and an in-memory transport that makes integration tests fast. Stateful Streamable HTTP with per-session servers fit a multi-tenant design with no workarounds.

**What needs improvement:** Examples for custom request headers on the client and for `allowedHosts` on the server (see the friction log).

## MCP Apps (ext-apps 2.0)

**What worked:** Linking a tool to its UI with `_meta.ui.resourceUri` keeps the text reply and the visual reply in one tool, which is exactly right for voice-first devices that sometimes have a screen. Single-file HTML bundles with Vite work well.

**What needs improvement:** Quickstart examples still use SDK v1 imports.

## DynamoDB Local

**What worked:** Running the same contract suite against DynamoDB Local and the in-memory store gave us confidence that transactional writes and key ranges behave identically before touching AWS.
````

- [ ] **Step 5: `docs/aws-builder.md`**

````markdown
# AWS architecture

Counterpart is built to run on AWS. This page lists which AWS services it uses, why, and what is already in place.

```
Alexa device or console simulator
        │ voice
        ▼
Alexa Skill (bridge) ──► Strands agent on Amazon Bedrock AgentCore (Amazon Nova 2 Lite)
                                 │ MCP · Streamable HTTP · bearer token
                                 ▼
              Counterpart container on Amazon ECS Express Mode (image in Amazon ECR)
                                 │
                                 ▼
                         Amazon DynamoDB (single table)
```

| Service | Role | Status |
|---|---|---|
| Amazon DynamoDB | Single-table store for businesses, customers, orders, items, purchase orders and payments. Transactions keep "add a line" and "close out" atomic. | Implemented and tested against DynamoDB Local |
| Amazon ECS Express Mode | Runs the container behind HTTPS with a load balancer. Chosen over AWS App Runner, which closed to new customers in April 2026. | Container image built; deployment in progress |
| Amazon ECR | Stores the container image. | In progress |
| AWS Secrets Manager | Holds each business's bearer token for the voice bridge. Only token hashes are stored in DynamoDB. | In progress |
| Amazon CloudWatch Logs | Receives the server's structured JSON logs (one line per request and per tool call). | Logs implemented; shipping in progress |
| Amazon Bedrock and Bedrock AgentCore | Run the agent that emulates the Alexa+ orchestrator and chooses which tool to call. | In progress |
| AWS Lambda | Hosts the Alexa Skill endpoint of the bridge. | In progress |

## Design notes

- **One table, no secondary indexes.** Every business's records share a partition (`BIZ#<id>`), and payments are keyed by the business's calendar date (`PAY#<YYYY-MM-DD>#<id>`), so a sales report is a single key-range query.
- **Optimistic concurrency.** Orders, items and businesses carry a version. Every write is conditional, and a conflict is spoken back to the user as "Someone else just updated work order 42. Please try again."
- **One task by design.** MCP sessions live in memory, so the service runs a single task. Scaling out would need shared sessions or stateless mode.
- **Cost.** Roughly $25–35 a month, mostly the load balancer, plus Bedrock usage for the bridge.
````

- [ ] **Step 6: `docs/demo-script.md`**

````markdown
# Guion del demo (≤ 3 min)

Las frases habladas van en inglés, tal como se dicen. Todas están en `test/golden/`.

## Antes de grabar

- [ ] Resembrar la tabla justo antes: `npm run seed -- --reset` (con el store de DynamoDB). Así la ventana de dos minutos de pedidos repetidos no afecta nada y los datos quedan frescos.
- [ ] Los tres pasteles del sábado salen sin importar el día en que siembres, porque sus vencimientos están fijados por día de la semana.
- [ ] Los reportes usan la fecha del negocio (Chicago). Grabar a cualquier hora ya no mueve los cobros de día.
- [ ] Probar cada frase una vez contra el bridge antes de grabar.

## Guion

1. **0:00–0:20 · El problema.** Un mecánico debajo de un auto, con las manos ocupadas; el sistema está en una PC al fondo del taller.
2. **0:20–1:30 · El taller por voz.**
   - *"What's waiting on parts?"*
   - *"Add front brake pads to the Civic"*
   - *"Move the Civic to in the bay"*
   - *"Close out the CX-5, they paid by card"* — se usa la CX-5 de Nina Patel, que ya está sembrada lista para entregar.
3. **1:30–1:55 · Lo visual.** *"How's the shop looking today?"* y *"How did we do this week compared to last week?"*, mostrando las dos UIs de MCP Apps. Se presentan como la interfaz que Alexa+ muestra en dispositivos con pantalla, sin hacerlas pasar por una captura de Alexa+.
4. **1:55–2:35 · Mismo servidor, otro negocio.**
   - *"How many cakes are due Saturday?"*
   - *"Take a cake order for Priya Shah, a 10-inch chocolate cake, due Saturday"*
   - *"Reorder whatever's low"*
5. **2:35–3:00 · Cómo está hecho.** El diagrama de `docs/aws-builder.md` y el cierre: un motor, cualquier negocio con órdenes.
````

- [ ] **Step 7: Verificar**

Run: `npm test`, `npm run typecheck`, `npm run build`
Expected: verde (esta tarea no cambia código).

Revisa a mano que cada comando del README funcione tal como está escrito, corriendo al menos `npm ci`, `npm run dev` + `npm run smoke -- http://127.0.0.1:3000/mcp demo-shop-token`, y el bloque de DynamoDB Local. Anota en el reporte cualquier comando que no haya funcionado y cómo quedó corregido.

- [ ] **Step 8: Commit**

```bash
git add README.md LICENSE docs/friction-log.md docs/product-feedback.md docs/aws-builder.md docs/demo-script.md
git commit -m "docs: add README, license and hackathon submission docs"
```

---

## Self-Review

**1. Cobertura.** Lo que el spec asigna al trabajo local, y dónde queda:

| Requisito | Tarea |
|---|---|
| §7.3 modelo de datos en DynamoDB, transacciones, rangos de cobros | 1, 3 |
| §7.4 fechas en la zona del negocio (también para cobros y cierres) | 1 |
| §7.7 frases de una o dos oraciones | 2 |
| §7.9 MCP Apps: resumen y reporte de ventas, con texto que basta por sí solo | 6 |
| §7.10 `/ping`, logs JSON a stdout, apagado ordenado | 5 (logs); `/ping` y apagado ya existían |
| §8 imagen, puerto 3000, health check, una sola tarea | 7 (la configuración de ECS va en el Plan B2) |
| §9 semilla y `npm run seed` | 1, 2, 4 (con `--reset`, en vez de un argumento por perfil: siembra los dos negocios) |
| §11 capas 1 y 2 de pruebas, más el contrato del store | 1–6, 8 |
| §11 capa 4, frases de oro (redacción y validación estructural) | 8 |
| §13 README, LICENSE, aws-builder, friction log, product feedback | 9 |
| Carryover: invariantes del store, tokens de demo fuera de AWS, logs de cierre de sesión, filtro de copy-assets, `toy.ts` fuera de la imagen, fechas del demo, concordancia, dos oraciones, campos reservados, `plate` genérico | 1–7 |

**Queda para el Plan B2 (necesita cuentas):** spikes 1, 2 y 4 del spec §12; despliegue en ECS Express Mode, ECR y Secrets Manager; `allowedHosts` con el hostname del balanceador; envío de logs a CloudWatch; bridge de Alexa (Tracks A y C); corrida de las frases de oro contra el modelo con meta de 18/20; video y submission; interoperabilidad con `basic-host`.

**Desviaciones conscientes, para la revisión:**
- `npm run seed -- --reset` siembra los dos negocios en vez de uno por argumento, y exige confirmación porque borra la tabla.
- Los logs agrupan los errores de dominio como `domain_error` sin un código específico (ver Task 5).
- La correlación por `requestId` entre la línea HTTP y la de la tool depende de que el SDK procese la llamada dentro del contexto asíncrono de la petición. La Task 5 lo verifica y dice qué hacer si no ocurre.

**2. Placeholders.** No hay "TBD" ni pasos sin contenido. El único valor que depende del entorno es el nombre del titular del copyright, y la Task 9 dice de dónde sale.

**3. Consistencia de nombres.** Verificados entre tareas: `Payment.paidOn`; `closeOut(..., paidOn)`; `dynamoClient`, `DynamoStore`, `ensureTable`, `dropTable`; `runStoreContract`; `storeConfig`, `openStore`, `StoreConfig`; `seedAll(store, now, { demoTokens })`; `log`, `captureLogs`; `withRequest`, `currentRequest`; `instrument`, `internalResults`; `UI`, `packageRoot`, `uiBundlePath`, `registerUiResources`; `money`, `escapeHtml`, `snapshotHtml`, `salesChartSvg`, `salesReportHtml`; scripts `dynamo:up`, `dynamo:down`, `test:dynamo`, `seed`, `token`, `typecheck`, `build:ui`, `smoke`.

---

## Ejecución

Al terminar el Plan B1, Counterpart corre completo en un contenedor contra DynamoDB, con logs, UIs, frases de oro y documentación de entrega. Lo único que falta es lo que necesita cuentas: el Plan B2.
