# Counterpart Plan B2, Etapa 2: negocios configurables por voz — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un negocio nuevo exista sin tocar código (paquete de datos o asistente por voz), con el perfil guardado en DynamoDB, un tercer negocio en blanco ("Petal and Stem") que se configura hablando en el simulador de Alexa, y la deuda de B1 cerrada en lo que alcance.

**Architecture:** El perfil deja de ser un archivo leído en cada petición y pasa a ser un registro `PROFILE` en la partición del negocio, cacheado por versión. Un negocio tiene estado: `blank` expone solo tres tools de alta; `active` expone sus nueve tools. El asistente genera perfil y catálogo con Nova 2 Lite en segundo plano (tool use forzado, esquema JSON derivado de los mismos esquemas zod), valida en capas con una reparación, deja el borrador en `DRAFT` con TTL y solo activa con `confirm: true`, en una sola transacción. La siembra lee paquetes `seed/businesses/<bizId>/` en vez de datos en código.

**Tech Stack:** Node.js 24, TypeScript ESM, MCP SDK 2.0.0 (`server`, `node`, `express`, `client`, `ext-apps`), zod v4, AWS SDK v3 (`client-dynamodb`, `lib-dynamodb`, `client-bedrock-runtime`, `client-secrets-manager`), Vite + `vite-plugin-singlefile`, vitest, bash (Git Bash en Windows).

**Spec:** `docs/superpowers/specs/2026-09-24-counterpart-plan-b2-design.md` §5 (Etapa 2) y §6 (pruebas). Base: `docs/superpowers/specs/2026-09-15-counterpart-alexa-mcp-design.md`. Insumos: `docs/b2-spikes.md` (S3, S4) y `docs/plan-b-carryover.md` §5.

**Contexto previo:** Etapa 1 completa en la rama `feat/b2-stage1` (234 pruebas, 18 omitidas sin DynamoDB Local). Registro y deuda diferida: `.superpowers/sdd/2026-09-24-counterpart-b2-stage1-deploy-voice/progress.md`. AWS sigue desplegado a propósito hasta el 23 oct.

## Decisiones del plan (donde el spec dejaba la elección abierta o donde el código cambió el supuesto)

1. **S3 — sin cambiar el fork del bridge.** El bridge arma su agente (tools y prompt) **una vez por proceso** (`packages/agent/src/session.ts`, `connect()`), y el Skill usa como `runtimeSessionId` el hash de la sesión de Alexa (`packages/skill-lambda/src/bridge.ts:141`). Reabrir la Skill = sesión nueva = proceso nuevo = lista de tools fresca. Vaciar la caché de `tools/list` no bastaría: el agente ya tiene las tools horneadas. Por eso: el servidor sí cambia las tools en la misma sesión y manda `notifications/tools/list_changed` (lo que pide el spec, y lo que ve un cliente como basic-host), y la respuesta de activación **siempre** dice *"Open me again"*. La Task 11 lo verifica en el simulador; si el agente no ve las nueve tools al reabrir, se para y se reporta.
2. **`profileVersion` en `META`** (se suma a la tabla del spec §5.1). Permite cachear el perfil por `(bizId, versión)` sin leer `PROFILE` en cada sesión: el negocio ya se lee al resolver el token.
3. **Proveedores:** hoy no existe una entidad proveedor; los ítems solo llevan `supplierId`. `catalog.yaml` no trae lista de proveedores: el proveedor es un atributo del ítem.
4. **Siembra de un paquete:** clientes y órdenes abiertas salen de `demo.yaml`; sin él, el negocio arranca sin órdenes abiertas. Los 30 días de historia sí se generan siempre desde el catálogo (lo que necesitan las gráficas).
5. **Mensajes de validación en inglés:** llegan a Nova en la reparación y al operador por `business:check` y la guía pública. Los mensajes de `parseProfile` se traducen (las pruebas cambian su regex, no su intención).
6. **Tope de 5 borradores por hora en memoria del proceso:** hay una sola tarea de ECS; un reinicio lo reinicia, aceptable.
7. **El prompt pide 10–25 ítems** (la regla de validación sigue siendo 5–60): menos salida de Nova, menos latencia (S4).
8. **Migración de los negocios remotos = resembrar** con `video/reset-demo.sh` justo después del despliegue. Solo existen `shop` y `bakery` en la tabla y la siembra ya escribe el formato nuevo; no hay código de migración.
9. **Número de orden quemado** (carryover §5): se documenta como aceptado en `Store.takeOrderNumber`; una escritura fallida salta un número, sin otra consecuencia.
10. **Calendario:** manda el acuerdo del 28 sep (`_local/siguiente-sesion.md`): Etapa 2 del 29 sep al 4 oct; video y envío el 5–6 oct. El corte del spec §5.8 pasa del 6 al **4 oct**, con el mismo orden de recorte.

## Global Constraints

- **Protocolo MCP `2025-11-25`.** Paquetes MCP en versión exacta `2.0.0`, sin `^`.
- **Región `us-east-1`. Modelo `us.amazon.nova-2-lite-v1:0`** (inference profile), configurable con `COUNTERPART_SETUP_MODEL_ID`.
- **`@aws-sdk/client-bedrock-runtime` pasa a `dependencies`:** el servidor llama a Bedrock, solo desde `src/setup/` (spec §3.3). El resto del servidor sigue sin IA.
- **Tabla `counterpart`:** partición `BIZ#<bizId>`; claves de orden `META`, `PROFILE`, `DRAFT` (nuevas: `PROFILE`, `DRAFT`); TTL en `expiresAt` en **segundos epoch**.
- **Tools de alta, nombres exactos:** `set_up_my_business`, `review_business_setup`, `activate_business_setup`. UI: `ui://counterpart/setup.html`.
- **Topes del asistente:** 5 borradores por negocio por hora; TTL del borrador 24 h; como máximo 8 etapas; entre 5 y 60 ítems; precios > 0; **una** reparación; un borrador `generating` de más de 5 minutos se da por huérfano.
- **Tercer negocio:** bizId `florist`, nombre `Petal and Stem`, invocación `petal and stem`, stack `CounterpartFloristBridge`, secreto `counterpart/florist/token`, clon `D:\Repos\amazon-hackathon-2026\bridge-florist`.
- **Paquete de ejemplo hecho a mano:** `seed/businesses/bike-shop` ("Spoke and Chain Cycles").
- **Nada del repo público lleva datos de la cuenta:** ni número, ni ARNs, ni URLs del servicio, ni tokens.
- **Credenciales y sesiones de AWS, Amazon y GitHub las maneja el dueño.** Ningún paso escribe una contraseña ni imprime un token. Los pasos marcados **[dueño]** los hace él.
- **Texto hablado en inglés (en-US), comentarios de código en español**, TypeScript ESM con imports `.js`, zod v4 como `import * as z from 'zod/v4'`.
- **Verificación al cerrar cada tarea con código:** `npm test` en verde, `npm run typecheck` limpio y `npm run build` limpio. Hoy: 234 pruebas pasan y 18 se omiten. Ninguna se borra ni se debilita; las que cambian de expectativa por decisión del spec se dicen en su paso.
- **Rama `feat/b2-stage2`**, creada desde `feat/b2-stage1`. Un commit por tarea como mínimo, en inglés, estilo conventional commits. `git push` solo cuando lo pida el dueño.

## Review Focus

1. **Describir el negocio otra vez mientras el borrador se genera.** Se espera "sigo trabajando" (`busy`), sin una segunda llamada a Nova y sin pisar el borrador en curso. Prueba en la Task 8.
2. **El proceso se reinicia a mitad de una generación** (despliegue, caída). El registro queda `generating` para siempre. Se espera que a los 5 minutos cuente como fallido, que se pueda describir de nuevo, y que una generación vieja que termine tarde no pise el borrador nuevo. Prueba en la Task 8.
3. **Un borrador listo que caducó.** DynamoDB borra por TTL con hasta 48 h de retraso, así que el registro puede seguir ahí. Se espera que revisar diga "no hay nada" y que activar no active nada. Prueba en la Task 8.
4. **Dos sesiones del mismo negocio en blanco** (el bridge reconecta, o dos dispositivos). Una activa; la otra, que aún tiene las tools de alta, intenta activar. Se espera "no hay borrador que activar", sin doble escritura, y que una sesión nueva vea las nueve tools. Prueba en la Task 9.
5. **Nova no llama la tool, devuelve JSON inservible o Bedrock niega el acceso.** Se espera un borrador `failed` con una frase hablable, nada escrito en el perfil y ninguna promesa rechazada sin manejar. Prueba en las Tasks 7 y 8.

---

## File Structure

**Nuevos**
- `src/profiles/cache.ts` — `ProfileCache`: perfil guardado por negocio, cacheado por `profileVersion`.
- `src/catalog/schema.ts` — esquema zod de un ítem y del catálogo, `toCatalogItems`, `catalogProblems` (ids repetidos, `consumes` huérfanos, ciclos). Lo usan paquetes y asistente.
- `src/validation/issues.ts` — `formatIssues`: errores de zod como `ruta: mensaje — pista`.
- `src/setup/validate.ts` — `draftSchema`, `validateSetup` (tres capas), `spokenFailure`, constantes de topes y nombres de tools de alta.
- `src/setup/generate.ts` — `generateSetup` (intento + una reparación), `novaDraftGenerator`, `bedrockConverse`, `unavailableGenerator`.
- `src/setup/service.ts` — `SetupService`: arrancar, revisar, activar o descartar; tope por hora; generación en segundo plano.
- `src/setup/view.ts` — `setupViewSchema` y `setupView`: datos para la UI del borrador.
- `src/setup/tools.ts` — las tres tools de alta y sus frases.
- `seed/package.ts` — `checkPackage` y `loadPackage` de `seed/businesses/<bizId>/`.
- `seed/business.ts` — `addBusiness` y `newBlankBusiness`.
- `seed/business-cli.ts` — `business:check`, `business:add`, `business:new`.
- `seed/random.ts` — `mulberry32` (sale de `seed/data.ts`, que se borra).
- `seed/businesses/{shop,bakery,bike-shop}/{business,catalog,demo}.yaml`.
- `ui/setup/{index.html,main.ts}`, `ui/tsconfig.json`.
- `docs/add-a-business.md`.
- `infra/spikes/setup-draft.ts` — prueba manual contra Nova, fuera de `npm test`.
- Pruebas: `test/unit/profile-cache.test.ts`, `test/unit/business-package.test.ts`, `test/unit/setup-validate.test.ts`, `test/unit/setup-generate.test.ts`, `test/unit/setup-service.test.ts`, `test/integration/seed-packages.test.ts`, `test/integration/third-business.test.ts`, `test/integration/setup-flow.test.ts`, `test/integration/open-dedup.test.ts`, `test/helpers/{context,packages,setup}.ts`, `test/fixtures/setup/florist.json`.

**Modificados**
- `src/domain/types.ts` (`Business.status`, `Business.profileVersion`, sin `profileId`), `src/store/{store,memory,dynamo}.ts`, `src/profiles/load.ts` (`loadTemplate`, `templateRecord`, mensajes en inglés), `src/http/app.ts`, `src/tools/{context,instrument,specs,ui-assets,sales-report,close-out}.ts`, `src/domain/{dates,reports,inventory,resolver}.ts`, `src/index.ts`, `seed/{run,cli}.ts`, `infra/{copy-assets.mjs,golden/cli.ts,iam/task-policy.json}`, `ui/{vite.config.ts,shared/render.ts,shared/styles.css}`, `package.json`, `README.md`, `docs/{aws-builder,friction-log,product-feedback,demo-script}.md`, `test/global-setup.ts` y los fixtures de negocio de las pruebas existentes.
- Repo central (privado): `video/reset-demo.sh`, `video/cors-proxy.mjs`, `.gitignore`.

---

## Fase A — Negocio sin programar (spec §5.1)

### Task 1: Perfiles y borradores en el store

**Files:**
- Modify: `src/store/store.ts`
- Modify: `src/store/memory.ts`
- Modify: `src/store/dynamo.ts`
- Test: `test/contract/store-contract.ts`

**Interfaces:**
- Consumes: `Profile` de `src/profiles/schema.ts`; `loadProfile` de `src/profiles/load.ts` (solo en la prueba; la Task 2 lo renombra).
- Produces (en `src/store/store.ts`):
  - `interface ProfileRecord { profile: Profile; source: string; version: number }`
  - `type DraftState = 'generating' | 'ready' | 'failed'`
  - `interface Draft { description: string; state: DraftState; profile?: Profile; catalog?: CatalogItem[]; error?: string; createdAt: string; expiresAt: number }`
  - `interface Activation { business: Business; profile: ProfileRecord; items: CatalogItem[] }`
  - Métodos nuevos de `Store`: `getProfile(bizId): Promise<ProfileRecord | null>`, `putProfile(bizId, record): Promise<void>`, `getDraft(bizId): Promise<Draft | null>`, `putDraft(bizId, draft): Promise<void>`, `deleteDraft(bizId): Promise<void>`, `activateBusiness(bizId, activation): Promise<void>` (lanza `ConflictError` si la versión del negocio o de un ítem no coincide).

- [ ] **Step 1: Escribir las pruebas del contrato**

En `test/contract/store-contract.ts`, cambiar el import de tipos y agregar el del perfil:

```ts
import { ConflictError, type Draft, type ProfileRecord, type Store } from '../../src/store/store.js';
import type { Business, CatalogItem, Order, Payment, PurchaseOrder } from '../../src/domain/types.js';
import { loadProfile } from '../../src/profiles/load.js';
```

Debajo de `const payment = …`, agregar:

```ts
const profileRecord = (): ProfileRecord => ({
  profile: loadProfile('auto-repair'), source: 'template:auto-repair', version: 1
});

const draft = (over: Partial<Draft> = {}): Draft => ({
  description: 'I run a flower shop', state: 'generating',
  createdAt: '2026-09-29T15:00:00.000Z', expiresAt: 1790000000, ...over
});
```

Dentro de `describe(\`contrato de Store: ${name}\`, …)`, al final, agregar:

```ts
    it('guarda y lee el perfil de un negocio', async () => {
      const store = await ready();
      expect(await store.getProfile('b1')).toBeNull();
      await store.putProfile('b1', profileRecord());
      expect(await store.getProfile('b1')).toEqual(profileRecord());
      expect(await store.getProfile('nadie')).toBeNull();
    });

    it('guarda, reemplaza y borra el borrador', async () => {
      const store = await ready();
      expect(await store.getDraft('b1')).toBeNull();
      await store.putDraft('b1', draft());
      const ready1 = draft({ state: 'ready', profile: loadProfile('bakery'), catalog: [item] });
      await store.putDraft('b1', ready1);
      expect(await store.getDraft('b1')).toEqual(ready1);
      await store.deleteDraft('b1');
      expect(await store.getDraft('b1')).toBeNull();
      await store.deleteDraft('b1'); // borrar lo que no existe no falla
    });

    it('activa un negocio de una vez: META, perfil, ítems y sin borrador', async () => {
      const store = await ready();
      await store.putDraft('b1', draft({ state: 'ready' }));
      const current = (await store.getBusiness('b1'))!;
      await store.activateBusiness('b1', { business: current, profile: profileRecord(), items: [item] });
      expect((await store.getBusiness('b1'))?.version).toBe(current.version + 1);
      expect(await store.getProfile('b1')).toEqual(profileRecord());
      expect((await store.listItems('b1')).map(i => [i.id, i.version])).toEqual([['i1', 2]]);
      expect(await store.getDraft('b1')).toBeNull();
    });

    it('no activa nada si la versión del negocio es vieja', async () => {
      const store = await ready();
      await store.putDraft('b1', draft({ state: 'ready' }));
      const stale = { ...(await store.getBusiness('b1'))!, version: 1 };
      await expect(store.activateBusiness('b1', { business: stale, profile: profileRecord(), items: [item] }))
        .rejects.toBeInstanceOf(ConflictError);
      expect(await store.getProfile('b1')).toBeNull();
      expect(await store.listItems('b1')).toEqual([]);
      expect(await store.getDraft('b1')).not.toBeNull();
    });
```

- [ ] **Step 2: Correr las pruebas y verlas fallar**

Run: `npx vitest run test/unit/memory-store.test.ts`
Expected: FAIL — `store.getProfile is not a function` (y errores de tipos en el editor).

- [ ] **Step 3: Tipos y métodos en `src/store/store.ts`**

Reemplazar el archivo por:

```ts
import type { Asset, Business, CatalogItem, Customer, Order, Payment, PurchaseOrder } from '../domain/types.js';
import type { Profile } from '../profiles/schema.js';

export class ConflictError extends Error {
  constructor(what: string) {
    super(`conflicto de versión en ${what}`);
    this.name = 'ConflictError';
  }
}

/** Perfil guardado de un negocio (spec B2 §5.1). `version` la elige quien escribe; META.profileVersion la repite. */
export interface ProfileRecord { profile: Profile; source: string; version: number }

export type DraftState = 'generating' | 'ready' | 'failed';

/** Borrador del asistente: uno por negocio. `expiresAt` va en segundos epoch, que es lo que lee el TTL de DynamoDB. */
export interface Draft {
  description: string;
  state: DraftState;
  profile?: Profile;
  catalog?: CatalogItem[];
  error?: string;
  createdAt: string;
  expiresAt: number;
}

/** Lo que escribe la activación de un negocio, todo o nada. */
export interface Activation { business: Business; profile: ProfileRecord; items: CatalogItem[] }

export interface Store {
  putBusiness(b: Business): Promise<void>;
  getBusiness(bizId: string): Promise<Business | null>;
  putToken(tokenHash: string, bizId: string): Promise<void>;
  getBusinessByTokenHash(tokenHash: string): Promise<Business | null>;
  /** Consume el número antes de escribir la orden: si esa escritura falla, el número se salta. Aceptado (carryover §5). */
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
  getProfile(bizId: string): Promise<ProfileRecord | null>;
  putProfile(bizId: string, record: ProfileRecord): Promise<void>;
  getDraft(bizId: string): Promise<Draft | null>;
  putDraft(bizId: string, draft: Draft): Promise<void>;
  deleteDraft(bizId: string): Promise<void>;
  /** META con la regla de versiones, PROFILE, ítems con la regla de versiones, y borra DRAFT: todo o nada. */
  activateBusiness(bizId: string, activation: Activation): Promise<void>;
}
```

- [ ] **Step 4: Implementar en `MemoryStore`**

En `src/store/memory.ts`: cambiar el import a `import { ConflictError, type Activation, type Draft, type ProfileRecord, type Store } from './store.js';`, sumar `profile?: ProfileRecord; draft?: Draft;` a `interface Tenant`, y agregar al final de la clase:

```ts
  async getProfile(bizId: string): Promise<ProfileRecord | null> {
    const profile = this.tenants.get(bizId)?.profile;
    return profile ? copy(profile) : null;
  }

  async putProfile(bizId: string, record: ProfileRecord): Promise<void> {
    this.tenant(bizId).profile = copy(record);
  }

  async getDraft(bizId: string): Promise<Draft | null> {
    const draft = this.tenants.get(bizId)?.draft;
    return draft ? copy(draft) : null;
  }

  async putDraft(bizId: string, draft: Draft): Promise<void> {
    this.tenant(bizId).draft = copy(draft);
  }

  async deleteDraft(bizId: string): Promise<void> {
    const t = this.tenants.get(bizId);
    if (t) delete t.draft;
  }

  async activateBusiness(bizId: string, a: Activation): Promise<void> {
    const t = this.tenant(bizId);
    // Validar todo antes de escribir nada, igual que la transacción de DynamoDB.
    if (t.business.version !== a.business.version) throw new ConflictError('business');
    for (const item of a.items) {
      const current = t.items.get(item.id);
      if (current && current.version !== item.version) throw new ConflictError(`item ${item.id}`);
    }
    t.business = copy({ ...a.business, version: a.business.version + 1 });
    t.profile = copy(a.profile);
    for (const item of a.items) t.items.set(item.id, copy({ ...item, version: item.version + 1 }));
    delete t.draft;
  }
```

- [ ] **Step 5: Implementar en `DynamoStore`**

En `src/store/dynamo.ts`: sumar `DeleteCommand` al import de `@aws-sdk/lib-dynamodb`, cambiar el import de `./store.js` a `import { ConflictError, type Activation, type Draft, type ProfileRecord, type Store } from './store.js';`, y agregar al final de la clase:

```ts
  getProfile(bizId: string): Promise<ProfileRecord | null> {
    return this.get<ProfileRecord>(bizKey(bizId), 'PROFILE');
  }

  putProfile(bizId: string, record: ProfileRecord): Promise<void> {
    return this.put(bizKey(bizId), 'PROFILE', record);
  }

  getDraft(bizId: string): Promise<Draft | null> {
    return this.get<Draft>(bizKey(bizId), 'DRAFT');
  }

  putDraft(bizId: string, draft: Draft): Promise<void> {
    return this.put(bizKey(bizId), 'DRAFT', draft);
  }

  async deleteDraft(bizId: string): Promise<void> {
    await this.doc.send(new DeleteCommand({ TableName: this.table, Key: { pk: bizKey(bizId), sk: 'DRAFT' } }));
  }

  async activateBusiness(bizId: string, a: Activation): Promise<void> {
    // META, PROFILE y DRAFT más los ítems: una transacción admite hasta 100 operaciones.
    if (a.items.length + 3 > TRANSACTION_LIMIT) {
      throw new Error(`activateBusiness admite hasta ${TRANSACTION_LIMIT - 3} ítems`);
    }
    const pk = bizKey(bizId);
    await this.guarded('business', () => this.doc.send(new TransactWriteCommand({
      TransactItems: [
        { Put: this.versionedPut(pk, 'META', a.business) },
        { Put: { TableName: this.table, Item: { ...a.profile, pk, sk: 'PROFILE' } } },
        ...a.items.map(i => ({ Put: this.versionedPut(pk, `ITEM#${i.id}`, i) })),
        { Delete: { TableName: this.table, Key: { pk, sk: 'DRAFT' } } }
      ]
    })));
  }
```

- [ ] **Step 6: Correr las pruebas**

Run: `npx vitest run test/unit/memory-store.test.ts`
Expected: PASS.
Si DynamoDB Local está disponible (`npm run dynamo:up`, esperar unos segundos): `npm run test:dynamo` → PASS. Si Docker no está, anotar "contrato Dynamo pendiente" en el registro y seguir: la Task 11 lo ejercita contra AWS.

- [ ] **Step 7: Verificación completa y commit**

Run: `npm test && npm run typecheck && npm run build` → todo verde.

```bash
git add src/store test/contract
git commit -m "feat: store business profiles and setup drafts"
```

---

### Task 2: El servidor lee el perfil del store

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/profiles/load.ts`
- Create: `src/profiles/cache.ts`
- Modify: `src/http/app.ts`
- Modify: `seed/run.ts`
- Modify: `infra/golden/cli.ts`
- Create: `test/helpers/context.ts`
- Create: `test/unit/profile-cache.test.ts`
- Modify: `test/integration/seed.test.ts`, `test/unit/profiles.test.ts` y todos los fixtures de `Business` en `test/`

**Interfaces:**
- Consumes: `Store.getProfile/putProfile`, `ProfileRecord` (Task 1).
- Produces:
  - `type BusinessStatus = 'blank' | 'active'`; `Business` = `{ id; name; status: BusinessStatus; profileVersion: number; timezone; taxRateBps; nextOrderNumber; version }` (sin `profileId`).
  - `loadTemplate(id: string): Profile` (antes `loadProfile`), `templateRecord(id: string): ProfileRecord`, `listTemplates(): string[]` en `src/profiles/load.ts`.
  - `class ProfileCache { constructor(store: Store); forBusiness(business: Business): Promise<Profile> }` en `src/profiles/cache.ts`. Lanza si el negocio no está `active` o no tiene `PROFILE`.
  - `toolContext(store, bizId, opts: { now: () => Date; newId: (p: string) => string }): Promise<ToolContext>` en `test/helpers/context.ts`.

- [ ] **Step 1: Renombrar `loadProfile` → `loadTemplate` en todo el repo (mecánico)**

```bash
grep -rl "loadProfile" src seed infra test | xargs sed -i 's/loadProfile/loadTemplate/g'
```

- [ ] **Step 2: `Business` con estado y versión de perfil**

En `src/domain/types.ts`, reemplazar la línea de `Business` por:

```ts
export type BusinessStatus = 'blank' | 'active';
/** `profileVersion` es la versión del PROFILE vigente; 0 mientras el negocio está en blanco (spec B2 §5.1). */
export interface Business { id: string; name: string; status: BusinessStatus; profileVersion: number; timezone: string; taxRateBps: number; nextOrderNumber: number; version: number }
```

Actualizar los fixtures de las pruebas y la siembra (mecánico):

```bash
grep -rl "profileId: '" test seed | xargs sed -i "s/profileId: 'auto-repair'/status: 'active', profileVersion: 1/; s/profileId: 'bakery'/status: 'active', profileVersion: 1/"
```

- [ ] **Step 3: Escribir las pruebas de la caché**

Crear `test/unit/profile-cache.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { ProfileCache } from '../../src/profiles/cache.js';
import { templateRecord } from '../../src/profiles/load.js';
import { MemoryStore } from '../../src/store/memory.js';
import type { Business } from '../../src/domain/types.js';

const business: Business = {
  id: 'b1', name: 'Oak Street Auto', status: 'active', profileVersion: 1,
  timezone: 'America/Chicago', taxRateBps: 825, nextOrderNumber: 41, version: 1
};

async function storeWithProfile(): Promise<MemoryStore> {
  const store = new MemoryStore();
  await store.putBusiness(business);
  await store.putProfile('b1', templateRecord('auto-repair'));
  return store;
}

describe('caché de perfiles', () => {
  it('lee el perfil una sola vez por versión', async () => {
    const store = await storeWithProfile();
    const read = vi.spyOn(store, 'getProfile');
    const cache = new ProfileCache(store);
    expect((await cache.forBusiness(business)).toolNames.open).toBe('open_work_order');
    await cache.forBusiness(business);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('vuelve a leer cuando cambia la versión', async () => {
    const store = await storeWithProfile();
    const read = vi.spyOn(store, 'getProfile');
    const cache = new ProfileCache(store);
    await cache.forBusiness(business);
    await store.putProfile('b1', { ...templateRecord('bakery'), version: 2 });
    const profile = await cache.forBusiness({ ...business, profileVersion: 2 });
    expect(profile.toolNames.open).toBe('take_cake_order');
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('rechaza un negocio en blanco', async () => {
    const cache = new ProfileCache(await storeWithProfile());
    await expect(cache.forBusiness({ ...business, status: 'blank', profileVersion: 0 })).rejects.toThrow(/blank/);
  });

  it('falla claro si falta el perfil guardado', async () => {
    const store = new MemoryStore();
    await store.putBusiness(business);
    await expect(new ProfileCache(store).forBusiness(business)).rejects.toThrow(/no saved profile/);
  });
});
```

En `test/integration/seed.test.ts`, agregar al final (migración de spec §6: "negocio con plantilla a perfil guardado"):

```ts
describe('perfiles guardados por la siembra', () => {
  it('siembra los negocios activos con el perfil copiado de su plantilla', async () => {
    const store = new MemoryStore();
    await seedAll(store, new Date('2026-09-15T15:00:00Z'));
    for (const [bizId, template] of [['shop', 'auto-repair'], ['bakery', 'bakery']] as const) {
      const business = (await store.getBusiness(bizId))!;
      expect(business.status).toBe('active');
      const record = (await store.getProfile(bizId))!;
      expect(record.version).toBe(business.profileVersion);
      expect(record.source).toBe(`template:${template}`);
      expect(record.profile).toEqual(loadTemplate(template));
    }
  });
});
```

con `import { loadTemplate } from '../../src/profiles/load.js';` arriba.

- [ ] **Step 4: Correr y ver fallar**

Run: `npx vitest run test/unit/profile-cache.test.ts test/integration/seed.test.ts`
Expected: FAIL — `Cannot find module '../../src/profiles/cache.js'` y `templateRecord` no exportado.

- [ ] **Step 5: Plantillas en `src/profiles/load.ts`**

Reemplazar las dos últimas funciones (`loadTemplate` ya renombrada) por:

```ts
/** Plantillas de perfil: los YAML de esta carpeta. El servidor ya no los lee al atender peticiones. */
export function loadTemplate(id: string): Profile {
  const file = path.join(DIR, `${id}.yaml`);
  return parseProfile(parseYaml(fs.readFileSync(file, 'utf8')));
}

export function listTemplates(): string[] {
  return fs.readdirSync(DIR).filter(f => f.endsWith('.yaml')).map(f => f.slice(0, -'.yaml'.length)).sort();
}

/** Registro PROFILE copiado de una plantilla, versión 1. */
export function templateRecord(id: string): ProfileRecord {
  return { profile: loadTemplate(id), source: `template:${id}`, version: 1 };
}
```

y sumar `import type { ProfileRecord } from '../store/store.js';` a los imports.

- [ ] **Step 6: Crear `src/profiles/cache.ts`**

```ts
import type { Business } from '../domain/types.js';
import type { Store } from '../store/store.js';
import { parseProfile } from './load.js';
import type { Profile } from './schema.js';

/**
 * Perfil de cada negocio, leído del store y cacheado por `profileVersion` (spec B2 §5.1).
 * Cierra la deuda de B1 de leer y parsear el YAML en cada petición.
 */
export class ProfileCache {
  private readonly entries = new Map<string, { version: number; profile: Profile }>();

  constructor(private readonly store: Store) {}

  async forBusiness(business: Business): Promise<Profile> {
    if (business.status !== 'active') throw new Error(`business ${business.id} is blank; it has no profile yet`);
    const cached = this.entries.get(business.id);
    if (cached && cached.version === business.profileVersion) return cached.profile;

    const record = await this.store.getProfile(business.id);
    if (!record) throw new Error(`business ${business.id} has no saved profile`);
    const profile = parseProfile(record.profile);
    this.entries.set(business.id, { version: business.profileVersion, profile });
    return profile;
  }
}
```

- [ ] **Step 7: `createApp` usa la caché**

En `src/http/app.ts`: quitar `import { loadTemplate } from '../profiles/load.js';`, agregar `import { ProfileCache } from '../profiles/cache.js';`, crear la caché junto a `sessions`:

```ts
  const sessions = new Sessions();
  const profiles = new ProfileCache(deps.store);
```

y en la creación de la sesión reemplazar `profile: loadTemplate(business.profileId)` por `profile: await profiles.forBusiness(business)`.

- [ ] **Step 8: La siembra escribe `PROFILE`**

En `seed/run.ts`: cambiar el import a `import { loadTemplate, templateRecord } from '../src/profiles/load.js';` y, en `seedShop` y `seedBakery`, justo después de `await store.putBusiness(…)`:

```ts
  await store.putProfile(SHOP.id, templateRecord('auto-repair'));
```

```ts
  await store.putProfile(BAKERY.id, templateRecord('bakery'));
```

(`SHOP` y `BAKERY` ya quedaron con `status: 'active', profileVersion: 1` por el sed del Step 2.)

- [ ] **Step 9: Helper de pruebas y usos de `business.profileId`**

Crear `test/helpers/context.ts`:

```ts
import { ProfileCache } from '../../src/profiles/cache.js';
import type { Store } from '../../src/store/store.js';
import type { ToolContext } from '../../src/tools/context.js';

/** ToolContext de un negocio sembrado, con el perfil leído del store como en el servidor. */
export async function toolContext(
  store: Store, bizId: string, opts: { now: () => Date; newId: (prefix: string) => string }
): Promise<ToolContext> {
  const business = await store.getBusiness(bizId);
  if (!business) throw new Error(`no existe el negocio ${bizId}`);
  return { business, profile: await new ProfileCache(store).forBusiness(business), store, ...opts };
}
```

Buscar los usos que quedaron rotos:

```bash
grep -rn "profileId" src seed infra test
```

- En `test/integration/e2e.test.ts`, `test/integration/mcp-apps.test.ts` y `test/integration/spoken-summaries.test.ts`: reemplazar el bloque `const business = (await store.getBusiness(bizId))!; … const ctx: ToolContext = { business, profile: loadTemplate(business.profileId), store, now: …, newId: … };` por `const ctx = await toolContext(store, bizId, { now: () => NOW, newId: p => \`${p}-${++n}\` });` (mismo `now` y `newId` que tenía cada archivo), con `import { toolContext } from '../helpers/context.js';`, y quitar los imports que queden sin uso.
- En `infra/golden/cli.ts`: reemplazar `profile: loadTemplate(business.profileId)` por `profile: await new ProfileCache(store).forBusiness(business)`, con `import { ProfileCache } from '../../src/profiles/cache.js';` y sin el import de `loadTemplate` si queda sin uso.

- [ ] **Step 10: Pruebas HTTP que crean sesiones sobre un store armado a mano**

Run: `npm test`
Las pruebas que hacen `store.putBusiness(...)` y luego abren una sesión por HTTP fallan con `has no saved profile` (al menos `test/integration/http.test.ts` y `test/integration/session-cap.test.ts`). En cada una, justo después de cada `await store.putBusiness(x)`, agregar `await store.putProfile(x.id, templateRecord('<plantilla del negocio>'))` (`'auto-repair'` para el taller, `'bakery'` para la pastelería), con `import { templateRecord } from '../../src/profiles/load.js';`. Repetir hasta que no quede ninguna prueba con ese error.

- [ ] **Step 11: Verificación completa y commit**

Run: `npm test && npm run typecheck && npm run build`
Expected: todo verde; las pruebas nuevas de la caché y la de siembra pasan.

```bash
git add -A src seed infra test
git commit -m "feat: load each business profile from the store, cached by version"
```

---

### Task 3: Esquema del catálogo y `business:check`

**Files:**
- Create: `src/validation/issues.ts`
- Create: `src/catalog/schema.ts`
- Modify: `src/profiles/load.ts` (mensajes en inglés)
- Create: `seed/package.ts`
- Create: `seed/business-cli.ts`
- Modify: `package.json`
- Create: `test/helpers/packages.ts`
- Create: `test/unit/business-package.test.ts`
- Modify: `test/unit/profiles.test.ts`

**Interfaces:**
- Consumes: `profileSchema`, `parseProfile`, `loadTemplate`, `listTemplates` (Task 2); `resolveDue` de `src/domain/dates.ts`.
- Produces:
  - `formatIssues(error: z.ZodError, prefix?: string): string[]` en `src/validation/issues.ts`.
  - En `src/catalog/schema.ts`: `ITEM_KINDS`, `slug` (zod), `catalogItemSchema`, `catalogSchema`, `type CatalogItemInput`, `toCatalogItems(items: CatalogItemInput[]): CatalogItem[]`, `catalogProblems(items: Array<Pick<CatalogItem, 'id' | 'consumes'>>, where: string): string[]`.
  - En `seed/package.ts`: `interface DemoOrder`, `interface DemoCustomer`, `interface DemoFile`, `interface BusinessPackage { id; name; timezone; taxRateBps; firstOrderNumber; profile: Profile; profileSource: string; items: CatalogItem[]; demo: DemoFile }`, `type PackageCheck = { ok: true; pkg: BusinessPackage } | { ok: false; problems: string[] }`, `checkPackage(dir: string): PackageCheck`, `loadPackage(dir: string): BusinessPackage`.

- [ ] **Step 1: Helper para escribir paquetes de prueba**

Crear `test/helpers/packages.ts`:

```ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Escribe un paquete de negocio en una carpeta temporal y devuelve su ruta. */
export function writePackage(files: Record<string, string>, folder = 'test-shop'): string {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'counterpart-pkg-')), folder);
  fs.mkdirSync(dir);
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text);
  return dir;
}

export const BUSINESS_YAML = `name: Test Bakery
timezone: America/Chicago
taxRateBps: 825
firstOrderNumber: 1
template: bakery
`;

export const CATALOG_YAML = `items:
  - { id: cake-8, name: 8-inch cake, kind: product, unit: cake, priceCents: 4500, stocked: false, consumes: { box-8: 1 } }
  - { id: cupcakes, name: Cupcake dozen, kind: product, unit: dozen, priceCents: 3600, stocked: false }
  - { id: box-8, name: 8-inch box, kind: supply, priceCents: 120, stocked: true, onHand: 40, reorderPoint: 20, reorderQty: 100 }
  - { id: flour, name: Flour, kind: ingredient, unit: pound, priceCents: 90, stocked: true, onHand: 60, reorderPoint: 25, reorderQty: 100, supplierId: mill }
  - { id: delivery, name: Delivery, kind: product, unit: trip, priceCents: 2500, taxable: false, stocked: false }
`;
```

- [ ] **Step 2: Escribir las pruebas del chequeo**

Crear `test/unit/business-package.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { checkPackage } from '../../seed/package.js';
import { BUSINESS_YAML, CATALOG_YAML, writePackage } from '../helpers/packages.js';

const problemsOf = (files: Record<string, string>, folder?: string): string[] => {
  const result = checkPackage(writePackage(files, folder));
  return result.ok ? [] : result.problems;
};

describe('chequeo de paquetes de negocio', () => {
  it('acepta un paquete válido con plantilla', () => {
    const result = checkPackage(writePackage({ 'business.yaml': BUSINESS_YAML, 'catalog.yaml': CATALOG_YAML }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pkg.id).toBe('test-shop');
      expect(result.pkg.profileSource).toBe('template:bakery');
      expect(result.pkg.items.find(i => i.id === 'cupcakes')).toMatchObject({ taxable: true, onHand: 0, version: 1 });
    }
  });

  it('pide un nombre de carpeta que sirva de id', () => {
    expect(problemsOf({ 'business.yaml': BUSINESS_YAML, 'catalog.yaml': CATALOG_YAML }, 'Test Shop')[0])
      .toMatch(/folder name "Test Shop"/);
  });

  it('avisa si falta un archivo', () => {
    expect(problemsOf({ 'business.yaml': BUSINESS_YAML })).toContain('catalog.yaml: file not found');
  });

  it('avisa si el YAML está roto', () => {
    expect(problemsOf({ 'business.yaml': 'name: [', 'catalog.yaml': CATALOG_YAML })[0]).toMatch(/^business\.yaml: not valid YAML/);
  });

  it('no acepta plantilla y perfil a la vez', () => {
    const both = `${BUSINESS_YAML}profile: { id: x }\n`;
    expect(problemsOf({ 'business.yaml': both, 'catalog.yaml': CATALOG_YAML }).join('\n')).toMatch(/either template or profile/);
  });

  it('nombra las plantillas que existen', () => {
    const bad = BUSINESS_YAML.replace('template: bakery', 'template: florist');
    expect(problemsOf({ 'business.yaml': bad, 'catalog.yaml': CATALOG_YAML }).join('\n'))
      .toMatch(/there is no template "florist"; use one of auto-repair, bakery/);
  });

  it('dice el campo exacto y cómo arreglar un precio', () => {
    const bad = CATALOG_YAML.replace('priceCents: 4500', 'priceCents: 45.5');
    const text = problemsOf({ 'business.yaml': BUSINESS_YAML, 'catalog.yaml': bad }).join('\n');
    expect(text).toMatch(/catalog\.yaml › items\[0\]\.priceCents: .*cents as a whole number/);
  });

  it('detecta un consumes hacia un ítem que no existe', () => {
    const bad = CATALOG_YAML.replace('consumes: { box-8: 1 }', 'consumes: { box-10: 1 }');
    expect(problemsOf({ 'business.yaml': BUSINESS_YAML, 'catalog.yaml': bad }).join('\n'))
      .toMatch(/items\[0\]\.consumes\.box-10: there is no item with id "box-10"/);
  });

  it('detecta ids repetidos', () => {
    const bad = CATALOG_YAML.replace('id: cupcakes', 'id: cake-8');
    expect(problemsOf({ 'business.yaml': BUSINESS_YAML, 'catalog.yaml': bad }).join('\n'))
      .toMatch(/items\[1\]\.id: "cake-8" is already used by items\[0\]/);
  });

  it('detecta ítems que se consumen en círculo', () => {
    const bad = CATALOG_YAML.replace(
      'priceCents: 120, stocked: true, onHand: 40',
      'priceCents: 120, stocked: true, consumes: { cake-8: 1 }, onHand: 40'
    );
    expect(problemsOf({ 'business.yaml': BUSINESS_YAML, 'catalog.yaml': bad }).join('\n')).toMatch(/consume each other in a loop/);
  });

  it('valida un perfil propio con las reglas del servidor', () => {
    const own = `name: Test Place
timezone: America/Chicago
taxRateBps: 0
profile:
  id: own
  nouns: { order: job, orders: jobs, item: part, items: parts, customer: client }
  synonyms: { order: [], item: [] }
  toolNames: { snapshot: get_jobs_snapshot, find: find_jobs, open: open_job, move: move_job, addLine: add_to_job, stock: check_parts, reorder: reorder_parts, closeOut: close_out_job, salesReport: sales_report }
  stages: [{ id: new, label: new }, { id: done, label: done }]
  closedStage: finished
  closeFrom: [new]
  asset: null
  orderFields: []
  due: none
`;
    expect(problemsOf({ 'business.yaml': own, 'catalog.yaml': CATALOG_YAML }).join('\n'))
      .toMatch(/business\.yaml › profile: closedStage "finished" is not one of the stages/);
  });

  it('revisa el demo contra el perfil', () => {
    const demo = `customers:
  - name: Grace Kim
    order: { stage: shipped, fields: { size: 8-inch }, due: saturday, lines: [cake-8] }
`;
    const text = problemsOf({ 'business.yaml': BUSINESS_YAML, 'catalog.yaml': CATALOG_YAML, 'demo.yaml': demo }).join('\n');
    expect(text).toMatch(/customers\[0\]\.order\.stage: "shipped" is not an open stage/);
    expect(text).toMatch(/customers\[0\]\.order\.fields\.flavor: required by the profile/);
  });
});
```

Y en `test/unit/profiles.test.ts`: cambiar `.toThrow(/duplicado/)` por `.toThrow(/used twice/)` y `.toThrow(/reservado/)` por `.toThrow(/reserved/)` (Decisión 5: mismos casos, mensajes en inglés).

- [ ] **Step 3: Correr y ver fallar**

Run: `npx vitest run test/unit/business-package.test.ts test/unit/profiles.test.ts`
Expected: FAIL — `Cannot find module '../../seed/package.js'`; en `profiles.test.ts`, los dos mensajes no coinciden.

- [ ] **Step 4: Mensajes de `parseProfile` en inglés**

En `src/profiles/load.ts`, dentro de `parseProfile`, reemplazar los seis `throw new Error(…)` por, en orden:

```ts
    throw new Error(`closedStage "${p.closedStage}" is not one of the stages`);
```
```ts
    if (!stageIds.has(s)) throw new Error(`closeFrom has "${s}", which is not one of the stages`);
    if (s === p.closedStage) throw new Error(`closeFrom cannot include the closedStage "${s}"`);
```
```ts
  if (dupes.length > 0) throw new Error(`tool name "${dupes[0]}" is used twice; every tool needs its own name`);
```
```ts
      if (!fieldIds.has(m[1]!)) throw new Error(`spokenAs uses "{${m[1]}}", which is not a field of the asset`);
```
```ts
    if (RESERVED_FIELD_IDS.has(f.id)) throw new Error(`orderFields uses the reserved id "${f.id}"; pick another id`);
```

- [ ] **Step 5: Crear `src/validation/issues.ts`**

```ts
import type * as z from 'zod/v4';

/** Pistas por nombre de campo: el mensaje de zod dice qué está mal, esto dice cómo arreglarlo. */
const HINTS: Record<string, string> = {
  priceCents: 'write the price in cents as a whole number, e.g. 4500 for $45.00',
  kind: 'use one of part, labor, product, ingredient, supply',
  timezone: 'use an IANA time zone such as America/Chicago',
  id: 'use lowercase letters, digits and dashes',
  taxRateBps: 'write the tax rate in basis points, e.g. 825 for 8.25%'
};

/** `a.b[2].c` a partir de la ruta de un error de zod. */
function issuePath(path: readonly PropertyKey[]): string {
  return path.reduce<string>((acc, key) =>
    typeof key === 'number' ? `${acc}[${key}]` : acc ? `${acc}.${String(key)}` : String(key), '');
}

/** Errores de zod como `ruta: mensaje — pista`, una línea por error. */
export function formatIssues(error: z.ZodError, prefix = ''): string[] {
  return error.issues.map(issue => {
    const at = issuePath(issue.path);
    const where = [prefix, at].filter(Boolean).join(prefix && at ? '.' : '');
    const last = issue.path.at(-1);
    const hint = typeof last === 'string' && HINTS[last] ? ` — ${HINTS[last]}` : '';
    return `${where || '(root)'}: ${issue.message}${hint}`;
  });
}
```

- [ ] **Step 6: Crear `src/catalog/schema.ts`**

```ts
import * as z from 'zod/v4';
import type { CatalogItem } from '../domain/types.js';

export const ITEM_KINDS = ['part', 'labor', 'product', 'ingredient', 'supply'] as const;

export const slug = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'use lowercase letters, digits and dashes');

/** Un ítem tal como lo escribe una persona (paquete) o Nova (asistente). Una sola fuente de verdad (spec B2 §5.3). */
export const catalogItemSchema = z.object({
  id: slug,
  name: z.string().min(1),
  synonyms: z.array(z.string().min(1)).default([]),
  kind: z.enum(ITEM_KINDS),
  unit: z.string().min(1).default('each'),
  priceCents: z.number().int().positive(),
  taxable: z.boolean().default(true),
  stocked: z.boolean(),
  onHand: z.number().int().min(0).default(0),
  reorderPoint: z.number().int().min(0).default(0),
  reorderQty: z.number().int().min(0).default(0),
  supplierId: slug.optional(),
  consumes: z.record(slug, z.number().positive()).default({})
}).strict();

export const catalogSchema = z.object({ items: z.array(catalogItemSchema).min(1) }).strict();

export type CatalogItemInput = z.output<typeof catalogItemSchema>;

export function toCatalogItems(items: CatalogItemInput[]): CatalogItem[] {
  return items.map(item => ({ ...item, version: 1 }));
}

/** Reglas entre ítems que un esquema no expresa: ids únicos, `consumes` hacia ítems existentes y sin ciclos. */
export function catalogProblems(items: Array<Pick<CatalogItem, 'id' | 'consumes'>>, where: string): string[] {
  const problems: string[] = [];
  const firstIndex = new Map<string, number>();
  items.forEach((item, i) => {
    const seen = firstIndex.get(item.id);
    if (seen === undefined) firstIndex.set(item.id, i);
    else problems.push(`${where}[${i}].id: "${item.id}" is already used by ${where}[${seen}]; every item needs its own id`);
  });
  items.forEach((item, i) => {
    for (const target of Object.keys(item.consumes)) {
      if (!firstIndex.has(target)) problems.push(`${where}[${i}].consumes.${target}: there is no item with id "${target}"`);
    }
  });
  const cycle = findCycle(items);
  if (cycle) problems.push(`${where}: items consume each other in a loop (${cycle.join(' → ')}); remove one of those consumes`);
  return problems;
}

function findCycle(items: Array<Pick<CatalogItem, 'id' | 'consumes'>>): string[] | null {
  const graph = new Map(items.map(i => [i.id, Object.keys(i.consumes)]));
  const state = new Map<string, 'visiting' | 'done'>();
  const trail: string[] = [];
  const visit = (id: string): string[] | null => {
    if (state.get(id) === 'done') return null;
    if (state.get(id) === 'visiting') return [...trail.slice(trail.indexOf(id)), id];
    state.set(id, 'visiting');
    trail.push(id);
    for (const next of graph.get(id) ?? []) {
      const found = visit(next);
      if (found) return found;
    }
    trail.pop();
    state.set(id, 'done');
    return null;
  };
  for (const id of graph.keys()) {
    const found = visit(id);
    if (found) return found;
  }
  return null;
}
```

- [ ] **Step 7: Crear `seed/package.ts`**

```ts
import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import * as z from 'zod/v4';
import { catalogProblems, catalogSchema, slug, toCatalogItems } from '../src/catalog/schema.js';
import { resolveDue } from '../src/domain/dates.js';
import type { CatalogItem } from '../src/domain/types.js';
import { listTemplates, loadTemplate, parseProfile } from '../src/profiles/load.js';
import type { Profile } from '../src/profiles/schema.js';
import { formatIssues } from '../src/validation/issues.js';

function isTimeZone(tz: string): boolean {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

const businessFileSchema = z.object({
  name: z.string().min(1),
  timezone: z.string().refine(isTimeZone, 'not a known time zone'),
  taxRateBps: z.number().int().min(0).max(5000),
  firstOrderNumber: z.number().int().positive().default(1),
  template: z.string().min(1).optional(),
  profile: z.unknown().optional()
}).strict().refine(b => (b.template === undefined) !== (b.profile === undefined), {
  message: 'set either template or profile, not both (and not neither)', path: ['template']
});

const demoOrderSchema = z.object({
  stage: z.string().min(1),
  fields: z.record(z.string(), z.string()).default({}),
  due: z.string().optional(),
  lines: z.array(z.string()).default([]),
  hoursAgo: z.number().positive().optional()
}).strict();

const demoCustomerSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  asset: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  order: demoOrderSchema.optional()
}).strict();

const demoFileSchema = z.object({
  historySeed: z.number().int().optional(),
  customers: z.array(demoCustomerSchema).default([])
}).strict();

export type DemoOrder = z.output<typeof demoOrderSchema>;
export type DemoCustomer = z.output<typeof demoCustomerSchema>;
export type DemoFile = z.output<typeof demoFileSchema>;

export interface BusinessPackage {
  id: string;
  name: string;
  timezone: string;
  taxRateBps: number;
  firstOrderNumber: number;
  profile: Profile;
  profileSource: string;
  items: CatalogItem[];
  demo: DemoFile;
}

export type PackageCheck = { ok: true; pkg: BusinessPackage } | { ok: false; problems: string[] };

/** Lee un YAML del paquete. `undefined` si falta y es opcional; los problemas van a `problems`. */
function readYaml(dir: string, file: string, required: boolean, problems: string[]): unknown {
  const full = path.join(dir, file);
  if (!fs.existsSync(full)) {
    if (required) problems.push(`${file}: file not found`);
    return undefined;
  }
  try {
    return parseYaml(fs.readFileSync(full, 'utf8')) ?? {};
  } catch (err) {
    problems.push(`${file}: not valid YAML (${err instanceof Error ? err.message.split('\n')[0] : String(err)})`);
    return undefined;
  }
}

/** Valida un paquete `seed/businesses/<bizId>/` con los mismos esquemas del servidor (spec B2 §5.1). */
export function checkPackage(dir: string): PackageCheck {
  const problems: string[] = [];
  const id = path.basename(dir);
  if (!slug.safeParse(id).success) {
    problems.push(`folder name "${id}": use lowercase letters, digits and dashes; it becomes the business id`);
  }

  const businessRaw = readYaml(dir, 'business.yaml', true, problems);
  const catalogRaw = readYaml(dir, 'catalog.yaml', true, problems);
  const demoRaw = readYaml(dir, 'demo.yaml', false, problems);

  let business: z.output<typeof businessFileSchema> | undefined;
  if (businessRaw !== undefined) {
    const parsed = businessFileSchema.safeParse(businessRaw);
    if (parsed.success) business = parsed.data;
    else problems.push(...formatIssues(parsed.error).map(p => `business.yaml › ${p}`));
  }

  let profile: Profile | undefined;
  let profileSource = '';
  if (business?.template !== undefined) {
    if (listTemplates().includes(business.template)) {
      profile = loadTemplate(business.template);
      profileSource = `template:${business.template}`;
    } else {
      problems.push(`business.yaml › template: there is no template "${business.template}"; use one of ${listTemplates().join(', ')}, or write your own profile`);
    }
  } else if (business?.profile !== undefined) {
    try {
      profile = parseProfile(business.profile);
      profileSource = 'package';
    } catch (err) {
      if (err instanceof z.ZodError) problems.push(...formatIssues(err, 'profile').map(p => `business.yaml › ${p}`));
      else problems.push(`business.yaml › profile: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  let items: CatalogItem[] | undefined;
  if (catalogRaw !== undefined) {
    const parsed = catalogSchema.safeParse(catalogRaw);
    if (parsed.success) {
      const found = catalogProblems(parsed.data.items, 'items');
      if (found.length === 0) items = toCatalogItems(parsed.data.items);
      else problems.push(...found.map(p => `catalog.yaml › ${p}`));
    } else {
      problems.push(...formatIssues(parsed.error).map(p => `catalog.yaml › ${p}`));
    }
  }

  let demo: DemoFile = { customers: [] };
  if (demoRaw !== undefined) {
    const parsed = demoFileSchema.safeParse(demoRaw);
    if (parsed.success) demo = parsed.data;
    else problems.push(...formatIssues(parsed.error).map(p => `demo.yaml › ${p}`));
  }
  if (business && profile && items) {
    problems.push(...demoProblems(demo, profile, items, business.timezone).map(p => `demo.yaml › ${p}`));
  }

  if (problems.length > 0 || !business || !profile || !items) return { ok: false, problems };
  return {
    ok: true,
    pkg: {
      id, name: business.name, timezone: business.timezone, taxRateBps: business.taxRateBps,
      firstOrderNumber: business.firstOrderNumber, profile, profileSource, items, demo
    }
  };
}

/** Lo mismo que checkPackage, pero lanza con todos los problemas. Para la siembra. */
export function loadPackage(dir: string): BusinessPackage {
  const result = checkPackage(dir);
  if (!result.ok) throw new Error(`El paquete ${dir} no es válido:\n- ${result.problems.join('\n- ')}`);
  return result.pkg;
}

function demoProblems(demo: DemoFile, profile: Profile, items: CatalogItem[], timezone: string): string[] {
  const problems: string[] = [];
  const openStages = new Set(profile.stages.map(s => s.id).filter(s => s !== profile.closedStage));
  const itemIds = new Set(items.map(i => i.id));
  demo.customers.forEach((c, i) => {
    const at = `customers[${i}]`;
    if (c.asset && !profile.asset) problems.push(`${at}.asset: this profile has no asset; remove it`);
    if (profile.asset && c.order) {
      if (!c.asset) problems.push(`${at}.asset: the profile needs a ${profile.asset.noun} for every order`);
      for (const f of profile.asset.fields) {
        const value = c.asset?.[f.id];
        if (f.required && value === undefined) problems.push(`${at}.asset.${f.id}: required by the profile`);
        if (value !== undefined && f.type === 'integer' && !Number.isInteger(value)) problems.push(`${at}.asset.${f.id}: must be a whole number`);
      }
    }
    const order = c.order;
    if (!order) return;
    if (!openStages.has(order.stage)) problems.push(`${at}.order.stage: "${order.stage}" is not an open stage; use one of ${[...openStages].join(', ')}`);
    for (const f of profile.orderFields) {
      if (f.required && order.fields[f.id] === undefined) problems.push(`${at}.order.fields.${f.id}: required by the profile`);
    }
    for (const key of Object.keys(order.fields)) {
      if (!profile.orderFields.some(f => f.id === key)) problems.push(`${at}.order.fields.${key}: the profile has no such order field`);
    }
    if (profile.due === 'required' && order.due === undefined) problems.push(`${at}.order.due: required by the profile`);
    if (profile.due === 'none' && order.due !== undefined) problems.push(`${at}.order.due: this profile has no due dates; remove it`);
    if (order.due !== undefined && resolveDue(order.due, timezone, new Date()) === null) {
      problems.push(`${at}.order.due: "${order.due}" is not a day; use a weekday such as saturday or a date like 2026-10-03`);
    }
    order.lines.forEach((line, j) => {
      if (!itemIds.has(line)) problems.push(`${at}.order.lines[${j}]: there is no item with id "${line}"`);
    });
  });
  return problems;
}
```

- [ ] **Step 8: CLI con el subcomando `check`**

Crear `seed/business-cli.ts`:

```ts
import { checkPackage } from './package.js';

// Uso:
//   npm run business:check -- <carpeta>
const [command, ...args] = process.argv.slice(2);
const positional = args.filter(a => !a.startsWith('--'));

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

switch (command) {
  case 'check': {
    const dir = positional[0] ?? fail('Uso: npm run business:check -- <carpeta>');
    const result = checkPackage(dir);
    if (!result.ok) fail(`El paquete tiene ${result.problems.length} problema(s):\n- ${result.problems.join('\n- ')}`);
    console.log(`Paquete "${result.pkg.id}" válido: ${result.pkg.items.length} ítems, perfil ${result.pkg.profileSource}, ${result.pkg.demo.customers.length} clientes de demo.`);
    break;
  }
  default:
    fail('Subcomandos: check');
}
```

En `package.json`, en `scripts`, agregar: `"business:check": "tsx seed/business-cli.ts check",`.

- [ ] **Step 9: Correr las pruebas**

Run: `npx vitest run test/unit/business-package.test.ts test/unit/profiles.test.ts`
Expected: PASS.

- [ ] **Step 10: Verificación completa y commit**

Run: `npm test && npm run typecheck && npm run build` → verde.

```bash
git add src/validation src/catalog src/profiles/load.ts seed/package.ts seed/business-cli.ts package.json test/helpers/packages.ts test/unit/business-package.test.ts test/unit/profiles.test.ts
git commit -m "feat: validate business packages with the server schemas"
```

---

### Task 4: Siembra desde paquetes y `business:add`

**Files:**
- Create: `test/integration/seed-packages.test.ts` (y su snapshot)
- Create: `seed/businesses/shop/{business,catalog,demo}.yaml`, `seed/businesses/bakery/{business,catalog,demo}.yaml` (generados)
- Modify: `seed/run.ts`
- Create: `seed/random.ts`; Delete: `seed/data.ts`
- Create: `seed/business.ts`
- Modify: `seed/business-cli.ts`, `package.json`, `infra/copy-assets.mjs`

**Interfaces:**
- Consumes: `loadPackage`, `BusinessPackage` (Task 3); `Store.putProfile` (Task 1); `issueToken`, `secretsManagerWriter` de `infra/token.ts`; `clearBusinesses`, `ensureTable` de `src/store/table.ts`.
- Produces:
  - En `seed/run.ts`: `PACKAGES_DIR: string`, `seedPackage(store: Store, pkg: BusinessPackage, now: Date): Promise<void>`, `seedAll` (misma firma que hoy), `DEMO_TOKENS`, `DEMO_BUSINESS_IDS` (mismos valores).
  - En `seed/business.ts`: `addBusiness(store: Store, pkg: BusinessPackage, now: Date): Promise<void>` (lanza si el negocio ya existe).
  - `mulberry32` en `seed/random.ts`.

- [ ] **Step 1: Prueba de caracterización de la semilla actual**

Crear `test/integration/seed-packages.test.ts`:

```ts
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../../src/store/memory.js';
import { seedAll } from '../../seed/run.js';

const NOW = new Date('2026-09-15T15:00:00Z'); // martes

/** Huella de lo sembrado: si cambia un precio, un stock, una partida o un cobro, cambia la huella. */
async function fingerprint(store: MemoryStore, bizId: string) {
  const orders = await store.listOrders(bizId);
  const payments = await store.listPayments(bizId, '0000-01-01', '9999-12-31');
  return {
    business: await store.getBusiness(bizId),
    orders: orders.length,
    orderCents: orders.reduce((sum, o) => sum + o.totalCents, 0),
    open: orders.filter(o => !o.id.includes('-hist-'))
      .map(o => `${o.id}:${o.number}:${o.stage}:${o.dueOn ?? '-'}:${o.createdAt}:${JSON.stringify(o.fields)}:${o.lines.map(l => l.itemId).join('+')}:${o.totalCents}`)
      .sort(),
    payments: payments.length,
    paymentCents: payments.reduce((sum, p) => sum + p.amountCents, 0),
    items: (await store.listItems(bizId))
      .map(i => `${i.id}:${i.name}:${i.kind}:${i.unit}:${i.priceCents}:${i.taxable}:${i.stocked}:${i.onHand}:${i.reorderPoint}:${i.reorderQty}:${i.supplierId ?? '-'}:${JSON.stringify(i.consumes)}:${i.synonyms.join('|')}`)
      .sort(),
    customers: (await store.listCustomers(bizId)).map(c => `${c.id}:${c.name}`).sort(),
    assets: (await store.listAssets(bizId)).map(a => `${a.id}:${a.customerId}:${a.spokenLabel}:${JSON.stringify(a.fields)}`).sort()
  };
}

describe('siembra del demo', () => {
  it('siembra exactamente lo mismo que antes de mudarse a paquetes', async () => {
    const store = new MemoryStore();
    await seedAll(store, NOW);
    expect(await fingerprint(store, 'shop')).toMatchSnapshot();
    expect(await fingerprint(store, 'bakery')).toMatchSnapshot();
  });
});
```

Run: `npx vitest run test/integration/seed-packages.test.ts`
Expected: PASS y vitest escribe `test/integration/__snapshots__/seed-packages.test.ts.snap` (primera corrida, con el código viejo).

```bash
git add test/integration/seed-packages.test.ts test/integration/__snapshots__
git commit -m "test: pin the demo seed before moving it to business packages"
```

- [ ] **Step 2: Generar los paquetes desde la semilla actual (script temporal)**

Crear `seed/dump-packages.ts` (se borra en el Step 5; no se commitea):

```ts
import fs from 'node:fs';
import path from 'node:path';
import { stringify } from 'yaml';
import { MemoryStore } from '../src/store/memory.js';
import { BAKERY_ITEMS, SHOP_ITEMS } from './data.js';
import { seedAll } from './run.js';

// Temporal: escribe seed/businesses/{shop,bakery} a partir de la semilla en código, para que la mudanza sea exacta.
const NOW = new Date('2026-09-15T15:00:00Z');
const HOUR_MS = 3600 * 1000;
const DUE: Record<string, string> = {
  'bakery-ord-1': 'wednesday', 'bakery-ord-2': 'saturday', 'bakery-ord-3': 'saturday',
  'bakery-ord-4': 'saturday', 'bakery-ord-5': 'thursday', 'bakery-ord-6': 'monday'
};
const PACKAGES = [
  { id: 'shop', template: 'auto-repair', firstOrderNumber: 41, historySeed: 1234, items: SHOP_ITEMS },
  { id: 'bakery', template: 'bakery', firstOrderNumber: 12, historySeed: 4321, items: BAKERY_ITEMS }
];
const num = (id: string): number => Number(id.split('-').at(-1));

const store = new MemoryStore();
await seedAll(store, NOW, { demoTokens: false });

for (const p of PACKAGES) {
  const business = (await store.getBusiness(p.id))!;
  const dir = path.join(import.meta.dirname, 'businesses', p.id);
  fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(path.join(dir, 'business.yaml'), stringify({
    name: business.name, timezone: business.timezone, taxRateBps: business.taxRateBps,
    firstOrderNumber: p.firstOrderNumber, template: p.template
  }));
  fs.writeFileSync(path.join(dir, 'catalog.yaml'), stringify({ items: p.items.map(({ version: _v, ...item }) => item) }));

  const customers = (await store.listCustomers(p.id)).filter(c => /-cust-\d+$/.test(c.id)).sort((a, b) => num(a.id) - num(b.id));
  const assets = await store.listAssets(p.id);
  const orders = await store.listOrders(p.id);
  fs.writeFileSync(path.join(dir, 'demo.yaml'), stringify({
    historySeed: p.historySeed,
    customers: customers.map(c => {
      const asset = assets.find(a => a.customerId === c.id);
      const order = orders.find(o => o.id === `${p.id}-ord-${num(c.id)}`)!;
      return {
        name: c.name,
        ...(asset ? { asset: asset.fields } : {}),
        order: {
          stage: order.stage,
          ...(Object.keys(order.fields).length > 0 ? { fields: order.fields } : {}),
          ...(DUE[order.id] ? { due: DUE[order.id] } : {}),
          lines: order.lines.map(l => l.itemId),
          hoursAgo: Math.round((NOW.getTime() - Date.parse(order.createdAt)) / HOUR_MS)
        }
      };
    })
  }));
  console.log(`escrito ${dir}`);
}
```

Run: `npx tsx seed/dump-packages.ts`
Expected: `escrito …/seed/businesses/shop` y `…/bakery`. Luego:

Run: `npm run business:check -- seed/businesses/shop && npm run business:check -- seed/businesses/bakery`
Expected: `Paquete "shop" válido: 14 ítems, perfil template:auto-repair, 8 clientes de demo.` y `Paquete "bakery" válido: 12 ítems, perfil template:bakery, 6 clientes de demo.`

- [ ] **Step 3: `seed/random.ts`**

```ts
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

- [ ] **Step 4: Reescribir `seed/run.ts` sobre paquetes**

Reemplazar desde el principio del archivo hasta el final de `seedBakery` (todo lo que está antes del comentario de `seedPayments`) por:

```ts
import path from 'node:path';
import { hashToken } from '../src/http/auth.js';
import { spokenLabel } from '../src/domain/assets.js';
import { businessToday, resolveDue, shiftDays } from '../src/domain/dates.js';
import { newOrder, recalcTotals } from '../src/domain/orders.js';
import type { Business, CatalogItem, Customer, Order, OrderLine, Payment } from '../src/domain/types.js';
import type { Profile } from '../src/profiles/schema.js';
import type { Store } from '../src/store/store.js';
import { loadPackage, type BusinessPackage } from './package.js';
import { mulberry32 } from './random.js';

export const DEMO_TOKENS = { shop: 'demo-shop-token', bakery: 'demo-bakery-token' };

/** Los negocios que siembra el demo. El reset remoto borra y vuelve a sembrar solo estos. */
export const DEMO_BUSINESS_IDS: readonly string[] = ['shop', 'bakery'];

/** Paquetes de negocio (spec B2 §5.1): una carpeta por negocio. */
export const PACKAGES_DIR = path.join(import.meta.dirname, 'businesses');

const HOUR_MS = 3600 * 1000;

/** Siembra los negocios del demo desde sus paquetes. Determinista: la misma corrida produce los mismos datos. */
export async function seedAll(
  store: Store, now: Date = new Date(), opts: { demoTokens?: boolean } = {}
): Promise<void> {
  const demoTokens = opts.demoTokens ?? true;
  for (const id of DEMO_BUSINESS_IDS) {
    await seedPackage(store, loadPackage(path.join(PACKAGES_DIR, id)), now);
    if (demoTokens) await store.putToken(hashToken(DEMO_TOKENS[id as keyof typeof DEMO_TOKENS]), id);
  }
}

/** Siembra un negocio activo: META, perfil, catálogo, clientes y órdenes del demo, y 30 días de historia. */
export async function seedPackage(store: Store, pkg: BusinessPackage, now: Date): Promise<void> {
  const business: Business = {
    id: pkg.id, name: pkg.name, status: 'active', profileVersion: 1, timezone: pkg.timezone,
    taxRateBps: pkg.taxRateBps, nextOrderNumber: pkg.firstOrderNumber, version: 1
  };
  await store.putBusiness(business);
  await store.putProfile(pkg.id, { profile: pkg.profile, source: pkg.profileSource, version: 1 });
  await store.putItems(pkg.id, pkg.items);
  await seedDemo(store, business, pkg, now);
  await seedPayments(store, business, pkg.profile, pkg.items, now, pkg.demo.historySeed ?? seedFrom(pkg.id));
}

/** Semilla del PRNG a partir del id, para paquetes sin `historySeed`. */
function seedFrom(id: string): number {
  return [...id].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) | 0, 7);
}

/** Clientes, activos y órdenes abiertas de `demo.yaml`. */
async function seedDemo(store: Store, biz: Business, pkg: BusinessPackage, now: Date): Promise<void> {
  let n = 0;
  for (const c of pkg.demo.customers) {
    n += 1;
    const customerId = `${biz.id}-cust-${n}`;
    const customer: Customer = { id: customerId, name: c.name, nameNormalized: c.name.toLowerCase() };
    if (c.phone) customer.phone = c.phone;
    await store.putCustomer(biz.id, customer);

    let assetId: string | undefined;
    if (c.asset && pkg.profile.asset) {
      assetId = `${biz.id}-asset-${n}`;
      await store.putAsset(biz.id, { id: assetId, customerId, fields: c.asset, spokenLabel: spokenLabel(pkg.profile.asset, c.asset) });
    }
    if (!c.order) continue;

    // Escalonadas hacia atrás: si todas nacieran "ahora", la ventana de idempotencia de open
    // (§7.8) quedaría armada en cada arranque y el siguiente pedido se leería como repetido.
    const createdAt = new Date(now.getTime() - (c.order.hoursAgo ?? n * 5 + 2) * HOUR_MS);
    // Vencimientos por día de la semana: "tres para el sábado" es cierto siembres el día que siembres.
    const dueOn = c.order.due ? resolveDue(c.order.due, biz.timezone, now) ?? undefined : undefined;
    const order = recalcTotals({
      ...newOrder({
        id: `${biz.id}-ord-${n}`, number: await store.takeOrderNumber(biz.id),
        customerId, assetId, fields: c.order.fields, dueOn, stage: c.order.stage, now: createdAt
      }),
      lines: c.order.lines.map(id => line(itemById(pkg.items, id), 1))
    }, biz.taxRateBps);
    await store.putOrder(biz.id, order);
  }
}
```

El resto del archivo (`seedPayments`, `sellable`, `itemById`, `line`, `pickItems`) queda igual. Borrar `seed/data.ts` y reemplazar cualquier otro import suyo:

```bash
git rm seed/data.ts
grep -rn "seed/data\|from './data.js'\|SHOP_ITEMS\|BAKERY_ITEMS" src seed infra test
```

Si alguna prueba usa `SHOP_ITEMS` o `BAKERY_ITEMS`, cambiarlo por `loadPackage(path.join(PACKAGES_DIR, 'shop')).items` (o `'bakery'`), con `import { PACKAGES_DIR } from '../../seed/run.js'` y `import { loadPackage } from '../../seed/package.js'`.

- [ ] **Step 5: La prueba de caracterización sigue pasando**

Run: `rm seed/dump-packages.ts && npx vitest run test/integration/seed-packages.test.ts test/integration/seed.test.ts`
Expected: PASS **sin actualizar el snapshot**. Si falla, la diferencia dice qué campo de los YAML no coincide; corregir el YAML (nunca el snapshot).

- [ ] **Step 6: Los paquetes pasan el chequeo y `addBusiness` no duplica**

Agregar a `test/integration/seed-packages.test.ts`:

```ts
import { checkPackage, loadPackage } from '../../seed/package.js';
import { addBusiness } from '../../seed/business.js';
import { PACKAGES_DIR } from '../../seed/run.js';

describe('paquetes del demo', () => {
  for (const id of ['shop', 'bakery']) {
    it(`${id} pasa business:check`, () => {
      expect(checkPackage(path.join(PACKAGES_DIR, id))).toMatchObject({ ok: true });
    });
  }

  it('addBusiness siembra un paquete y se niega a sembrarlo dos veces', async () => {
    const store = new MemoryStore();
    const pkg = loadPackage(path.join(PACKAGES_DIR, 'bakery'));
    await addBusiness(store, pkg, NOW);
    expect((await store.getBusiness('bakery'))?.status).toBe('active');
    await expect(addBusiness(store, pkg, NOW)).rejects.toThrow(/Ya existe el negocio "bakery"/);
  });
});
```

Run: `npx vitest run test/integration/seed-packages.test.ts`
Expected: FAIL — `Cannot find module '../../seed/business.js'`.

- [ ] **Step 7: Crear `seed/business.ts`**

```ts
import type { Store } from '../src/store/store.js';
import type { BusinessPackage } from './package.js';
import { seedPackage } from './run.js';

/** Siembra un paquete como negocio nuevo. No pisa uno existente: para eso está --reset en la CLI. */
export async function addBusiness(store: Store, pkg: BusinessPackage, now: Date): Promise<void> {
  if (await store.getBusiness(pkg.id)) {
    throw new Error(`Ya existe el negocio "${pkg.id}". Para volver a sembrarlo usa --reset.`);
  }
  await seedPackage(store, pkg, now);
}
```

Run: `npx vitest run test/integration/seed-packages.test.ts` → PASS.

- [ ] **Step 8: Subcomando `add` y assets del build**

En `seed/business-cli.ts`, reemplazar los imports y agregar el caso `add` antes de `default`:

```ts
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { openStore, storeConfig } from '../src/store/from-env.js';
import type { Store } from '../src/store/store.js';
import { clearBusinesses, ensureTable } from '../src/store/table.js';
import { issueToken, secretsManagerWriter } from '../infra/token.js';
import { addBusiness } from './business.js';
import { checkPackage, loadPackage } from './package.js';
```

```ts
  case 'add': {
    const dir = positional[0] ?? fail('Uso: npm run business:add -- <carpeta> [--secret] [--reset]');
    const pkg = loadPackage(dir);
    const { store, client, local, table, region } = openDynamo();
    if (local) await ensureTable(client, table);
    if (args.includes('--reset')) {
      requireRemoteReset(local, pkg.id);
      await clearBusinesses(client, table, [pkg.id]);
    }
    await addBusiness(store, pkg, new Date());
    console.error(`Negocio "${pkg.id}" sembrado desde ${dir}.`);
    // Con --reset los tokens ya emitidos siguen valiendo: la tabla no los borra.
    if (!args.includes('--reset')) await emitToken(store, pkg.id, args.includes('--secret'), region);
    break;
  }
```

y al final del archivo:

```ts
function openDynamo() {
  const cfg = storeConfig(process.env);
  if (cfg.kind !== 'dynamo') fail('Esta CLI escribe en la tabla: usa COUNTERPART_STORE=dynamo (con DYNAMODB_ENDPOINT para DynamoDB Local).');
  const { store, client } = openStore(cfg);
  return { store, client: client!, local: cfg.endpoint !== undefined, table: cfg.table, region: cfg.region };
}

function requireRemoteReset(local: boolean, bizId: string): void {
  if (!local && process.env.COUNTERPART_ALLOW_REMOTE_RESET !== '1') {
    fail(`Sin DYNAMODB_ENDPOINT esto apunta a AWS. Para borrar y volver a crear "${bizId}" en la tabla remota define COUNTERPART_ALLOW_REMOTE_RESET=1.`);
  }
}

async function emitToken(store: Store, bizId: string, toSecret: boolean, region: string): Promise<void> {
  const putSecret = toSecret ? secretsManagerWriter(new SecretsManagerClient({ region })) : undefined;
  const { token, secretName } = await issueToken({ store, putSecret }, bizId);
  if (secretName) {
    console.error(`Token emitido y guardado en el secreto "${secretName}". En la tabla solo queda su hash.`);
  } else {
    console.log(token);
    console.error('Token emitido. Guárdalo ahora: en la tabla solo queda su hash.');
  }
}
```

Actualizar el comentario de uso del principio (`//   npm run business:add -- <carpeta> [--secret] [--reset]`) y el mensaje de `default` (`'Subcomandos: check, add'`).

En `package.json` → `scripts`: `"business:add": "tsx seed/business-cli.ts add",`.

En `infra/copy-assets.mjs`, agregar al final:

```js
// Los paquetes de negocio: la siembra en memoria los lee al arrancar también desde dist/.
fs.cpSync('seed/businesses', 'dist/seed/businesses', { recursive: true });
```

- [ ] **Step 9: Probar `business:add` contra DynamoDB Local (si Docker está disponible)**

Run: `npm run dynamo:up`, esperar unos segundos, y luego
`npx cross-env COUNTERPART_STORE=dynamo DYNAMODB_ENDPOINT=http://localhost:8000 npm run business:add -- seed/businesses/bakery`
Expected: `Negocio "bakery" sembrado…` en stderr y un token en stdout. Repetir el comando → `Ya existe el negocio "bakery". Para volver a sembrarlo usa --reset.` y salida 1. Luego `npm run dynamo:down`. Sin Docker: anotarlo en el registro y seguir.

- [ ] **Step 10: Verificación completa y commit**

Run: `npm test && npm run typecheck && npm run build && test -f dist/seed/businesses/shop/catalog.yaml && echo ok`
Expected: todo verde y `ok`.

```bash
git add -A seed infra/copy-assets.mjs package.json test/integration/seed-packages.test.ts
git commit -m "feat: seed businesses from data packages and add business:add"
```

---

### Task 5: Negocio en blanco, tercer paquete y guía

**Files:**
- Modify: `seed/business.ts`, `seed/business-cli.ts`, `package.json`
- Create: `seed/businesses/bike-shop/{business,catalog,demo}.yaml`
- Modify: `src/tools/specs.ts` (ids con guion bajo dichos como palabras)
- Create: `test/integration/third-business.test.ts`
- Modify: `test/unit/tool-specs.test.ts`
- Create: `docs/add-a-business.md`
- Modify: `README.md` (sección "Adding a business")

**Interfaces:**
- Consumes: `seedPackage`, `PACKAGES_DIR` (Task 4); `loadPackage` (Task 3); `toolContext` (Task 2).
- Produces:
  - `interface BlankInput { id: string; name: string; timezone?: string; taxRateBps?: number }` y `newBlankBusiness(store: Store, input: BlankInput): Promise<Business>` en `seed/business.ts` (estado `blank`, `profileVersion: 0`, `nextOrderNumber: 1`, zona `America/Chicago` y 825 bps por defecto; lanza si el id no es slug o si ya existe).
  - `spokenId(id: string): string` exportada de `src/tools/specs.ts` (`card_message` → `card message`).

- [ ] **Step 1: Pruebas del negocio en blanco y del tercer paquete**

Crear `test/integration/third-business.test.ts`:

```ts
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { McpServer } from '@modelcontextprotocol/server';
import { MemoryStore } from '../../src/store/memory.js';
import { registerTools } from '../../src/tools/context.js';
import { loadPackage } from '../../seed/package.js';
import { newBlankBusiness } from '../../seed/business.js';
import { PACKAGES_DIR, seedPackage } from '../../seed/run.js';
import { toolContext } from '../helpers/context.js';

const NOW = new Date('2026-09-29T15:00:00Z');
const text = (r: { content: unknown[] }): string => (r.content[0] as { text: string }).text;

describe('un negocio nuevo sin código', () => {
  it('el paquete bike-shop sirve sus nueve tools con sus propios nombres', async () => {
    const store = new MemoryStore();
    const pkg = loadPackage(path.join(PACKAGES_DIR, 'bike-shop'));
    await seedPackage(store, pkg, NOW);

    const server = new McpServer({ name: 'counterpart', version: '0.1.0' });
    let n = 0;
    registerTools(server, await toolContext(store, 'bike-shop', { now: () => NOW, newId: p => `${p}-${++n}` }));
    const [clientEnd, serverEnd] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test', version: '1.0.0' });
    await server.server.connect(serverEnd);
    await client.connect(clientEnd);

    const names = (await client.listTools()).tools.map(t => t.name).sort();
    expect(names).toEqual(Object.values(pkg.profile.toolNames).sort());

    const opened = await client.callTool({
      name: 'check_in_bike', arguments: { customerName: 'Kai Moreno', asset: { brand: 'Trek', model: 'Domane' } }
    });
    expect(opened.isError).toBeFalsy();
    const found = await client.callTool({ name: 'find_repairs', arguments: { query: 'the Trek' } });
    expect(text(found)).toContain('Kai Moreno');
  });

  it('crea un negocio en blanco listo para el asistente', async () => {
    const store = new MemoryStore();
    const business = await newBlankBusiness(store, { id: 'florist', name: 'Petal and Stem' });
    expect(business).toMatchObject({ status: 'blank', profileVersion: 0, nextOrderNumber: 1, timezone: 'America/Chicago' });
    expect(await store.getProfile('florist')).toBeNull();
    await expect(newBlankBusiness(store, { id: 'florist', name: 'Again' })).rejects.toThrow(/Ya existe/);
    await expect(newBlankBusiness(store, { id: 'Petal Stem', name: 'x' })).rejects.toThrow(/no sirve/);
  });
});
```

En `test/unit/tool-specs.test.ts`, agregar dentro del `describe` principal:

```ts
  it('dice los ids de campo con guion bajo como palabras', () => {
    const florist = { ...bakery, orderFields: [{ id: 'card_message', type: 'string' as const, required: true }] };
    const schema = openInput(florist);
    const described = (schema.shape as Record<string, { description?: string }>).card_message?.description;
    expect(described).toBe('The card message of the cake order, as the user said it.');
    expect(toolSpecs(florist).open.description).toContain("Needed: the customer's name, card message and the due date.");
  });
```

(si `openInput` no está importado en ese archivo, sumarlo al import de `../../src/tools/specs.js`).

- [ ] **Step 2: Correr y ver fallar**

Run: `npx vitest run test/integration/third-business.test.ts test/unit/tool-specs.test.ts`
Expected: FAIL — no existe `seed/businesses/bike-shop`, `newBlankBusiness` no exportada, y la descripción dice `card_message`.

- [ ] **Step 3: Ids dichos como palabras en `src/tools/specs.ts`**

Agregar arriba de `neededToOpen`:

```ts
/** Un id de campo dicho en voz alta: `card_message` → `card message`. */
export const spokenId = (id: string): string => id.replace(/_/g, ' ');
```

En `neededToOpen`, cambiar `.map(f => f.id)` por `.map(f => spokenId(f.id))`. En `fieldSchema`, cambiar `` `The ${field.id} of the ${owner}, as the user said it.` `` por `` `The ${spokenId(field.id)} of the ${owner}, as the user said it.` ``.

- [ ] **Step 4: `newBlankBusiness` y subcomando `new`**

En `seed/business.ts`, agregar:

```ts
import type { Business } from '../src/domain/types.js';

export interface BlankInput { id: string; name: string; timezone?: string; taxRateBps?: number }

/** Un negocio en blanco: solo expone las tools de alta hasta que el asistente lo configura (spec B2 §5.2). */
export async function newBlankBusiness(store: Store, input: BlankInput): Promise<Business> {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(input.id)) {
    throw new Error(`El id "${input.id}" no sirve: usa minúsculas, dígitos y guiones.`);
  }
  if (await store.getBusiness(input.id)) {
    throw new Error(`Ya existe el negocio "${input.id}". Para dejarlo en blanco otra vez usa --reset.`);
  }
  const business: Business = {
    id: input.id, name: input.name, status: 'blank', profileVersion: 0,
    timezone: input.timezone ?? 'America/Chicago', taxRateBps: input.taxRateBps ?? 825,
    nextOrderNumber: 1, version: 1
  };
  await store.putBusiness(business);
  return business;
}
```

En `seed/business-cli.ts`, sumar `newBlankBusiness` al import de `./business.js` y agregar el caso antes de `default`:

```ts
  case 'new': {
    const [bizId, name] = positional;
    if (!bizId || !name) fail('Uso: npm run business:new -- <bizId> "<nombre>" [--secret] [--reset]');
    const { store, client, local, table, region } = openDynamo();
    if (local) await ensureTable(client, table);
    const reset = args.includes('--reset');
    if (reset) {
      requireRemoteReset(local, bizId);
      await clearBusinesses(client, table, [bizId]);
    }
    await newBlankBusiness(store, { id: bizId, name });
    console.error(`Negocio en blanco "${bizId}" (${name}) creado. Solo expone las tools de alta.`);
    if (!reset) await emitToken(store, bizId, args.includes('--secret'), region);
    break;
  }
```

Actualizar el comentario de uso (`//   npm run business:new -- <bizId> "<nombre>" [--secret] [--reset]`) y `default` (`'Subcomandos: check, add, new'`). En `package.json` → `scripts`: `"business:new": "tsx seed/business-cli.ts new",`.

- [ ] **Step 5: El paquete `bike-shop`, escrito a mano**

`seed/businesses/bike-shop/business.yaml`:

```yaml
name: Spoke and Chain Cycles
timezone: America/Denver
taxRateBps: 790
firstOrderNumber: 100
profile:
  id: bike-repair
  nouns: { order: repair, orders: repairs, item: part, items: parts, customer: rider }
  synonyms:
    order: [tune-up, job, ticket]
    item: [part, tube, tire]
  toolNames:
    snapshot: get_bike_shop_snapshot
    find: find_repairs
    open: check_in_bike
    move: move_repair_stage
    addLine: add_to_repair
    stock: check_bike_parts
    reorder: reorder_bike_parts
    closeOut: close_out_repair
    salesReport: sales_report
  stages:
    - { id: checked_in, label: checked in }
    - { id: repairing, label: being repaired }
    - { id: ready, label: ready for pickup }
    - { id: picked_up, label: picked up }
  closedStage: picked_up
  closeFrom: [ready]
  asset:
    noun: bike
    fields:
      - { id: brand, type: string, required: true }
      - { id: model, type: string, required: true }
      - { id: color, type: string, required: false }
    spokenAs: "{brand} {model}"
  orderFields: []
  due: optional
```

`seed/businesses/bike-shop/catalog.yaml`:

```yaml
items:
  - { id: tune-up, name: Basic tune-up, synonyms: [tune up], kind: labor, unit: job, priceCents: 7500, taxable: false, stocked: false }
  - { id: flat-fix, name: Flat fix, synonyms: [flat, puncture], kind: labor, unit: job, priceCents: 1500, taxable: false, stocked: false, consumes: { tube-700c: 1 } }
  - { id: brake-adjust, name: Brake adjustment, kind: labor, unit: job, priceCents: 2000, taxable: false, stocked: false }
  - { id: tube-700c, name: 700c inner tube, synonyms: [tube, inner tube], kind: part, priceCents: 900, stocked: true, onHand: 6, reorderPoint: 10, reorderQty: 30, supplierId: velo-supply }
  - { id: tire-700c, name: 700c tire, synonyms: [road tire], kind: part, priceCents: 4500, stocked: true, onHand: 8, reorderPoint: 4, reorderQty: 12, supplierId: velo-supply }
  - { id: chain, name: Chain, kind: part, priceCents: 3200, stocked: true, onHand: 3, reorderPoint: 4, reorderQty: 10, supplierId: velo-supply }
  - { id: brake-pads, name: Brake pads, synonyms: [pads], kind: part, priceCents: 1800, stocked: true, onHand: 12, reorderPoint: 6, reorderQty: 20, supplierId: velo-supply }
  - { id: bar-tape, name: Bar tape, kind: part, priceCents: 2500, stocked: true, onHand: 5, reorderPoint: 3, reorderQty: 10 }
```

`seed/businesses/bike-shop/demo.yaml`:

```yaml
customers:
  - name: Lena Park
    asset: { brand: Specialized, model: Allez, color: red }
    order: { stage: checked_in, lines: [tune-up] }
  - name: Omar Diaz
    asset: { brand: Cannondale, model: Topstone }
    order: { stage: repairing, lines: [flat-fix, tube-700c] }
  - name: June Okafor
    asset: { brand: Giant, model: Escape }
    order: { stage: ready, lines: [brake-adjust, brake-pads] }
```

Run: `npm run business:check -- seed/businesses/bike-shop`
Expected: `Paquete "bike-shop" válido: 8 ítems, perfil package, 3 clientes de demo.`

- [ ] **Step 6: Correr las pruebas**

Run: `npx vitest run test/integration/third-business.test.ts test/unit/tool-specs.test.ts`
Expected: PASS.

- [ ] **Step 7: Guía `docs/add-a-business.md`**

````markdown
# Add your business in 15 minutes

Counterpart runs any business that takes an order, moves it through a few steps and charges for it: a repair shop, a bakery, a bike shop, a florist. A new business is data, not code. You can write it by hand as a **business package**, or say it out loud to the **setup assistant**.

## Option 1: a business package

A package is one folder under `seed/businesses/`. The folder name becomes the business id (lowercase letters, digits and dashes).

```
seed/businesses/bike-shop/
  business.yaml   # name, time zone, tax, first order number, and the profile
  catalog.yaml    # what you sell and what you stock
  demo.yaml       # optional: customers and open orders for a demo
```

### business.yaml

```yaml
name: Spoke and Chain Cycles
timezone: America/Denver      # an IANA time zone
taxRateBps: 790               # 7.90% in basis points
firstOrderNumber: 100
template: auto-repair         # reuse a built-in profile...
# profile: { ... }            # ...or write your own (see seed/businesses/bike-shop)
```

The profile is the vocabulary Alexa speaks: what you call an order and an item, the steps an order goes through (`stages`), which step means finished and paid (`closedStage`) and from which steps it can be closed (`closeFrom`), the nine tool names in your own words, an optional asset the customer brings in (a car, a bike) and the details every order records (`orderFields`). Built-in templates live in `src/profiles/`.

### catalog.yaml

```yaml
items:
  - { id: tune-up, name: Basic tune-up, kind: labor, unit: job, priceCents: 7500, taxable: false, stocked: false }
  - { id: tube-700c, name: 700c inner tube, synonyms: [tube], kind: part, priceCents: 900,
      stocked: true, onHand: 6, reorderPoint: 10, reorderQty: 30, supplierId: velo-supply }
  - { id: flat-fix, name: Flat fix, kind: labor, unit: job, priceCents: 1500, taxable: false,
      stocked: false, consumes: { tube-700c: 1 } }
```

- `kind`: `product` or `labor` for what customers buy; `part`, `supply` or `ingredient` for what you stock.
- `priceCents`: a whole number of cents (`4500` is $45.00).
- `stocked: true` items are counted; `reorderPoint` and `reorderQty` drive "reorder what's low".
- `consumes`: which stocked items one unit uses up. A flat fix uses one tube.

### demo.yaml (optional)

```yaml
customers:
  - name: Lena Park
    asset: { brand: Specialized, model: Allez }
    order: { stage: checked_in, lines: [tune-up] }
```

Every package also gets 30 days of sales history generated from its catalog, so the sales report has something to show.

### Check it, then add it

```bash
npm run business:check -- seed/businesses/bike-shop
COUNTERPART_STORE=dynamo npm run business:add -- seed/businesses/bike-shop --secret
```

`business:check` uses the same schemas as the server and names the exact field to fix, for example `catalog.yaml › items[3].priceCents: … write the price in cents as a whole number`. `business:add` seeds the business and issues its token; `--secret` stores the token in AWS Secrets Manager (`counterpart/<id>/token`) instead of printing it.

## Option 2: the setup assistant, by voice

Create an empty business and give it a token:

```bash
COUNTERPART_STORE=dynamo npm run business:new -- florist "Petal and Stem" --secret
```

A blank business exposes only three tools. Connect an Alexa bridge to it (see the README) and talk:

> "I run a flower shop. We take orders for bouquets and centerpieces, arrange them, and they're ready for pickup or delivery."
> "What did you come up with?"
> "Yes, turn it on."

Counterpart drafts a profile and a catalog with Amazon Nova 2 Lite, checks them with the same rules as a package, and turns nothing on until you say yes. Open the skill again and the business answers with its own nine tools.
````

- [ ] **Step 8: README, sección "Adding a business"**

Reemplazar el párrafo de la sección `## Adding a business` por:

```markdown
A new business is data, not code: a folder under `seed/businesses/` with `business.yaml`, `catalog.yaml` and an optional `demo.yaml`, checked with `npm run business:check -- <folder>` and seeded with `npm run business:add -- <folder>`. Or create an empty one with `npm run business:new -- <id> "<name>"` and configure it by voice with the setup assistant. See [docs/add-a-business.md](docs/add-a-business.md); `seed/businesses/bike-shop` was written by hand without touching code.
```

- [ ] **Step 9: Verificación completa y commit**

Run: `npm test && npm run typecheck && npm run build` → verde.

```bash
git add seed src/tools/specs.ts test/integration/third-business.test.ts test/unit/tool-specs.test.ts docs/add-a-business.md README.md package.json
git commit -m "feat: blank businesses, a hand-written bike shop package and the add-a-business guide"
```

---

## Fase B — Asistente de configuración por voz (spec §5.2–5.4)

### Task 6: Validación del borrador

**Files:**
- Create: `src/setup/validate.ts`
- Create: `test/fixtures/setup/florist.json`
- Create: `test/helpers/setup.ts`
- Create: `test/unit/setup-validate.test.ts`

**Interfaces:**
- Consumes: `profileSchema`, `TOOL_KEYS`, `parseProfile` (Tasks 2–3); `catalogSchema`, `catalogProblems`, `toCatalogItems` (Task 3); `formatIssues` (Task 3).
- Produces (en `src/setup/validate.ts`):
  - `SETUP_TOOL_NAMES = ['set_up_my_business', 'review_business_setup', 'activate_business_setup'] as const`
  - `MAX_STAGES = 8`, `MIN_ITEMS = 5`, `MAX_ITEMS = 60`
  - `draftSchema` (zod: `{ profile, catalog }`, estricto)
  - `interface ValidSetup { profile: Profile; items: CatalogItem[] }`
  - `type SetupCheck = { ok: true; setup: ValidSetup } | { ok: false; errors: string[] }`
  - `validateSetup(raw: unknown): SetupCheck`
  - `STAGES_QUESTION`, `CATALOG_QUESTION`, `GENERIC_QUESTION` (strings) y `spokenFailure(errors: string[]): string`
- Produces (en `test/helpers/setup.ts`): `floristDraft(): any` (copia fresca del fixture) y `scriptedGenerator(...replies: Array<unknown | Error>)` (se completa en la Task 7).

- [ ] **Step 1: Fixture de un borrador válido**

Crear `test/fixtures/setup/florist.json`:

```json
{
  "profile": {
    "id": "flower-shop",
    "nouns": { "order": "flower order", "orders": "flower orders", "item": "flower", "items": "flowers", "customer": "customer" },
    "synonyms": { "order": ["order", "arrangement", "bouquet order"], "item": ["stem", "flower", "supply"] },
    "toolNames": {
      "snapshot": "get_flower_shop_snapshot", "find": "find_flower_orders", "open": "take_flower_order",
      "move": "move_flower_order_stage", "addLine": "add_to_flower_order", "stock": "check_flowers",
      "reorder": "reorder_flowers", "closeOut": "close_out_flower_order", "salesReport": "sales_report"
    },
    "stages": [
      { "id": "ordered", "label": "ordered" },
      { "id": "arranging", "label": "arranging" },
      { "id": "ready", "label": "ready" },
      { "id": "out_for_delivery", "label": "out for delivery" },
      { "id": "delivered", "label": "delivered" }
    ],
    "closedStage": "delivered",
    "closeFrom": ["ready", "out_for_delivery"],
    "asset": null,
    "orderFields": [
      { "id": "arrangement", "type": "string", "required": true },
      { "id": "card_message", "type": "string", "required": false }
    ],
    "due": "required"
  },
  "catalog": {
    "items": [
      { "id": "dozen-roses", "name": "Dozen roses bouquet", "synonyms": ["dozen roses", "roses"], "kind": "product", "unit": "bouquet", "priceCents": 6500, "stocked": false, "consumes": { "rose-stem": 12, "wrap": 1 } },
      { "id": "seasonal-bouquet", "name": "Seasonal bouquet", "synonyms": ["seasonal"], "kind": "product", "unit": "bouquet", "priceCents": 4500, "stocked": false, "consumes": { "wrap": 1 } },
      { "id": "centerpiece", "name": "Table centerpiece", "kind": "product", "unit": "each", "priceCents": 8500, "stocked": false, "consumes": { "vase": 1 } },
      { "id": "delivery", "name": "Delivery", "kind": "product", "unit": "trip", "priceCents": 1500, "taxable": false, "stocked": false },
      { "id": "rose-stem", "name": "Red rose stem", "synonyms": ["rose"], "kind": "supply", "unit": "stem", "priceCents": 250, "stocked": true, "onHand": 40, "reorderPoint": 48, "reorderQty": 100, "supplierId": "wholesale-flowers" },
      { "id": "wrap", "name": "Bouquet wrap", "kind": "supply", "unit": "sheet", "priceCents": 80, "stocked": true, "onHand": 60, "reorderPoint": 20, "reorderQty": 100 },
      { "id": "vase", "name": "Glass vase", "kind": "supply", "unit": "each", "priceCents": 600, "stocked": true, "onHand": 12, "reorderPoint": 6, "reorderQty": 24 }
    ]
  }
}
```

Crear `test/helpers/setup.ts`:

```ts
import fs from 'node:fs';

const FLORIST = new URL('../fixtures/setup/florist.json', import.meta.url);

/** Borrador válido de una florería, tal como lo devolvería Nova. Copia fresca en cada llamada. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function floristDraft(): any {
  return JSON.parse(fs.readFileSync(FLORIST, 'utf8'));
}
```

- [ ] **Step 2: Escribir las pruebas**

Crear `test/unit/setup-validate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  CATALOG_QUESTION, GENERIC_QUESTION, STAGES_QUESTION, spokenFailure, validateSetup
} from '../../src/setup/validate.js';
import { floristDraft } from '../helpers/setup.js';

const errorsOf = (raw: unknown): string[] => {
  const result = validateSetup(raw);
  return result.ok ? [] : result.errors;
};

describe('validación del borrador del asistente', () => {
  it('acepta un borrador válido y completa los valores por defecto', () => {
    const result = validateSetup(floristDraft());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.setup.items).toHaveLength(7);
      expect(result.setup.items[0]).toMatchObject({ taxable: true, onHand: 0, version: 1 });
      expect(result.setup.profile.closedStage).toBe('delivered');
    }
  });

  it('capa 1: el esquema señala la ruta exacta', () => {
    const d = floristDraft();
    d.catalog.items[0].priceCents = 0;
    expect(errorsOf(d).join('\n')).toMatch(/catalog\.items\[0\]\.priceCents/);
  });

  it('capa 2: las reglas del perfil del servidor', () => {
    const d = floristDraft();
    d.profile.closedStage = 'done';
    expect(errorsOf(d)).toEqual(['profile: closedStage "done" is not one of the stages']);
  });

  it('capa 3: una tool no puede llamarse como una de alta', () => {
    const d = floristDraft();
    d.profile.toolNames.find = 'review_business_setup';
    expect(errorsOf(d).join('\n')).toMatch(/profile\.toolNames\.find: "review_business_setup" is reserved/);
  });

  it('capa 3: como máximo 8 etapas', () => {
    const d = floristDraft();
    d.profile.stages = Array.from({ length: 9 }, (_, i) => ({ id: `s${i}`, label: `step ${i}` }));
    d.profile.closedStage = 's8';
    d.profile.closeFrom = ['s7'];
    expect(errorsOf(d).join('\n')).toMatch(/9 stages is too many; use at most 8/);
  });

  it('capa 3: entre 5 y 60 ítems', () => {
    const d = floristDraft();
    d.catalog.items = d.catalog.items.slice(3); // 4 ítems, sin consumes rotos
    expect(errorsOf(d).join('\n')).toMatch(/4 items; use between 5 and 60/);
  });

  it('capa 3: consumes hacia ítems existentes y sin ciclos', () => {
    const d = floristDraft();
    d.catalog.items[1].consumes = { ribbon: 1 };
    d.catalog.items[5].consumes = { 'dozen-roses': 1 };
    const text = errorsOf(d).join('\n');
    expect(text).toMatch(/catalog\.items\[1\]\.consumes\.ribbon: there is no item with id "ribbon"/);
    expect(text).toMatch(/consume each other in a loop/);
  });

  it('elige la pregunta hablada según lo que faltó', () => {
    expect(spokenFailure(['profile: closedStage "done" is not one of the stages'])).toBe(STAGES_QUESTION);
    expect(spokenFailure(['profile.stages: Too small: expected array to have >=2 items'])).toBe(STAGES_QUESTION);
    expect(spokenFailure(['catalog.items: 4 items; use between 5 and 60'])).toBe(CATALOG_QUESTION);
    expect(spokenFailure(['the model did not return a setup (timeout)'])).toBe(GENERIC_QUESTION);
    expect(STAGES_QUESTION).toBe("I couldn't tell how an order moves from start to finish. What steps does an order go through?");
  });
});
```

- [ ] **Step 3: Correr y ver fallar**

Run: `npx vitest run test/unit/setup-validate.test.ts`
Expected: FAIL — `Cannot find module '../../src/setup/validate.js'`.

- [ ] **Step 4: Crear `src/setup/validate.ts`**

```ts
import * as z from 'zod/v4';
import { catalogProblems, catalogSchema, toCatalogItems } from '../catalog/schema.js';
import type { CatalogItem } from '../domain/types.js';
import { parseProfile } from '../profiles/load.js';
import { profileSchema, TOOL_KEYS, type Profile } from '../profiles/schema.js';
import { formatIssues } from '../validation/issues.js';

export const SETUP_TOOL_NAMES = ['set_up_my_business', 'review_business_setup', 'activate_business_setup'] as const;
export const MAX_STAGES = 8;
export const MIN_ITEMS = 5;
export const MAX_ITEMS = 60;

/** Lo que Nova tiene que devolver. De aquí sale también el esquema JSON de su herramienta (spec B2 §5.3). */
export const draftSchema = z.object({ profile: profileSchema, catalog: catalogSchema }).strict();

export interface ValidSetup { profile: Profile; items: CatalogItem[] }
export type SetupCheck = { ok: true; setup: ValidSetup } | { ok: false; errors: string[] };

export const STAGES_QUESTION = "I couldn't tell how an order moves from start to finish. What steps does an order go through?";
export const CATALOG_QUESTION = "I couldn't put together what you sell. What are a few things you sell, and about how much they cost?";
export const GENERIC_QUESTION = "I couldn't finish your setup. Tell me a bit more about what you sell and the steps an order goes through.";

/** Validación en tres capas (spec B2 §5.3): esquema, reglas del perfil del servidor y reglas propias del asistente. */
export function validateSetup(raw: unknown): SetupCheck {
  const parsed = draftSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: formatIssues(parsed.error) };

  let profile: Profile;
  try {
    profile = parseProfile(parsed.data.profile);
  } catch (err) {
    return { ok: false, errors: [`profile: ${err instanceof Error ? err.message : String(err)}`] };
  }

  const items = parsed.data.catalog.items;
  const errors: string[] = [];
  const reserved: readonly string[] = SETUP_TOOL_NAMES;
  for (const key of TOOL_KEYS) {
    const name = profile.toolNames[key];
    if (reserved.includes(name)) errors.push(`profile.toolNames.${key}: "${name}" is reserved for the setup tools; pick another name`);
  }
  if (profile.stages.length > MAX_STAGES) {
    errors.push(`profile.stages: ${profile.stages.length} stages is too many; use at most ${MAX_STAGES}`);
  }
  if (items.length < MIN_ITEMS || items.length > MAX_ITEMS) {
    errors.push(`catalog.items: ${items.length} items; use between ${MIN_ITEMS} and ${MAX_ITEMS}`);
  }
  // Precios > 0 ya los exige el esquema del ítem (`priceCents` positivo).
  errors.push(...catalogProblems(items, 'catalog.items'));

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, setup: { profile, items: toCatalogItems(items) } };
}

/** La frase para el usuario cuando el borrador no se pudo arreglar: pregunta por lo que faltó. */
export function spokenFailure(errors: string[]): string {
  if (errors.some(e => /^profile(\.stages|\.closedStage|\.closeFrom|: (closedStage|closeFrom))/.test(e))) return STAGES_QUESTION;
  if (errors.some(e => e.startsWith('catalog'))) return CATALOG_QUESTION;
  return GENERIC_QUESTION;
}
```

- [ ] **Step 5: Correr las pruebas**

Run: `npx vitest run test/unit/setup-validate.test.ts`
Expected: PASS.

- [ ] **Step 6: Verificación completa y commit**

Run: `npm test && npm run typecheck && npm run build` → verde.

```bash
git add src/setup/validate.ts test/fixtures/setup test/helpers/setup.ts test/unit/setup-validate.test.ts
git commit -m "feat: validate setup drafts in three layers"
```

---

### Task 7: Generador con Nova y una reparación

**Files:**
- Modify: `package.json` (`@aws-sdk/client-bedrock-runtime` a `dependencies`)
- Create: `src/setup/generate.ts`
- Modify: `test/helpers/setup.ts`
- Create: `test/unit/setup-generate.test.ts`
- Create: `infra/spikes/setup-draft.ts`

**Interfaces:**
- Consumes: `validateSetup`, `spokenFailure`, `draftSchema`, `ValidSetup`, `SETUP_TOOL_NAMES` (Task 6); `loadTemplate` (Task 2).
- Produces (en `src/setup/generate.ts`):
  - `type ConverseFn = (input: { system: SystemContentBlock[]; messages: Message[]; toolConfig: ToolConfiguration }) => Promise<Message>`
  - `interface Attempt { description: string; previous?: { draft: unknown; errors: string[] } }`
  - `type DraftGenerator = (attempt: Attempt) => Promise<unknown>`
  - `type SetupOutcome = { ok: true; setup: ValidSetup } | { ok: false; spoken: string; errors: string[] }`
  - `SETUP_TOOL = 'save_business_setup'`, `SETUP_INPUT_SCHEMA` (JSON schema sin `$schema`)
  - `generateSetup(description: string, generate: DraftGenerator): Promise<SetupOutcome>`
  - `novaDraftGenerator(converse: ConverseFn): DraftGenerator`
  - `bedrockConverse(client: BedrockRuntimeClient, modelId: string): ConverseFn`
  - `unavailableGenerator: DraftGenerator` (siempre lanza; default de `createApp`)
- Produces (en `test/helpers/setup.ts`): `scriptedGenerator(...replies: Array<unknown | Error>): DraftGenerator & { attempts: Attempt[] }` — devuelve (o lanza) las respuestas en orden; la última se repite.

- [ ] **Step 1: Mover el SDK de Bedrock a dependencias**

Run: `npm install --save-prod @aws-sdk/client-bedrock-runtime@^3.1140.0`
Expected: `package.json` lo lista en `dependencies` y ya no en `devDependencies`. Si quedó en ambos, borrarlo a mano de `devDependencies` y correr `npm install`.

- [ ] **Step 2: Completar el helper y escribir las pruebas**

Agregar a `test/helpers/setup.ts`:

```ts
import type { Attempt, DraftGenerator } from '../../src/setup/generate.js';

/** Generador de prueba: devuelve (o lanza) las respuestas en orden, repite la última, y guarda cada intento. */
export function scriptedGenerator(...replies: Array<unknown | Error>): DraftGenerator & { attempts: Attempt[] } {
  const attempts: Attempt[] = [];
  const queue = [...replies];
  const generate = async (attempt: Attempt): Promise<unknown> => {
    attempts.push(attempt);
    const next = queue.length > 1 ? queue.shift() : queue[0];
    if (next instanceof Error) throw next;
    return structuredClone(next);
  };
  return Object.assign(generate, { attempts });
}
```

Crear `test/unit/setup-generate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Message } from '@aws-sdk/client-bedrock-runtime';
import {
  generateSetup, novaDraftGenerator, SETUP_INPUT_SCHEMA, SETUP_TOOL, type ConverseFn
} from '../../src/setup/generate.js';
import { GENERIC_QUESTION, STAGES_QUESTION } from '../../src/setup/validate.js';
import { floristDraft, scriptedGenerator } from '../helpers/setup.js';

const broken = () => { const d = floristDraft(); d.profile.closedStage = 'done'; return d; };

describe('generación del borrador con una reparación', () => {
  it('acepta el primer intento válido', async () => {
    const generate = scriptedGenerator(floristDraft());
    const outcome = await generateSetup('I run a flower shop', generate);
    expect(outcome.ok).toBe(true);
    expect(generate.attempts).toHaveLength(1);
  });

  it('repara una vez con la lista exacta de errores', async () => {
    const generate = scriptedGenerator(broken(), floristDraft());
    const outcome = await generateSetup('I run a flower shop', generate);
    expect(outcome.ok).toBe(true);
    expect(generate.attempts[1]?.previous?.errors).toEqual(['profile: closedStage "done" is not one of the stages']);
    expect(generate.attempts[1]?.previous?.draft).toEqual(broken());
  });

  it('se rinde tras la reparación y pregunta por lo que faltó', async () => {
    const generate = scriptedGenerator(broken());
    const outcome = await generateSetup('I run a flower shop', generate);
    expect(outcome).toMatchObject({ ok: false, spoken: STAGES_QUESTION });
    expect(generate.attempts).toHaveLength(2);
  });

  it('un generador que lanza cuenta como intento fallido', async () => {
    const outcome = await generateSetup('I run a flower shop', scriptedGenerator(new Error('AccessDeniedException')));
    expect(outcome).toMatchObject({ ok: false, spoken: GENERIC_QUESTION });
    if (!outcome.ok) expect(outcome.errors[0]).toMatch(/did not return a setup \(AccessDeniedException\)/);
  });
});

describe('generador de Nova', () => {
  function fakeConverse(reply: Message): ConverseFn & { calls: Parameters<ConverseFn>[0][] } {
    const calls: Parameters<ConverseFn>[0][] = [];
    return Object.assign(async (input: Parameters<ConverseFn>[0]) => { calls.push(input); return reply; }, { calls });
  }

  it('fuerza la herramienta con el esquema derivado de zod y devuelve su entrada', async () => {
    const converse = fakeConverse({ role: 'assistant', content: [{ toolUse: { toolUseId: 't1', name: SETUP_TOOL, input: floristDraft() } }] });
    const draft = await novaDraftGenerator(converse)({ description: 'I run a flower shop' });
    expect(draft).toEqual(floristDraft());
    const call = converse.calls[0]!;
    expect(call.toolConfig.toolChoice).toEqual({ tool: { name: SETUP_TOOL } });
    expect(Object.keys((SETUP_INPUT_SCHEMA as { properties: object }).properties)).toEqual(['profile', 'catalog']);
    expect(SETUP_INPUT_SCHEMA).not.toHaveProperty('$schema');
    expect(call.messages[0]?.content?.[0]).toEqual({ text: 'I run a flower shop' });
  });

  it('en la reparación le manda los errores y su intento anterior', async () => {
    const converse = fakeConverse({ role: 'assistant', content: [{ toolUse: { toolUseId: 't1', name: SETUP_TOOL, input: {} } }] });
    await novaDraftGenerator(converse)({ description: 'I run a flower shop', previous: { draft: { a: 1 }, errors: ['profile: bad'] } });
    const text = (converse.calls[0]!.messages[0]!.content![0] as { text: string }).text;
    expect(text).toContain('- profile: bad');
    expect(text).toContain('{"a":1}');
  });

  it('una respuesta sin la herramienta es un error', async () => {
    const converse = fakeConverse({ role: 'assistant', content: [{ text: 'Sure! Here is your setup.' }] });
    await expect(novaDraftGenerator(converse)({ description: 'x' })).rejects.toThrow(/no save_business_setup call/);
  });
});
```

- [ ] **Step 3: Correr y ver fallar**

Run: `npx vitest run test/unit/setup-generate.test.ts`
Expected: FAIL — `Cannot find module '../../src/setup/generate.js'`.

- [ ] **Step 4: Crear `src/setup/generate.ts`**

```ts
import {
  ConverseCommand, type BedrockRuntimeClient, type Message, type SystemContentBlock,
  type ToolConfiguration, type ToolInputSchema
} from '@aws-sdk/client-bedrock-runtime';
import * as z from 'zod/v4';
import { loadTemplate } from '../profiles/load.js';
import { draftSchema, spokenFailure, validateSetup, type SetupCheck, type ValidSetup } from './validate.js';

export type ConverseFn = (input: {
  system: SystemContentBlock[]; messages: Message[]; toolConfig: ToolConfiguration;
}) => Promise<Message>;

export interface Attempt { description: string; previous?: { draft: unknown; errors: string[] } }
export type DraftGenerator = (attempt: Attempt) => Promise<unknown>;
export type SetupOutcome = { ok: true; setup: ValidSetup } | { ok: false; spoken: string; errors: string[] };

export const SETUP_TOOL = 'save_business_setup';

/** Esquema JSON de la herramienta, derivado de los esquemas zod: una sola fuente de verdad (spec B2 §5.3). */
export const SETUP_INPUT_SCHEMA: Record<string, unknown> = (() => {
  const { $schema: _ignored, ...schema } = z.toJSONSchema(draftSchema, { io: 'input' }) as Record<string, unknown>;
  return schema;
})();

/** Un intento y, si falla la validación, una reparación con la lista exacta de errores. */
export async function generateSetup(description: string, generate: DraftGenerator): Promise<SetupOutcome> {
  const first = await attempt(generate, { description });
  if (first.check.ok) return { ok: true, setup: first.check.setup };
  const second = await attempt(generate, { description, previous: { draft: first.draft, errors: first.check.errors } });
  if (second.check.ok) return { ok: true, setup: second.check.setup };
  return { ok: false, errors: second.check.errors, spoken: spokenFailure(second.check.errors) };
}

async function attempt(generate: DraftGenerator, input: Attempt): Promise<{ draft: unknown; check: SetupCheck }> {
  try {
    const draft = await generate(input);
    return { draft, check: validateSetup(draft) };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { draft: null, check: { ok: false, errors: [`the model did not return a setup (${reason})`] } };
  }
}

const EXAMPLE = JSON.stringify({
  profile: loadTemplate('bakery'),
  catalog: {
    items: [
      { id: 'cake-8', name: '8-inch round cake', kind: 'product', unit: 'cake', priceCents: 4500, stocked: false, consumes: { 'box-8': 1 } },
      { id: 'delivery', name: 'Delivery', kind: 'product', unit: 'trip', priceCents: 2500, taxable: false, stocked: false },
      { id: 'box-8', name: '8-inch cake box', kind: 'supply', unit: 'each', priceCents: 120, stocked: true, onHand: 40, reorderPoint: 20, reorderQty: 100 }
    ]
  }
});

const SYSTEM_PROMPT = `You set up Counterpart, an order-tracking assistant for small businesses, from the owner's own description.
Call ${SETUP_TOOL} exactly once with a profile and a catalog.

The profile:
- nouns: what the business calls one order and many orders (for example "flower order", "flower orders"), one item and many items, and a customer.
- synonyms: other words people use for an order and for an item.
- stages: 3 to 6 steps an order goes through, in order, with snake_case ids and short spoken labels. The last stage means finished and paid; put its id in closedStage.
- closeFrom: the stages an order can be closed out from, usually the one right before closedStage.
- toolNames: nine different snake_case tool names in the business's own words, for snapshot, find, open, move, addLine, stock, reorder, closeOut and salesReport. Never use set_up_my_business, review_business_setup or activate_business_setup.
- asset: null, unless every order is about one physical thing the customer brings in (a car, a bike). Then its noun, 1 to 4 fields, and spokenAs such as "{year} {make} {model}".
- orderFields: up to 4 details every order records, with snake_case ids and type string or integer. Never use customerName, customerPhone, description, asset or due.
- due: "required" if every order is for a date, "optional" if some are, "none" if never.

The catalog: 10 to 25 items the business sells or stocks. Each has a lowercase-dash id, a short name that is easy to say, a kind (product or labor for what customers buy; part, supply or ingredient for what the business stocks), a unit, priceCents as a whole number of cents, and stocked (true for things counted on a shelf). Stocked items also get onHand, reorderPoint and reorderQty. Use consumes to say which stocked items one unit uses up, by id. Use realistic US prices.

Example for a bakery:
${EXAMPLE}`;

export function novaDraftGenerator(converse: ConverseFn): DraftGenerator {
  return async ({ description, previous }) => {
    const text = previous
      ? `${description}\n\nYour last setup had these problems:\n- ${previous.errors.join('\n- ')}\n\n`
        + `Here it is. Fix every problem and call ${SETUP_TOOL} again:\n${JSON.stringify(previous.draft)}`
      : description;
    const message = await converse({
      system: [{ text: SYSTEM_PROMPT }],
      messages: [{ role: 'user', content: [{ text }] }],
      toolConfig: {
        tools: [{
          toolSpec: {
            name: SETUP_TOOL,
            description: 'Save the setup for this business.',
            // El SDK tipa el documento JSON con su propio tipo; el esquema es JSON puro.
            inputSchema: { json: SETUP_INPUT_SCHEMA } as unknown as ToolInputSchema
          }
        }],
        toolChoice: { tool: { name: SETUP_TOOL } }
      }
    });
    const use = message.content?.find(block => block.toolUse?.name === SETUP_TOOL)?.toolUse;
    if (!use) throw new Error(`no ${SETUP_TOOL} call in the reply`);
    return use.input;
  };
}

/** Converse contra Bedrock. Solo `src/setup/` llama a un modelo (spec B2 §3). */
export function bedrockConverse(client: BedrockRuntimeClient, modelId: string): ConverseFn {
  return async input => {
    const out = await client.send(new ConverseCommand({
      modelId, ...input, inferenceConfig: { maxTokens: 6000, temperature: 0.2 }
    }));
    const message = out.output?.message;
    if (!message) throw new Error('empty reply from the model');
    return message;
  };
}

/** Default sin modelo configurado: el borrador queda fallido con la frase genérica. */
export const unavailableGenerator: DraftGenerator = async () => {
  throw new Error('setup generator not configured');
};
```

- [ ] **Step 5: Correr las pruebas**

Run: `npx vitest run test/unit/setup-generate.test.ts`
Expected: PASS.

- [ ] **Step 6: Script manual contra Nova (fuera de `npm test`)**

Crear `infra/spikes/setup-draft.ts`:

```ts
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { bedrockConverse, generateSetup, novaDraftGenerator } from '../../src/setup/generate.js';

// Prueba manual del asistente contra Nova 2 Lite (spec B2 §6: una sola, fuera de npm test).
// Uso: npx tsx infra/spikes/setup-draft.ts "I run a flower shop..."   (con AWS_PROFILE y acceso a Bedrock)
const description = process.argv.slice(2).join(' ')
  || "I run a flower shop. We take orders for bouquets and centerpieces, arrange them, and they're ready for pickup or delivery.";
const modelId = process.env.COUNTERPART_SETUP_MODEL_ID ?? 'us.amazon.nova-2-lite-v1:0';
const generate = novaDraftGenerator(bedrockConverse(new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? 'us-east-1' }), modelId));

const started = performance.now();
const outcome = await generateSetup(description, generate);
const ms = Math.round(performance.now() - started);
if (outcome.ok) {
  const { profile, items } = outcome.setup;
  console.log(`OK en ${ms} ms: ${profile.nouns.orders}, etapas ${profile.stages.map(s => s.id).join(' → ')}, ${items.length} ítems`);
  console.log(JSON.stringify(outcome.setup, null, 2));
} else {
  console.log(`FALLÓ en ${ms} ms: ${outcome.spoken}`);
  console.log(outcome.errors.join('\n'));
  process.exitCode = 1;
}
```

**[dueño]** `aws sso login --profile counterpart` si la sesión venció. Luego:

Run: `npx cross-env AWS_PROFILE=counterpart npx tsx infra/spikes/setup-draft.ts`
Expected: `OK en <ms> ms: …` con 10–25 ítems. Correrlo 3 veces y anotar las tres latencias y si hizo falta la reparación en el registro de ejecución. Si falla dos de tres, ajustar `SYSTEM_PROMPT` (nunca las reglas de validación) y repetir; si después de dos rondas sigue fallando, anotarlo en `docs/friction-log.md` y probar `COUNTERPART_SETUP_MODEL_ID` con el modelo alternativo que ya documenta el bridge (`fallbackModelId`).

- [ ] **Step 7: Verificación completa y commit**

Run: `npm test && npm run typecheck && npm run build` → verde.

```bash
git add package.json package-lock.json src/setup/generate.ts test/helpers/setup.ts test/unit/setup-generate.test.ts infra/spikes/setup-draft.ts
git commit -m "feat: draft business setups with Nova 2 Lite and one repair pass"
```

---

### Task 8: Servicio de borradores

**Files:**
- Create: `src/setup/service.ts`
- Create: `test/unit/setup-service.test.ts`

**Interfaces:**
- Consumes: `Store` (`getDraft`, `putDraft`, `deleteDraft`, `getBusiness`, `getProfile`, `activateBusiness`), `ConflictError`, `Draft` (Task 1); `generateSetup`, `DraftGenerator` (Task 7); `GENERIC_QUESTION` (Task 6); `newBlankBusiness` (Task 5, en pruebas); `log` de `src/log.ts`.
- Produces (en `src/setup/service.ts`):
  - `DRAFTS_PER_HOUR = 5`, `DRAFT_TTL_SECONDS = 86400`, `STALE_GENERATION_MS = 300000`, `STALE_TEXT`
  - `type StartResult = 'started' | 'busy' | 'limited'`
  - `type ReviewResult = { state: 'none' } | { state: 'generating' } | { state: 'failed'; spoken: string } | { state: 'ready'; profile: Profile; items: CatalogItem[] }`
  - `type ActivateResult = { status: 'activated'; business: Business; profile: Profile } | { status: 'discarded' } | { status: 'none' } | { status: 'not_ready' } | { status: 'conflict' }`
  - `class SetupService { constructor(deps: { store: Store; generate: DraftGenerator; now: () => Date }); start(bizId, description): Promise<StartResult>; review(bizId): Promise<ReviewResult>; activate(bizId, confirm: boolean): Promise<ActivateResult>; settled(): Promise<void> }`

- [ ] **Step 1: Escribir las pruebas**

Crear `test/unit/setup-service.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryStore } from '../../src/store/memory.js';
import { SetupService, STALE_TEXT } from '../../src/setup/service.js';
import type { DraftGenerator } from '../../src/setup/generate.js';
import { GENERIC_QUESTION, STAGES_QUESTION } from '../../src/setup/validate.js';
import { newBlankBusiness } from '../../seed/business.js';
import { floristDraft, scriptedGenerator } from '../helpers/setup.js';

const NOW = new Date('2026-09-29T15:00:00Z');
const MINUTE = 60_000;
let clock: Date;
beforeEach(() => { clock = NOW; });

async function blankStore(): Promise<MemoryStore> {
  const store = new MemoryStore();
  await newBlankBusiness(store, { id: 'florist', name: 'Petal and Stem' });
  return store;
}

const service = (store: MemoryStore, generate: DraftGenerator) => new SetupService({ store, generate, now: () => clock });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

describe('servicio de borradores', () => {
  it('genera en segundo plano y deja el borrador listo', async () => {
    const svc = service(await blankStore(), scriptedGenerator(floristDraft()));
    expect(await svc.start('florist', 'I run a flower shop')).toBe('started');
    await svc.settled();
    const review = await svc.review('florist');
    expect(review.state).toBe('ready');
    if (review.state === 'ready') expect(review.items).toHaveLength(7);
  });

  it('dice que sigue generando y no arranca otra generación mientras tanto', async () => {
    const pending = deferred<unknown>();
    let calls = 0;
    const svc = service(await blankStore(), async () => { calls += 1; return pending.promise; });
    await svc.start('florist', 'I run a flower shop');
    expect((await svc.review('florist')).state).toBe('generating');
    expect(await svc.start('florist', 'I run a flower shop, again')).toBe('busy');
    expect(calls).toBe(1);
    pending.resolve(floristDraft());
    await svc.settled();
    expect((await svc.review('florist')).state).toBe('ready');
  });

  it('limita a cinco borradores por negocio por hora', async () => {
    const svc = service(await blankStore(), scriptedGenerator(floristDraft()));
    for (let i = 0; i < 5; i++) {
      expect(await svc.start('florist', `try ${i}`)).toBe('started');
      await svc.settled();
    }
    expect(await svc.start('florist', 'try 6')).toBe('limited');
    clock = new Date(NOW.getTime() + 61 * MINUTE);
    expect(await svc.start('florist', 'try 7')).toBe('started');
  });

  it('un borrador irreparable dice qué faltó', async () => {
    const hopeless = floristDraft();
    hopeless.profile.closedStage = 'done';
    const svc = service(await blankStore(), scriptedGenerator(hopeless));
    await svc.start('florist', 'flowers');
    await svc.settled();
    expect(await svc.review('florist')).toEqual({ state: 'failed', spoken: STAGES_QUESTION });
  });

  it('un generador que lanza deja el borrador fallido sin romper el proceso', async () => {
    const store = await blankStore();
    const svc = service(store, scriptedGenerator(new Error('AccessDeniedException')));
    await svc.start('florist', 'flowers');
    await svc.settled();
    expect(await svc.review('florist')).toEqual({ state: 'failed', spoken: GENERIC_QUESTION });
    expect(await store.getProfile('florist')).toBeNull();
  });

  it('una generación huérfana deja de bloquear a los cinco minutos', async () => {
    const store = await blankStore();
    await store.putDraft('florist', {
      description: 'flowers', state: 'generating', createdAt: NOW.toISOString(), expiresAt: NOW.getTime() / 1000 + 86400
    });
    const svc = service(store, scriptedGenerator(floristDraft()));
    expect(await svc.start('florist', 'again')).toBe('busy');
    clock = new Date(NOW.getTime() + 6 * MINUTE);
    expect(await svc.review('florist')).toEqual({ state: 'failed', spoken: STALE_TEXT });
    expect(await svc.start('florist', 'again')).toBe('started');
  });

  it('una generación vieja que termina tarde no pisa el borrador nuevo', async () => {
    const slow = deferred<unknown>();
    const small = floristDraft();
    small.catalog.items = small.catalog.items.filter((i: { id: string }) => i.id !== 'centerpiece' && i.id !== 'vase');
    let call = 0;
    const svc = service(await blankStore(), async () => (++call === 1 ? slow.promise : small));
    await svc.start('florist', 'first');
    clock = new Date(NOW.getTime() + 6 * MINUTE);
    expect(await svc.start('florist', 'second')).toBe('started');
    await vi.waitFor(async () => expect((await svc.review('florist')).state).toBe('ready'));
    slow.resolve(floristDraft());
    await svc.settled();
    const review = await svc.review('florist');
    expect(review.state === 'ready' && review.items.length).toBe(5);
  });

  it('un borrador caducado ya no existe aunque el registro siga ahí', async () => {
    const store = await blankStore();
    const svc = service(store, scriptedGenerator(floristDraft()));
    await svc.start('florist', 'flowers');
    await svc.settled();
    clock = new Date(NOW.getTime() + 25 * 60 * MINUTE);
    expect(await svc.review('florist')).toEqual({ state: 'none' });
    expect(await svc.activate('florist', true)).toEqual({ status: 'none' });
    expect((await store.getBusiness('florist'))?.status).toBe('blank');
  });

  it('confirm false descarta el borrador', async () => {
    const store = await blankStore();
    const svc = service(store, scriptedGenerator(floristDraft()));
    await svc.start('florist', 'flowers');
    await svc.settled();
    expect(await svc.activate('florist', false)).toEqual({ status: 'discarded' });
    expect(await store.getDraft('florist')).toBeNull();
    expect((await store.getBusiness('florist'))?.status).toBe('blank');
  });

  it('confirm true activa perfil, catálogo y estado en una sola escritura', async () => {
    const store = await blankStore();
    const svc = service(store, scriptedGenerator(floristDraft()));
    await svc.start('florist', 'flowers');
    await svc.settled();
    const result = await svc.activate('florist', true);
    expect(result.status).toBe('activated');
    const business = (await store.getBusiness('florist'))!;
    expect(business).toMatchObject({ status: 'active', profileVersion: 1 });
    if (result.status === 'activated') expect(result.business).toEqual(business);
    expect(await store.getProfile('florist')).toMatchObject({ source: 'assistant', version: 1 });
    expect(await store.listItems('florist')).toHaveLength(7);
    expect(await store.getDraft('florist')).toBeNull();
  });

  it('no activa sin borrador ni mientras genera', async () => {
    const pending = deferred<unknown>();
    const svc = service(await blankStore(), async () => pending.promise);
    expect(await svc.activate('florist', true)).toEqual({ status: 'none' });
    await svc.start('florist', 'flowers');
    expect(await svc.activate('florist', true)).toEqual({ status: 'not_ready' });
    pending.resolve(floristDraft());
    await svc.settled();
  });
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `npx vitest run test/unit/setup-service.test.ts`
Expected: FAIL — `Cannot find module '../../src/setup/service.js'`.

- [ ] **Step 3: Crear `src/setup/service.ts`**

```ts
import type { Business, CatalogItem } from '../domain/types.js';
import { log } from '../log.js';
import type { Profile } from '../profiles/schema.js';
import { ConflictError, type Draft, type Store } from '../store/store.js';
import { generateSetup, type DraftGenerator } from './generate.js';
import { GENERIC_QUESTION } from './validate.js';

export const DRAFTS_PER_HOUR = 5;
export const DRAFT_TTL_SECONDS = 24 * 60 * 60;
/** Un borrador "generating" más viejo que esto quedó huérfano: el proceso se reinició a mitad de la generación. */
export const STALE_GENERATION_MS = 5 * 60 * 1000;
export const STALE_TEXT = "My last draft didn't finish. Tell me about your business again.";
const HOUR_MS = 60 * 60 * 1000;

export type StartResult = 'started' | 'busy' | 'limited';
export type ReviewResult =
  | { state: 'none' }
  | { state: 'generating' }
  | { state: 'failed'; spoken: string }
  | { state: 'ready'; profile: Profile; items: CatalogItem[] };
export type ActivateResult =
  | { status: 'activated'; business: Business; profile: Profile }
  | { status: 'discarded' }
  | { status: 'none' }
  | { status: 'not_ready' }
  | { status: 'conflict' };

/**
 * El asistente de configuración (spec B2 §5.2–5.3). La generación es asíncrona: el bridge da 6.5 s
 * por turno y un borrador con Nova tarda más (S4). Corre en el proceso, que es uno solo, y deja el
 * resultado en el registro DRAFT. Nada se activa sin `confirm: true`.
 */
export class SetupService {
  private readonly starts = new Map<string, number[]>();
  private readonly running = new Set<Promise<void>>();

  constructor(private readonly deps: { store: Store; generate: DraftGenerator; now: () => Date }) {}

  async start(bizId: string, description: string): Promise<StartResult> {
    const now = this.deps.now();
    if ((await this.current(bizId, now))?.state === 'generating') return 'busy';

    const recent = (this.starts.get(bizId) ?? []).filter(t => now.getTime() - t < HOUR_MS);
    if (recent.length >= DRAFTS_PER_HOUR) {
      this.starts.set(bizId, recent);
      return 'limited';
    }
    this.starts.set(bizId, [...recent, now.getTime()]);

    const createdAt = now.toISOString();
    await this.deps.store.putDraft(bizId, {
      description, state: 'generating', createdAt,
      expiresAt: Math.floor(now.getTime() / 1000) + DRAFT_TTL_SECONDS
    });
    const run: Promise<void> = this.generate(bizId, description, createdAt).finally(() => this.running.delete(run));
    this.running.add(run);
    return 'started';
  }

  async review(bizId: string): Promise<ReviewResult> {
    const draft = await this.current(bizId, this.deps.now());
    if (!draft) return { state: 'none' };
    if (draft.state === 'generating') return { state: 'generating' };
    if (draft.state === 'failed') return { state: 'failed', spoken: draft.error ?? GENERIC_QUESTION };
    return { state: 'ready', profile: draft.profile!, items: draft.catalog! };
  }

  async activate(bizId: string, confirm: boolean): Promise<ActivateResult> {
    const { store } = this.deps;
    const draft = await this.current(bizId, this.deps.now());
    if (!draft || draft.state === 'failed') return { status: 'none' };
    if (draft.state === 'generating') return { status: 'not_ready' };
    if (!confirm) {
      await store.deleteDraft(bizId);
      return { status: 'discarded' };
    }

    const business = await store.getBusiness(bizId);
    if (!business || business.status !== 'blank') return { status: 'none' };
    const version = ((await store.getProfile(bizId))?.version ?? 0) + 1;
    const active: Business = { ...business, status: 'active', profileVersion: version };
    try {
      await store.activateBusiness(bizId, {
        business: active, profile: { profile: draft.profile!, source: 'assistant', version }, items: draft.catalog!
      });
    } catch (err) {
      if (err instanceof ConflictError) return { status: 'conflict' };
      throw err;
    }
    return { status: 'activated', business: { ...active, version: active.version + 1 }, profile: draft.profile! };
  }

  /** Espera a que terminen las generaciones en curso. Para pruebas y para un apagado ordenado. */
  async settled(): Promise<void> {
    while (this.running.size > 0) await Promise.all([...this.running]);
  }

  /** El borrador vigente: caducado → null (el TTL de DynamoDB llega tarde); "generating" huérfano → failed. */
  private async current(bizId: string, now: Date): Promise<Draft | null> {
    const draft = await this.deps.store.getDraft(bizId);
    if (!draft || draft.expiresAt * 1000 <= now.getTime()) return null;
    if (draft.state === 'generating' && now.getTime() - Date.parse(draft.createdAt) > STALE_GENERATION_MS) {
      return { ...draft, state: 'failed', error: STALE_TEXT };
    }
    return draft;
  }

  private async generate(bizId: string, description: string, createdAt: string): Promise<void> {
    try {
      const outcome = await generateSetup(description, this.deps.generate);
      const latest = await this.deps.store.getDraft(bizId);
      // Otro borrador lo reemplazó o se descartó mientras se generaba: no se pisa.
      if (!latest || latest.createdAt !== createdAt) return;
      if (outcome.ok) {
        await this.deps.store.putDraft(bizId, { ...latest, state: 'ready', profile: outcome.setup.profile, catalog: outcome.setup.items });
      } else {
        log({ level: 'warn', msg: 'setup_failed', businessId: bizId, errors: outcome.errors });
        await this.deps.store.putDraft(bizId, { ...latest, state: 'failed', error: outcome.spoken });
      }
    } catch (err) {
      // Nunca una promesa rechazada sin manejar: el borrador queda "generating" y a los 5 minutos cuenta como huérfano.
      log({ level: 'error', msg: 'setup_crashed', businessId: bizId, error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) });
    }
  }
}
```

- [ ] **Step 4: Correr las pruebas**

Run: `npx vitest run test/unit/setup-service.test.ts`
Expected: PASS.

- [ ] **Step 5: Verificación completa y commit**

Run: `npm test && npm run typecheck && npm run build` → verde.

```bash
git add src/setup/service.ts test/unit/setup-service.test.ts
git commit -m "feat: run setup drafts in the background with a per-hour cap"
```

---

### Task 9: Tools de alta y cambio de tools en la sesión

**Files:**
- Create: `src/setup/view.ts`
- Create: `src/setup/tools.ts`
- Modify: `src/tools/instrument.ts`
- Modify: `src/tools/ui-assets.ts`, `src/tools/context.ts` (recursos de UI por nombre e idempotentes)
- Modify: `src/http/app.ts`
- Create: `test/integration/setup-flow.test.ts`

**Interfaces:**
- Consumes: `SetupService`, `ReviewResult`, `ActivateResult` (Task 8); `SETUP_TOOL_NAMES` (Task 6); `unavailableGenerator`, `DraftGenerator` (Task 7); `ProfileCache` (Task 2); `registerTools`, `guard`, `ok`, `ToolContext` de `src/tools/context.ts`; `spokenId` (Task 5); `say` de `src/speech/say.ts`; `newBlankBusiness` (Task 5, en pruebas).
- Produces:
  - `setupViewSchema` y `type SetupView` y `setupView(businessName: string, review: ReviewResult, message: string): SetupView` en `src/setup/view.ts`.
  - En `src/setup/tools.ts`: `interface SetupToolContext { business: Business; setup: SetupService; onActivated: (business: Business, profile: Profile) => void }`, `registerSetupTools(server: McpServer, ctx: SetupToolContext): RegisteredTool[]`, `draftSummary(profile: Profile, itemCount: number): string`, `readyText(business: Business, profile: Profile): string`.
  - `createApp(deps)` acepta además `generate?: DraftGenerator` y `now?: () => Date`, y expone `app.locals.setup: SetupService`.
  - `instrument(server, owner: { business: Pick<Business, 'id'> })`.
  - En `src/tools/ui-assets.ts`: `type UiName = 'snapshot' | 'sales-report'` y `registerUiResources(server: McpServer, names: UiName[])`, idempotente por servidor (registrar dos veces la misma página no hace nada). La Task 10 suma `'setup'`.

- [ ] **Step 1: Escribir la prueba de punta a punta por HTTP**

Crear `test/integration/setup-flow.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Express } from 'express';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createApp } from '../../src/http/app.js';
import { hashToken } from '../../src/http/auth.js';
import { MemoryStore } from '../../src/store/memory.js';
import type { SetupService } from '../../src/setup/service.js';
import { SETUP_TOOL_NAMES } from '../../src/setup/validate.js';
import { newBlankBusiness } from '../../seed/business.js';
import { DEMO_TOKENS, seedAll } from '../../seed/run.js';
import { floristDraft, scriptedGenerator } from '../helpers/setup.js';

const NOW = new Date('2026-09-29T15:00:00Z');
let app: Express;
let server: Server;
let base: string;
const clients: Client[] = [];

beforeAll(async () => {
  const store = new MemoryStore();
  await seedAll(store, NOW);
  for (const [id, name] of [['florist', 'Petal and Stem'], ['twins', 'Twin Florals'], ['other', 'Other Place'], ['iso', 'Iso Florals']]) {
    await newBlankBusiness(store, { id: id!, name: name! });
    await store.putToken(hashToken(`token-${id}`), id!);
  }
  app = createApp({ store, host: '127.0.0.1', generate: scriptedGenerator(floristDraft()), now: () => NOW });
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
});

afterAll(async () => {
  await Promise.all(clients.map(c => c.close()));
  server.close();
});

async function connect(token: string): Promise<Client> {
  const client = new Client({ name: 'setup-test', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(base), {
    fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      headers.set('authorization', `Bearer ${token}`);
      return fetch(input, { ...init, headers });
    }
  }));
  clients.push(client);
  return client;
}

const text = (r: { content: unknown[] }): string => (r.content[0] as { text: string }).text;
const names = async (c: Client): Promise<string[]> => (await c.listTools()).tools.map(t => t.name).sort();
const settled = () => (app.locals.setup as SetupService).settled();

describe('asistente de configuración por MCP', () => {
  it('un negocio en blanco solo ve las tres tools de alta', async () => {
    expect(await names(await connect('token-florist'))).toEqual([...SETUP_TOOL_NAMES].sort());
  });

  it('un negocio activo no ve las tools de alta', async () => {
    const tools = await names(await connect(DEMO_TOKENS.shop));
    for (const name of SETUP_TOOL_NAMES) expect(tools).not.toContain(name);
  });

  it('flujo completo: describir, revisar, activar y operar en la misma sesión', async () => {
    const client = await connect('token-florist');
    const started = await client.callTool({ name: 'set_up_my_business', arguments: { description: 'I run a flower shop' } });
    expect(text(started)).toBe("I'm drafting your setup. Ask me what I came up with in a few seconds.");
    await settled();

    const review = await client.callTool({ name: 'review_business_setup', arguments: {} });
    expect(text(review)).toBe('I set you up to track flower orders through 5 steps: ordered, arranging, ready, out for delivery and delivered, with 7 flowers in your catalog. Should I turn it on?');
    expect(review.structuredContent).toMatchObject({ state: 'ready', businessName: 'Petal and Stem' });

    const activated = await client.callTool({ name: 'activate_business_setup', arguments: { confirm: true } });
    expect(text(activated)).toBe('Petal and Stem is ready. Open me again, then try: what flower orders are due today?');

    const profileTools = Object.values(floristDraft().profile.toolNames as Record<string, string>).sort();
    expect(await names(client)).toEqual(profileTools);
    const opened = await client.callTool({
      name: 'take_flower_order', arguments: { customerName: 'Maria Lopez', arrangement: 'dozen roses', due: 'friday' }
    });
    expect(opened.isError).toBeFalsy();

    expect(await names(await connect('token-florist'))).toEqual(profileTools);
  });

  it('la otra sesión del mismo negocio no puede activar dos veces', async () => {
    const first = await connect('token-twins');
    const second = await connect('token-twins');
    await first.callTool({ name: 'set_up_my_business', arguments: { description: 'I run a flower shop' } });
    await settled();
    await first.callTool({ name: 'activate_business_setup', arguments: { confirm: true } });
    const again = await second.callTool({ name: 'activate_business_setup', arguments: { confirm: true } });
    expect(text(again)).toBe("There's no finished setup to turn on yet. Tell me about your business first.");
  });

  it('el token de un negocio no ve ni toca el borrador de otro', async () => {
    const iso = await connect('token-iso');
    const other = await connect('token-other');
    await iso.callTool({ name: 'set_up_my_business', arguments: { description: 'I run a flower shop' } });
    await settled();
    expect((await other.callTool({ name: 'review_business_setup', arguments: {} })).structuredContent).toMatchObject({ state: 'none' });
    await other.callTool({ name: 'activate_business_setup', arguments: { confirm: true } });
    expect((await iso.callTool({ name: 'review_business_setup', arguments: {} })).structuredContent).toMatchObject({ state: 'ready' });
  });

  it('descartar deja el negocio en blanco', async () => {
    const client = await connect('token-other');
    await client.callTool({ name: 'set_up_my_business', arguments: { description: 'I run a flower shop' } });
    await settled();
    const discarded = await client.callTool({ name: 'activate_business_setup', arguments: { confirm: false } });
    expect(text(discarded)).toBe('Okay, I threw that draft away. Tell me about your business again whenever you are ready.');
    expect(await names(client)).toEqual([...SETUP_TOOL_NAMES].sort());
  });
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `npx vitest run test/integration/setup-flow.test.ts`
Expected: FAIL — `createApp` no acepta `generate` y el negocio en blanco revienta en `ProfileCache` (`is blank`).

- [ ] **Step 3: `instrument` no necesita el ToolContext completo**

En `src/tools/instrument.ts`: cambiar `import type { ToolContext, ToolResult } from './context.js';` por `import type { ToolResult } from './context.js';` y `import type { Business } from '../domain/types.js';`; definir `type Owner = { business: Pick<Business, 'id'> };` y usar `owner: Owner` en lugar de `ctx: ToolContext` en `instrument(server, owner)` y en `timed(tool, owner, cb)` (el log sigue usando `owner.business.id`).

- [ ] **Step 3b: Recursos de UI por nombre e idempotentes**

El SDK declara las capacidades (tools, resources) al conectar: registrar el **primer** recurso después de `connect` lanza. Una sesión en blanco que se activa registra las páginas de snapshot y sales report tarde. Por eso la sesión en blanco las registra antes de conectar, y `registerTools` las vuelve a pedir sin efecto.

En `src/tools/ui-assets.ts`, reemplazar `uiBundlePath` y `registerUiResources` por:

```ts
export type UiName = 'snapshot' | 'sales-report';

const URI: Record<UiName, string> = { snapshot: UI.snapshot, 'sales-report': UI.salesReport };

export function uiBundlePath(name: UiName): string {
  return path.join(packageRoot(), 'build', 'ui', name, 'index.html');
}

/** Páginas ya registradas por servidor. La llave es `server.server`: igual a través del proxy de `instrument`. */
const registered = new WeakMap<object, Set<UiName>>();

/** Registra las páginas pedidas una sola vez por servidor: pedir dos veces la misma no hace nada. */
export function registerUiResources(server: McpServer, names: UiName[]): void {
  const done = registered.get(server.server) ?? new Set<UiName>();
  registered.set(server.server, done);
  for (const name of names) {
    if (done.has(name)) continue;
    done.add(name);
    const uri = URI[name];
    registerAppResource(server, `Counterpart ${name}`, uri, { mimeType: RESOURCE_MIME_TYPE }, async () => ({
      contents: [{ uri, mimeType: RESOURCE_MIME_TYPE, text: await fs.readFile(uiBundlePath(name), 'utf8') }]
    }));
  }
}
```

En `src/tools/context.ts`, `registerUiResources(s);` pasa a `registerUiResources(s, ['snapshot', 'sales-report']);`.

- [ ] **Step 4: Crear `src/setup/view.ts`**

```ts
import * as z from 'zod/v4';
import { spokenId } from '../tools/specs.js';
import type { ReviewResult } from './service.js';

/** Datos de la UI del borrador (spec B2 §5.4). El texto de la tool basta por sí solo; esto es el extra visual. */
export const setupViewSchema = z.object({
  state: z.enum(['none', 'generating', 'failed', 'ready']),
  businessName: z.string(),
  message: z.string(),
  nouns: z.object({ order: z.string(), orders: z.string(), item: z.string(), items: z.string(), customer: z.string() }).optional(),
  stages: z.array(z.object({ label: z.string(), closing: z.boolean() })).optional(),
  orderFields: z.array(z.object({ label: z.string(), required: z.boolean() })).optional(),
  asset: z.object({ noun: z.string(), fields: z.array(z.string()) }).nullable().optional(),
  items: z.array(z.object({
    name: z.string(), kind: z.string(), priceCents: z.number(), stocked: z.boolean(), onHand: z.number()
  })).optional()
});

export type SetupView = z.infer<typeof setupViewSchema>;

export function setupView(businessName: string, review: ReviewResult, message: string): SetupView {
  if (review.state !== 'ready') return { state: review.state, businessName, message };
  const { profile, items } = review;
  return {
    state: 'ready', businessName, message,
    nouns: profile.nouns,
    stages: profile.stages.map(s => ({ label: s.label, closing: s.id === profile.closedStage })),
    orderFields: profile.orderFields.map(f => ({ label: spokenId(f.id), required: f.required })),
    asset: profile.asset ? { noun: profile.asset.noun, fields: profile.asset.fields.map(f => spokenId(f.id)) } : null,
    items: items.map(i => ({ name: i.name, kind: i.kind, priceCents: i.priceCents, stocked: i.stocked, onHand: i.onHand }))
  };
}
```

- [ ] **Step 5: Crear `src/setup/tools.ts`**

```ts
import type { McpServer, RegisteredTool } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { Business } from '../domain/types.js';
import type { Profile } from '../profiles/schema.js';
import { say } from '../speech/say.js';
import { guard, ok } from '../tools/context.js';
import { instrument } from '../tools/instrument.js';
import type { ActivateResult, SetupService, StartResult } from './service.js';
import { SETUP_TOOL_NAMES } from './validate.js';
import { setupView, setupViewSchema } from './view.js';

export interface SetupToolContext {
  business: Business;
  setup: SetupService;
  /** Lo llama la activación: la sesión cambia las tools de alta por las nueve del perfil. */
  onActivated: (business: Business, profile: Profile) => void;
}

const [SET_UP, REVIEW, ACTIVATE] = SETUP_TOOL_NAMES;

const START_TEXT: Record<StartResult, string> = {
  started: "I'm drafting your setup. Ask me what I came up with in a few seconds.",
  busy: "I'm still working on your last description. Ask me what I came up with in a few seconds.",
  limited: "That's a lot of drafts in one hour. Give me a little while before trying again."
};

const NO_DRAFT = "There's no setup in progress. Tell me about your business, like: I run a flower shop that takes orders for bouquets.";
const STILL_DRAFTING = "I'm still drafting it. Ask me again in a few seconds.";

export function draftSummary(profile: Profile, itemCount: number): string {
  const steps = profile.stages.map(s => s.label);
  const things = `${itemCount} ${itemCount === 1 ? profile.nouns.item : profile.nouns.items}`;
  return `I set you up to track ${profile.nouns.orders} through ${steps.length} steps: ${say.list(steps)}, `
    + `with ${things} in your catalog. Should I turn it on?`;
}

/** El bridge arma su agente una vez por sesión de Alexa: las tools nuevas se ven al reabrir la Skill (Decisión 1). */
export function readyText(business: Business, profile: Profile): string {
  const tryIt = profile.due === 'none' ? `what ${profile.nouns.orders} are open?` : `what ${profile.nouns.orders} are due today?`;
  return `${business.name} is ready. Open me again, then try: ${tryIt}`;
}

function activateText(result: ActivateResult): string {
  switch (result.status) {
    case 'activated': return readyText(result.business, result.profile);
    case 'discarded': return 'Okay, I threw that draft away. Tell me about your business again whenever you are ready.';
    case 'none': return "There's no finished setup to turn on yet. Tell me about your business first.";
    case 'not_ready': return STILL_DRAFTING;
    case 'conflict': return 'Something changed while I was saving, so nothing was turned on. Ask me to review the setup again.';
  }
}

/** Las tres tools de un negocio en blanco (spec B2 §5.2). Solo escriben en el negocio del token. */
export function registerSetupTools(server: McpServer, ctx: SetupToolContext): RegisteredTool[] {
  const s = instrument(server, ctx);
  const bizId = ctx.business.id;

  const setUp = s.registerTool(
    SET_UP,
    {
      title: 'Set up my business',
      description: 'Draft the setup for this business from the user\'s own description of what they sell and the steps an order goes through. Use this when the user describes their business, for example "I run a flower shop". Drafting takes a few seconds; afterwards use review_business_setup.',
      inputSchema: z.object({
        description: z.string().min(3).describe('What the business does and sells, and the steps an order goes through, in the user\'s words.')
      }),
      outputSchema: z.object({ status: z.enum(['started', 'busy', 'limited']) })
    },
    guard(async ({ description }: { description: string }) => {
      const status = await ctx.setup.start(bizId, description);
      return ok(START_TEXT[status], { status });
    })
  );

  const review = s.registerTool(
    REVIEW,
    {
      title: 'Review business setup',
      description: 'Tell the user what setup was drafted for their business and ask whether to turn it on. Use this when the user asks what you came up with, how the setup looks, or whether it is ready.',
      inputSchema: z.object({}),
      outputSchema: setupViewSchema,
      annotations: { readOnlyHint: true, idempotentHint: true }
    },
    guard(async () => {
      const result = await ctx.setup.review(bizId);
      const message = result.state === 'ready' ? draftSummary(result.profile, result.items.length)
        : result.state === 'generating' ? STILL_DRAFTING
        : result.state === 'failed' ? result.spoken
        : NO_DRAFT;
      return ok(message, setupView(ctx.business.name, result, message));
    })
  );

  const activate = s.registerTool(
    ACTIVATE,
    {
      title: 'Turn on business setup',
      description: 'Turn on the drafted setup after the user clearly says yes, or throw it away when they say no or want to start over. Use this only after review_business_setup.',
      inputSchema: z.object({
        confirm: z.boolean().describe('True only if the user clearly said yes to turning the setup on; false if they said no or want to start over.')
      }),
      outputSchema: z.object({ status: z.enum(['activated', 'discarded', 'none', 'not_ready', 'conflict']) })
    },
    guard(async ({ confirm }: { confirm: boolean }) => {
      const result = await ctx.setup.activate(bizId, confirm);
      if (result.status === 'activated') ctx.onActivated(result.business, result.profile);
      return ok(activateText(result), { status: result.status });
    })
  );

  return [setUp, review, activate];
}
```

- [ ] **Step 6: `createApp` con negocios en blanco y cambio de tools**

En `src/http/app.ts`:

1. Imports nuevos:

```ts
import type { Profile } from '../profiles/schema.js';
import { unavailableGenerator, type DraftGenerator } from '../setup/generate.js';
import { SetupService } from '../setup/service.js';
import { registerSetupTools } from '../setup/tools.js';
import { registerUiResources } from '../tools/ui-assets.js';
```

2. Firma: sumar `generate?: DraftGenerator; now?: () => Date;` al tipo de `deps`.

3. Después de `const profiles = new ProfileCache(deps.store);`:

```ts
  const now = deps.now ?? (() => new Date());
  // Uno por proceso: el tope por hora y las generaciones en curso son del negocio, no de la sesión.
  const setup = new SetupService({ store: deps.store, generate: deps.generate ?? unavailableGenerator, now });

  const toolContext = (business: Business, profile: Profile): ToolContext => ({
    business, profile, store: deps.store, now, newId: prefix => `${prefix}-${randomUUID()}`
  });

  /** Negocio activo → sus nueve tools. En blanco → las tres de alta, que al activar se cambian por las nueve. */
  async function registerFor(server: McpServer, business: Business): Promise<void> {
    if (business.status === 'active') {
      registerTools(server, toolContext(business, await profiles.forBusiness(business)));
      return;
    }
    // Antes de conectar: las páginas que usará el perfil al activarse tienen que existir ya (Step 3b).
    registerUiResources(server, ['snapshot', 'sales-report']);
    const setupTools = registerSetupTools(server, {
      business, setup,
      onActivated: (active, profile) => {
        // La sesión sigue viva (spec B2 §5.2): fuera las de alta, dentro las del perfil, y se avisa al cliente.
        for (const tool of setupTools) tool.remove();
        registerTools(server, toolContext(active, profile));
        server.sendToolListChanged();
      }
    });
  }
```

4. En la creación de la sesión, reemplazar el bloque `const ctx: ToolContext = { … }; registerTools(server, ctx);` por `await registerFor(server, business);`.

5. Junto a `app.locals.sessions = sessions;`: `app.locals.setup = setup;`.

- [ ] **Step 7: Correr las pruebas**

Run: `npx vitest run test/integration/setup-flow.test.ts`
Expected: PASS. Si `listTools` después de activar todavía trae las de alta, revisar que `tool.remove()` se llame sobre los objetos que devolvió `registerTool` a través del proxy de `instrument` (el proxy devuelve lo que devuelve el servidor real).

- [ ] **Step 8: Verificación completa y commit**

Run: `npm test && npm run typecheck && npm run build` → verde.

```bash
git add src/setup/view.ts src/setup/tools.ts src/tools/instrument.ts src/tools/ui-assets.ts src/tools/context.ts src/http/app.ts test/integration/setup-flow.test.ts
git commit -m "feat: setup tools for blank businesses, swapped for the profile's tools on activation"
```

---

### Task 10: UI del borrador

**Files:**
- Modify: `ui/shared/render.ts`, `ui/shared/styles.css`, `ui/vite.config.ts`
- Create: `ui/setup/index.html`, `ui/setup/main.ts`
- Modify: `src/tools/ui-assets.ts`, `src/setup/tools.ts`
- Modify: `package.json` (`build:ui`), `test/global-setup.ts`
- Test: `test/unit/ui-render.test.ts`, `test/integration/setup-flow.test.ts`

**Interfaces:**
- Consumes: `setupViewSchema`, `SetupView` (Task 9).
- Produces:
  - `interface SetupView` (misma forma que el zod de la Task 9) y `setupHtml(v: SetupView): string` en `ui/shared/render.ts`.
  - `UI.setup = 'ui://counterpart/setup.html'`; `UiName` suma `'setup'` (`uiBundlePath` y `registerUiResources` de la Task 9 lo aceptan).

- [ ] **Step 1: Pruebas del render y del recurso**

En `test/unit/ui-render.test.ts`, sumar `setupHtml` al import y agregar:

```ts
  it('muestra el borrador: etapas con la de cierre marcada, campos y catálogo', () => {
    const html = setupHtml({
      state: 'ready', businessName: 'Petal and Stem', message: 'Should I turn it on?',
      nouns: { order: 'flower order', orders: 'flower orders', item: 'flower', items: 'flowers', customer: 'customer' },
      stages: [{ label: 'ordered', closing: false }, { label: 'delivered', closing: true }],
      orderFields: [{ label: 'card message', required: false }],
      asset: null,
      items: [{ name: 'Dozen roses bouquet', kind: 'product', priceCents: 6500, stocked: false, onHand: 0 }]
    });
    expect(html).toContain('Petal and Stem');
    expect(html).toContain('<li class="closing">delivered</li>');
    expect(html).toContain('card message (optional)');
    expect(html).toContain('$65.00');
  });

  it('muestra el mensaje cuando el borrador no está listo', () => {
    expect(setupHtml({ state: 'generating', businessName: '<b>x</b>', message: 'Still drafting.' }))
      .toBe('<section><h2>&lt;b&gt;x&lt;/b&gt;</h2><p class="empty">Still drafting.</p></section>');
  });
```

En `test/integration/setup-flow.test.ts`, agregar dentro del `describe`:

```ts
  it('la revisión lleva la UI del borrador', async () => {
    const client = await connect('token-iso');
    const tool = (await client.listTools()).tools.find(t => t.name === 'review_business_setup');
    expect((tool?._meta as { ui?: { resourceUri?: string } } | undefined)?.ui?.resourceUri).toBe('ui://counterpart/setup.html');
    const resource = await client.readResource({ uri: 'ui://counterpart/setup.html' });
    expect((resource.contents[0] as { text: string }).text).toContain('Counterpart · Setup');
  });
```

- [ ] **Step 2: Correr y ver fallar**

Run: `npx vitest run test/unit/ui-render.test.ts test/integration/setup-flow.test.ts`
Expected: FAIL — `setupHtml` no existe y la tool no lleva `_meta.ui`.

- [ ] **Step 3: Render en `ui/shared/render.ts`**

Agregar al final:

```ts
export interface SetupView {
  state: 'none' | 'generating' | 'failed' | 'ready';
  businessName: string;
  message: string;
  nouns?: { order: string; orders: string; item: string; items: string; customer: string };
  stages?: Array<{ label: string; closing: boolean }>;
  orderFields?: Array<{ label: string; required: boolean }>;
  asset?: { noun: string; fields: string[] } | null;
  items?: Array<{ name: string; kind: string; priceCents: number; stocked: boolean; onHand: number }>;
}

export function setupHtml(v: SetupView): string {
  if (v.state !== 'ready' || !v.nouns) {
    return `<section><h2>${escapeHtml(v.businessName)}</h2><p class="empty">${escapeHtml(v.message)}</p></section>`;
  }
  const steps = (v.stages ?? []).map(s => `<li${s.closing ? ' class="closing"' : ''}>${escapeHtml(s.label)}</li>`).join('');
  const fields = [
    ...(v.asset ? [`${v.asset.noun}: ${v.asset.fields.join(', ')}`] : []),
    ...(v.orderFields ?? []).map(f => `${f.label}${f.required ? '' : ' (optional)'}`)
  ];
  const fieldList = fields.length === 0
    ? `<p class="empty">Just the ${escapeHtml(v.nouns.customer)}'s name.</p>`
    : `<ul>${fields.map(f => `<li>${escapeHtml(f)}</li>`).join('')}</ul>`;
  const rows = (v.items ?? []).map(i =>
    `<tr><td>${escapeHtml(i.name)}</td><td>${escapeHtml(i.kind)}</td>`
    + `<td class="num">${money(i.priceCents)}</td><td class="num">${i.stocked ? i.onHand : '—'}</td></tr>`).join('');

  return `<section class="kpi"><div class="kpi-label">Setup draft</div>`
    + `<div class="kpi-value">${escapeHtml(v.businessName)}</div>`
    + `<p class="muted">Tracks ${escapeHtml(v.nouns.orders)} · catalog of ${escapeHtml(v.nouns.items)}</p></section>`
    + `<section><h2>Steps</h2><ol class="steps">${steps}</ol></section>`
    + `<section><h2>Each ${escapeHtml(v.nouns.order)} records</h2>${fieldList}</section>`
    + `<section><h2>Catalog</h2><table><thead><tr><th>Name</th><th>Kind</th><th class="num">Price</th><th class="num">On hand</th></tr></thead>`
    + `<tbody>${rows}</tbody></table></section>`;
}
```

- [ ] **Step 4: Estilos, página y build**

Agregar al final de `ui/shared/styles.css`:

```css
/* Borrador de configuración */
.steps { display: flex; flex-wrap: wrap; gap: 6px; list-style: none; padding: 0; margin: 0; counter-reset: step; }
.steps li { counter-increment: step; padding: 4px 10px; border-radius: 999px; border: 1px solid currentColor; opacity: .85; }
.steps li::before { content: counter(step) ". "; opacity: .6; }
.steps li.closing { font-weight: 600; opacity: 1; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th, td { text-align: left; padding: 4px 6px; border-bottom: 1px solid rgba(127, 127, 127, .25); }
td.num, th.num { text-align: right; }
```

`ui/setup/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Counterpart · Setup</title>
  </head>
  <body>
    <main id="root"><p class="empty">Loading…</p></main>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

`ui/setup/main.ts`:

```ts
import { App } from '@modelcontextprotocol/ext-apps';
import '../shared/styles.css';
import { setupHtml, type SetupView } from '../shared/render.ts';

const root = document.getElementById('root')!;
const app = new App({ name: 'counterpart-setup', version: '0.1.0' });

// Se asigna antes de conectar para no perder el primer resultado.
app.ontoolresult = result => {
  const data = result.structuredContent as SetupView | undefined;
  root.innerHTML = data ? setupHtml(data) : '<p class="empty">No draft yet.</p>';
};

void app.connect();
```

En `ui/vite.config.ts`, cambiar la guarda por:

```ts
// Una UI por corrida: `UI_NAME=snapshot`, `UI_NAME=sales-report` o `UI_NAME=setup`.
const name = process.env.UI_NAME;
if (name !== 'snapshot' && name !== 'sales-report' && name !== 'setup') {
  throw new Error('UI_NAME debe ser "snapshot", "sales-report" o "setup"');
}
```

En `package.json`, `build:ui` pasa a:

```json
"build:ui": "cross-env UI_NAME=snapshot vite build --config ui/vite.config.ts && cross-env UI_NAME=sales-report vite build --config ui/vite.config.ts && cross-env UI_NAME=setup vite build --config ui/vite.config.ts",
```

En `test/global-setup.ts`, la lista pasa a `(['snapshot', 'sales-report', 'setup'] as const)`.

- [ ] **Step 5: Recurso y tool con UI**

En `src/tools/ui-assets.ts` (ya por nombre e idempotente desde la Task 9): sumar `setup: 'ui://counterpart/setup.html'` a `UI`, cambiar `type UiName = 'snapshot' | 'sales-report' | 'setup';` y `const URI: Record<UiName, string> = { snapshot: UI.snapshot, 'sales-report': UI.salesReport, setup: UI.setup };`.

En `src/setup/tools.ts`: importar `import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';` y `import { registerUiResources, UI } from '../tools/ui-assets.js';`; cambiar `const review = s.registerTool(REVIEW, { … }, guard(…))` por `const review = registerAppTool(s, REVIEW, { …mismo objeto…, _meta: { ui: { resourceUri: UI.setup } } }, guard(…))`; y antes del `return`, `registerUiResources(s, ['setup']);`.

- [ ] **Step 6: Correr las pruebas**

Run: `npm run build:ui && npx vitest run test/unit/ui-render.test.ts test/integration/setup-flow.test.ts test/integration/mcp-apps.test.ts`
Expected: PASS.

- [ ] **Step 7: Verificación completa y commit**

Run: `npm test && npm run typecheck && npm run build` → verde.

```bash
git add ui src/tools/ui-assets.ts src/setup/tools.ts package.json test/global-setup.ts test/unit/ui-render.test.ts test/integration/setup-flow.test.ts
git commit -m "feat: add the setup draft MCP App"
```

---

### Task 11: Despliegue y voz del tercer negocio

**Files:**
- Modify: `src/index.ts`, `infra/iam/task-policy.json`, `README.md`, `docs/aws-builder.md`, `docs/friction-log.md`
- Repo central (privado): `video/reset-demo.sh`, `.gitignore`
- Clon nuevo: `D:\Repos\amazon-hackathon-2026\bridge-florist` (fork `Raul99Alejandro/alexa-skill-mcp-bridge`, rama `counterpart`)

**Interfaces:**
- Consumes: `novaDraftGenerator`, `bedrockConverse` (Task 7); `createApp({ generate })` (Task 9); `business:new` (Task 5).
- Produces: `COUNTERPART_SETUP_MODEL_ID` (variable de entorno, default `us.amazon.nova-2-lite-v1:0`); negocio `florist` en blanco en la tabla remota; Skill `petal and stem`.

- [ ] **Step 1: El servidor arma el generador de Nova**

En `src/index.ts`, agregar imports:

```ts
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { bedrockConverse, novaDraftGenerator } from './setup/generate.js';
```

y reemplazar `const app = createApp({ store, host, devBusinessId, hosts });` por:

```ts
// El asistente de configuración es lo único del servidor que llama a un modelo (spec B2 §3).
const setupModel = process.env.COUNTERPART_SETUP_MODEL_ID ?? 'us.amazon.nova-2-lite-v1:0';
const generate = novaDraftGenerator(bedrockConverse(new BedrockRuntimeClient({ region: cfg.region }), setupModel));
const app = createApp({ store, host, devBusinessId, hosts, generate });
```

- [ ] **Step 2: Política IAM: solo acciones que existen**

En `infra/iam/task-policy.json`, en `NovaForTheSetupAssistant`, `"Action"` pasa a `["bedrock:InvokeModel"]` (`bedrock:Converse` no es una acción de IAM; la API Converse se autoriza con `bedrock:InvokeModel` — deuda diferida de la revisión de la Etapa 1). `infra/deploy.sh` ya vuelve a aplicar la política en cada despliegue (`put-role-policy`, línea 65).

- [ ] **Step 3: README y documentación**

En `README.md`, tabla de `## Configuration`, agregar la fila:

```markdown
| `COUNTERPART_SETUP_MODEL_ID` | `us.amazon.nova-2-lite-v1:0` | Bedrock model the setup assistant uses to draft a blank business's profile and catalog |
```

En `README.md`, sección `## Connect the Alexa bridge`, agregar al final:

```markdown
The third bridge talks to a **blank** business created with `npm run business:new -- florist "Petal and Stem" --secret`: `counterpart/florist/token`, `petal and stem` and `CounterpartFloristBridge`. Its skill starts with the three setup tools; after you say yes to the draft, open the skill again and it answers with the new business's nine tools.
```

En `docs/aws-builder.md`, en la lista de servicios, agregar una línea para Bedrock desde el servidor: *"Amazon Bedrock (Nova 2 Lite) — the setup assistant drafts a new business's profile and catalog with forced tool use; the task role may call only `bedrock:InvokeModel` on the Nova 2 Lite inference profile."*

- [ ] **Step 4: Verificación local y commit**

Run: `npm test && npm run typecheck && npm run build` → verde.

```bash
git add src/index.ts infra/iam/task-policy.json README.md docs/aws-builder.md
git commit -m "feat: wire the setup assistant to Nova 2 Lite in the server"
```

- [ ] **Step 5: [dueño] Sesión de AWS**

Pedirle al dueño: `aws sso login --profile counterpart`. Explicarle antes, en una línea, que lo que sigue despliega la versión nueva (la URL no cambia) y resiembra el taller y la pastelería.

- [ ] **Step 6: Migrar los negocios del demo y desplegar**

Primero resembrar, después desplegar: el humo que corre `deploy.sh` al final necesita los negocios en el formato nuevo (sin `status`, el servidor nuevo los trataría como en blanco y el humo no encontraría las nueve tools). Mientras tanto el servidor viejo falla con los registros nuevos durante unos minutos; nadie lo está usando.

Run (Git Bash, desde `counterpart/`): `bash ../video/reset-demo.sh`
Expected: `Negocios shop y bakery borrados y vueltos a sembrar…` y la memoria de los dos bridges borrada.
Run: `AWS_PROFILE=counterpart npm run deploy`
Expected: termina con el humo remoto 6/6.

- [ ] **Step 7: Crear el negocio en blanco remoto**

Run: `npx cross-env AWS_PROFILE=counterpart COUNTERPART_STORE=dynamo npm run business:new -- florist "Petal and Stem" --secret`
Expected: `Negocio en blanco "florist" (Petal and Stem) creado…` y `Token emitido y guardado en el secreto "counterpart/florist/token"…`. Nada impreso en stdout.

- [ ] **Step 8: Reset del demo para las tomas (repo central)**

En `D:\Repos\amazon-hackathon-2026\video\reset-demo.sh`, después de la resiembra de shop y bakery, agregar:

```bash
echo "==> Dejar Petal and Stem en blanco"
(cd "$ROOT/counterpart" && npx cross-env COUNTERPART_STORE=dynamo COUNTERPART_ALLOW_REMOTE_RESET=1 npm run business:new -- florist "Petal and Stem" --reset 2>&1 | grep -E "blanco" || true)
```

y cambiar `for BRIDGE in bridge-shop bridge-bakery; do` por `for BRIDGE in bridge-shop bridge-bakery bridge-florist; do`. En `D:\Repos\amazon-hackathon-2026\.gitignore`, agregar `/bridge-florist/` junto a los otros clones. Commit en el repo central:

```bash
git -C /d/Repos/amazon-hackathon-2026 add video/reset-demo.sh .gitignore
git -C /d/Repos/amazon-hackathon-2026 commit -m "chore: reset the blank florist business with the demo"
```

(La línea de `bridge-florist` en el loop de memoria solo funciona después del Step 9, cuando exista `bridge-florist/cdk-outputs.json`.)

- [ ] **Step 9: [dueño + Claude] Tercer bridge**

1. Clonar: `git clone -b counterpart https://github.com/Raul99Alejandro/alexa-skill-mcp-bridge.git /d/Repos/amazon-hackathon-2026/bridge-florist` y `npm ci` dentro.
2. Copiar `.env` de `bridge-shop` y cambiar solo: `BRIDGE_MCP_SECRET_NAME=counterpart/florist/token`, `BRIDGE_INVOCATION_NAME=petal and stem`, `BRIDGE_STACK_NAME=CounterpartFloristBridge`, y **borrar** `BRIDGE_LAMBDA_ARN` y `BRIDGE_SKILL_ID` (son del taller; el despliegue los escribe de nuevo). `BRIDGE_MCP_URL` es la misma.
3. `npm run generate && npm run deploy` (Claude). **[dueño]** `npm run skill:deploy` usa sus credenciales de ASK/LWA ya guardadas como variables de entorno de Windows desde la Etapa 1; si pide iniciar sesión, lo hace él. Después, `npm run deploy` otra vez (Claude).
4. **[dueño]** Habilitar la pestaña Test de la Skill en la consola de Alexa (modo Development).

- [ ] **Step 10: Verificar la voz en el simulador (y la Decisión 1)**

Con el dueño en la consola de Alexa (pestaña Test), en este orden:

1. "open petal and stem"
2. "I run a flower shop. We take orders for bouquets and centerpieces, arrange them, and they're ready for pickup or delivery."
3. Esperar ~15 s. "what did you come up with?" → resumen en dos oraciones que termina en *"Should I turn it on?"*
4. "yes, turn it on" → *"Petal and Stem is ready. Open me again, then try: …"*
5. "stop". Luego "open petal and stem" → "take an order for Maria Lopez, a dozen roses for Friday" → "what flower orders are due Friday?"

Expected: en CloudWatch (`/ecs/counterpart`), líneas `msg: "tool"` con `set_up_my_business`, `review_business_setup`, `activate_business_setup` y, tras reabrir, las tools del perfil generado. Si en el paso 5 el agente no tiene las tools nuevas (el log del bridge `mcp session ready` lista las tres de alta), **parar** y reportarlo al dueño con ese log: invalida la Decisión 1 y el arreglo va en el fork (reconstruir el agente al cambiar la lista de tools), con su propio plan.

- [ ] **Step 11: Frases de oro sin regresión**

Run: `npx cross-env AWS_PROFILE=counterpart npm run golden -- auto-repair` y luego `-- bakery`.
Expected: taller ≥ 21/22 y pastelería ≥ 21/23 (la meta del spec es 18/20 o más; en la Etapa 1 quedaron 22/22 y 23/23). Si baja de la meta, la causa probable es el cambio de descripciones de la Task 5; ajustar descripciones, nunca frases.

- [ ] **Step 12: Registro y commit**

Anotar en `docs/friction-log.md` lo que haya aparecido (tiempos de generación medidos en el simulador, si hizo falta la reparación, cualquier tropiezo del tercer bridge). Commit:

```bash
git add docs/friction-log.md
git commit -m "docs: record the setup assistant deployment and voice run"
```

---

## Fase C — Deuda del Plan B1 (spec §5.5) e interoperabilidad (spec §5.6)

Orden de recorte si falta tiempo (spec §5.8, corte el 4 oct): primero las Tasks 14 y 15 (deuda menor), después la UI del borrador ya hecha queda como está, y la Task 16 se reduce a la verificación por HTTP directo.

### Task 12: Deuda del store (spec §5.5, puntos 1–3)

**Files:**
- Modify: `src/store/store.ts`, `src/store/memory.ts`, `src/store/dynamo.ts`
- Test: `test/contract/store-contract.ts`, `test/integration/dynamo-store.test.ts`

**Interfaces:**
- Consumes: el contrato de la Task 1.
- Produces: `Store.putToken(tokenHash: string, bizId: string, createdAt?: string): Promise<void>`; lecturas de un negocio inexistente devuelven vacío/null en ambos stores; `putPurchaseOrders` en una transacción en `DynamoStore`.

- [ ] **Step 1: Pruebas**

En `test/contract/store-contract.ts`, dentro del `describe`, agregar:

```ts
    it('lee vacío un negocio inexistente, igual en los dos stores', async () => {
      const store = await ready();
      expect(await store.listCustomers('nadie')).toEqual([]);
      expect(await store.listAssets('nadie')).toEqual([]);
      expect(await store.listOrders('nadie')).toEqual([]);
      expect(await store.getOrder('nadie', 'o1')).toBeNull();
      expect(await store.listItems('nadie')).toEqual([]);
      expect(await store.listPayments('nadie', '2026-01-01', '2026-12-31')).toEqual([]);
      expect(await store.listOpenPurchaseOrders('nadie')).toEqual([]);
    });

    it('guarda todas las órdenes de compra de una vez, y una lista vacía no hace nada', async () => {
      const store = await ready();
      await store.putPurchaseOrders('b1', []);
      const po = (id: string): PurchaseOrder => ({ id, supplierId: 's1', lines: [{ itemId: 'i1', qty: 5 }], status: 'open', createdAt: '2026-09-15T15:00:00.000Z' });
      await store.putPurchaseOrders('b1', [po('p1'), po('p2'), po('p3')]);
      expect((await store.listOpenPurchaseOrders('b1')).map(p => p.id).sort()).toEqual(['p1', 'p2', 'p3']);
    });
```

En `test/integration/dynamo-store.test.ts`, agregar dentro del bloque que corre con DynamoDB Local (usar el cliente y la tabla que ya crea ese archivo):

```ts
  it('guarda cuándo se emitió cada token', async () => {
    const store = new DynamoStore(client, table);
    await store.putToken('hash-fecha', 'b1', '2026-09-30T12:00:00.000Z');
    const out = await client.send(new GetItemCommand({ TableName: table, Key: { pk: { S: 'TOKEN#hash-fecha' }, sk: { S: 'TOKEN' } } }));
    expect(out.Item?.createdAt?.S).toBe('2026-09-30T12:00:00.000Z');
  });
```

(con `GetItemCommand` importado de `@aws-sdk/client-dynamodb`; si en ese archivo el cliente o la tabla tienen otro nombre, usar esos).

- [ ] **Step 2: Correr y ver fallar**

Run: `npx vitest run test/unit/memory-store.test.ts`
Expected: FAIL — `negocio desconocido: nadie` en la prueba de lecturas. Si alguna prueba existente de `test/unit/memory-store.test.ts` espera que una **lectura** de un negocio desconocido lance, cambiar su expectativa a vacío/null: el spec §5.5.3 pide igualar los dos stores y DynamoDB lee vacío. Las escrituras siguen lanzando en memoria.

- [ ] **Step 3: Implementar**

`src/store/store.ts`: `putToken(tokenHash: string, bizId: string, createdAt?: string): Promise<void>;` y, encima de `export interface Store`, el comentario:

```ts
/**
 * Lecturas de un negocio que no existe devuelven vacío o null en los dos stores. Las escrituras suponen
 * un negocio existente: quien llama siempre lo resolvió antes por su token.
 */
```

`src/store/memory.ts`:
- `private tokens = new Map<string, { bizId: string; createdAt: string }>();`
- `async putToken(tokenHash: string, bizId: string, createdAt = new Date().toISOString()): Promise<void> { this.tokens.set(tokenHash, { bizId, createdAt }); }`
- `getBusinessByTokenHash`: `const bizId = this.tokens.get(tokenHash)?.bizId;`
- Las lecturas usan un helper que no lanza:

```ts
  /** Lecturas: un negocio inexistente se lee vacío, como en DynamoDB. */
  private peek(bizId: string): Tenant | undefined {
    return this.tenants.get(bizId);
  }
```

y `listCustomers`, `listAssets`, `listOrders`, `getOrder`, `listItems`, `listPayments`, `listOpenPurchaseOrders` usan `this.peek(bizId)` con `?? []` / `?? null`, por ejemplo:

```ts
  async listCustomers(bizId: string): Promise<Customer[]> { return copy([...(this.peek(bizId)?.customers.values() ?? [])]); }
  async getOrder(bizId: string, orderId: string): Promise<Order | null> {
    const o = this.peek(bizId)?.orders.get(orderId);
    return o ? copy(o) : null;
  }
  async listPayments(bizId: string, from: string, to: string): Promise<Payment[]> {
    return copy((this.peek(bizId)?.payments ?? []).filter(p => p.paidOn >= from && p.paidOn <= to));
  }
```

(igual para `listAssets`, `listOrders`, `listItems` y `listOpenPurchaseOrders`).

`src/store/dynamo.ts`:

```ts
  async putToken(tokenHash: string, bizId: string, createdAt = new Date().toISOString()): Promise<void> {
    await this.put(`TOKEN#${tokenHash}`, 'TOKEN', { businessId: bizId, createdAt });
  }
```

```ts
  async putPurchaseOrders(bizId: string, pos: PurchaseOrder[]): Promise<void> {
    if (pos.length === 0) return;
    if (pos.length > TRANSACTION_LIMIT) throw new Error(`putPurchaseOrders admite hasta ${TRANSACTION_LIMIT} órdenes por llamada`);
    // Una transacción: un reorden con varios proveedores queda completo o no queda.
    await this.doc.send(new TransactWriteCommand({
      TransactItems: pos.map(po => ({ Put: { TableName: this.table, Item: { ...po, pk: bizKey(bizId), sk: `PO#${po.id}` } } }))
    }));
  }
```

- [ ] **Step 4: Correr y verificar**

Run: `npm test && npm run typecheck && npm run build` → verde. Con DynamoDB Local disponible: `npm run test:dynamo` → verde.

- [ ] **Step 5: Commit**

```bash
git add src/store test/contract test/integration/dynamo-store.test.ts
git commit -m "fix: same reads for unknown businesses, token dates and atomic purchase orders"
```

---

### Task 13: UI en el chequeo de tipos y reporte de ventas con días equivalentes (spec §5.5, puntos 4–6)

**Files:**
- Create: `ui/tsconfig.json`
- Modify: `package.json` (`typecheck`)
- Modify: `src/domain/dates.ts`, `src/domain/reports.ts`, `src/tools/sales-report.ts`, `ui/shared/render.ts`, `ui/shared/styles.css`
- Test: `test/unit/dates.test.ts`, `test/unit/reports.test.ts`, `test/unit/ui-render.test.ts`

**Interfaces:**
- Consumes: `shiftDays`, `businessToday` de `src/domain/dates.ts`.
- Produces: `datesBetween(from: string, to: string): string[]`; `SalesReport.prevDaily: Array<{ date; cents }>` y `daily` con todos los días del rango (ceros incluidos); `salesChartSvg(daily, prevDaily = [], width = 560, height = 180)`; `periodRange('this_week' | 'this_month')` hasta hoy contra los mismos días del periodo anterior.

- [ ] **Step 1: La UI entra al chequeo de tipos**

Crear `ui/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "lib": ["ES2023", "DOM"],
    "types": ["vite/client", "node"]
  },
  "include": ["**/*.ts"]
}
```

En `package.json`: `"typecheck": "tsc -p tsconfig.json --noEmit && tsc -p ui/tsconfig.json",`.

Run: `npm run typecheck`
Expected: limpio. Si aparece un error en `ui/`, es deuda real que el chequeo destapa: corregir el tipo en el archivo que señala (sin `any` ni `@ts-ignore`) y volver a correr.

- [ ] **Step 2: Pruebas de periodos y del reporte**

En `test/unit/dates.test.ts`, agregar (y cambiar cualquier expectativa existente de `this_week`/`this_month` que termine en domingo o fin de mes: el spec §5.5.6 cambia el §7.4 del spec base):

```ts
describe('periodos que comparan días equivalentes (spec B2 §5.5.6)', () => {
  const wednesday = new Date('2026-09-16T17:00:00Z'); // miércoles en Chicago

  it('this_week va de lunes a hoy contra los mismos días de la semana pasada', () => {
    expect(periodRange('this_week', 'America/Chicago', wednesday))
      .toEqual({ from: '2026-09-14', to: '2026-09-16', prevFrom: '2026-09-07', prevTo: '2026-09-09' });
  });

  it('last_week sigue comparando semanas completas', () => {
    expect(periodRange('last_week', 'America/Chicago', wednesday))
      .toEqual({ from: '2026-09-07', to: '2026-09-13', prevFrom: '2026-08-31', prevTo: '2026-09-06' });
  });

  it('this_month va del 1 a hoy contra los mismos días del mes pasado, sin pasarse de su fin', () => {
    expect(periodRange('this_month', 'America/Chicago', wednesday))
      .toEqual({ from: '2026-09-01', to: '2026-09-16', prevFrom: '2026-08-01', prevTo: '2026-08-16' });
    expect(periodRange('this_month', 'America/Chicago', new Date('2026-03-30T17:00:00Z')))
      .toEqual({ from: '2026-03-01', to: '2026-03-30', prevFrom: '2026-02-01', prevTo: '2026-02-28' });
  });

  it('datesBetween incluye los dos extremos', () => {
    expect(datesBetween('2026-02-27', '2026-03-01')).toEqual(['2026-02-27', '2026-02-28', '2026-03-01']);
  });
});
```

(con `datesBetween` sumado al import de `../../src/domain/dates.js`).

En `test/unit/reports.test.ts`, agregar:

```ts
it('el reporte trae todos los días del rango y la serie del periodo anterior alineada', () => {
  const pay = (id: string, paidOn: string, amountCents: number): Payment =>
    ({ id, orderId: id, amountCents, method: 'cash', paidAt: `${paidOn}T18:00:00.000Z`, paidOn });
  const report = buildSalesReport({
    range: { from: '2026-09-14', to: '2026-09-16', prevFrom: '2026-09-07', prevTo: '2026-09-09' },
    payments: [pay('a', '2026-09-15', 1000), pay('b', '2026-09-07', 500)], orders: []
  });
  expect(report.daily).toEqual([
    { date: '2026-09-14', cents: 0 }, { date: '2026-09-15', cents: 1000 }, { date: '2026-09-16', cents: 0 }
  ]);
  expect(report.prevDaily).toEqual([
    { date: '2026-09-07', cents: 500 }, { date: '2026-09-08', cents: 0 }, { date: '2026-09-09', cents: 0 }
  ]);
});
```

(importando `Payment` de `../../src/domain/types.js` si no está). Si una prueba existente espera `daily` solo con los días con ventas, actualizar su expectativa a la serie completa (spec §5.5.5).

En `test/unit/ui-render.test.ts`, agregar:

```ts
  it('la gráfica etiqueta los días y dibuja el periodo anterior', () => {
    const svg = salesChartSvg(
      [{ date: '2026-09-14', cents: 1000 }, { date: '2026-09-15', cents: 0 }],
      [{ date: '2026-09-07', cents: 500 }, { date: '2026-09-08', cents: 800 }]
    );
    expect(svg).toContain('>Mon</text>');
    expect(svg).toContain('>Tue</text>');
    expect(svg.match(/class="prev"/g)).toHaveLength(2);
  });
```

- [ ] **Step 3: Correr y ver fallar**

Run: `npx vitest run test/unit/dates.test.ts test/unit/reports.test.ts test/unit/ui-render.test.ts`
Expected: FAIL — `datesBetween` no existe, `this_week` termina en domingo, no hay `prevDaily` ni etiquetas.

- [ ] **Step 4: Periodos en `src/domain/dates.ts`**

Reemplazar `periodRange` y `monthRange` por:

```ts
/** Todas las fechas civiles de `from` a `to`, inclusive. */
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = shiftDays(d, 1)) out.push(d);
  return out;
}

function previousMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

function daysInMonth(ym: string): number {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

const dayOf = (ym: string, day: number): string => `${ym}-${String(day).padStart(2, '0')}`;

/**
 * Rangos inclusivos del periodo y del periodo anterior. Semanas de lunes a domingo. Los periodos en
 * curso (`this_week`, `this_month`) van hasta hoy y se comparan contra los mismos días del periodo
 * anterior (spec B2 §5.5.6, que cambia el §7.4 del spec base).
 */
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
      return { from, to: today, prevFrom: shiftDays(from, -7), prevTo: shiftDays(today, -7) };
    }
    case 'last_week': {
      const from = shiftDays(today, -mondayOffset - 7);
      return { from, to: shiftDays(from, 6), prevFrom: shiftDays(from, -7), prevTo: shiftDays(from, -1) };
    }
    case 'this_month': {
      const ym = today.slice(0, 7);
      const prev = previousMonth(ym);
      const day = Number(today.slice(8));
      return { from: dayOf(ym, 1), to: today, prevFrom: dayOf(prev, 1), prevTo: dayOf(prev, Math.min(day, daysInMonth(prev))) };
    }
    case 'last_month': {
      const ym = previousMonth(today.slice(0, 7));
      const prev = previousMonth(ym);
      return { from: dayOf(ym, 1), to: dayOf(ym, daysInMonth(ym)), prevFrom: dayOf(prev, 1), prevTo: dayOf(prev, daysInMonth(prev)) };
    }
  }
}
```

- [ ] **Step 5: Reporte, salida de la tool y gráfica**

`src/domain/reports.ts`: sumar `import { datesBetween } from './dates.js';`, agregar `prevDaily: Array<{ date: string; cents: number }>;` a la interfaz `SalesReport`, y en `buildSalesReport` reemplazar el armado de `byDay` y la línea `daily:` por:

```ts
  /** Serie diaria completa del rango, con ceros: así las dos series quedan alineadas día por día. */
  const series = (from: string, to: string, list: Payment[]) => {
    const sums = new Map<string, number>();
    for (const p of list) sums.set(day(p), (sums.get(day(p)) ?? 0) + p.amountCents);
    return datesBetween(from, to).map(date => ({ date, cents: sums.get(date) ?? 0 }));
  };
```

```ts
    daily: series(range.from, range.to, current),
    prevDaily: series(range.prevFrom, range.prevTo, previous),
```

`src/tools/sales-report.ts`: en `output`, sumar `prevDaily: z.array(z.object({ date: z.string(), cents: z.number() })),`.

`ui/shared/render.ts`: sumar `prevDaily: Array<{ date: string; cents: number }>;` a `SalesReportView`; reemplazar `salesChartSvg` por:

```ts
type Point = { date: string; cents: number };
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dayLabel(date: string, count: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  return count <= 7 ? WEEKDAYS[d.getUTCDay()]! : String(d.getUTCDate());
}

/** Barras del periodo con la del periodo anterior detrás, en gris, y etiquetas de fecha. */
export function salesChartSvg(daily: Point[], prevDaily: Point[] = [], width = 560, height = 180): string {
  if (daily.length === 0 || [...daily, ...prevDaily].every(d => d.cents === 0)) {
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="No sales in this period">`
      + `<text x="${width / 2}" y="${height / 2}" text-anchor="middle" class="muted">No sales in this period</text></svg>`;
  }
  const chart = height - 20; // espacio para las etiquetas
  const max = Math.max(1, ...daily.map(d => d.cents), ...prevDaily.map(d => d.cents));
  const gap = 4;
  const barWidth = Math.max(2, Math.floor((width - gap * (daily.length - 1)) / daily.length));
  const scale = (cents: number): number => Math.round((cents / max) * (chart - 10));
  const every = daily.length <= 7 ? 1 : 7;

  const parts = daily.map((d, i) => {
    const x = i * (barWidth + gap);
    const prev = prevDaily[i];
    const ghost = prev
      ? `<rect class="prev" x="${x}" y="${chart - scale(prev.cents)}" width="${barWidth}" height="${scale(prev.cents)}" rx="2">`
        + `<title>${escapeHtml(prev.date)}: ${money(prev.cents)}</title></rect>`
      : '';
    const inner = Math.max(1, Math.round(barWidth / 2));
    const bar = `<rect x="${x + Math.round((barWidth - inner) / 2)}" y="${chart - scale(d.cents)}" width="${inner}" height="${scale(d.cents)}" rx="2">`
      + `<title>${escapeHtml(d.date)}: ${money(d.cents)}</title></rect>`;
    const label = i % every === 0
      ? `<text class="axis" x="${x + barWidth / 2}" y="${height - 4}" text-anchor="middle">${dayLabel(d.date, daily.length)}</text>`
      : '';
    return ghost + bar + label;
  }).join('');
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Daily sales, with the previous period in gray">${parts}</svg>`;
}
```

y en `salesReportHtml`, `${salesChartSvg(r.daily)}` pasa a `${salesChartSvg(r.daily, r.prevDaily)}`. En `test/unit/ui-render.test.ts`, los objetos de prueba de `SalesReportView` (el que tiene `daily: []` en la línea 44) suman `prevDaily: []`.

`ui/shared/styles.css`, agregar:

```css
rect.prev { fill: rgba(127, 127, 127, .35); }
text.axis { font-size: 11px; fill: currentColor; opacity: .6; }
```

- [ ] **Step 6: Correr y verificar**

Run: `npm run build:ui && npm test && npm run typecheck && npm run build`
Expected: todo verde (incluido el chequeo de tipos de `ui/`).

- [ ] **Step 7: Commit**

```bash
git add ui src/domain/dates.ts src/domain/reports.ts src/tools/sales-report.ts package.json test/unit
git commit -m "feat: compare equivalent days, label the sales chart and type-check the UI"
```

---

### Task 14: Deuda menor de dominio (spec §5.5, punto 7a) — recortable

**Files:**
- Modify: `src/domain/resolver.ts`, `src/domain/inventory.ts`, `src/domain/orders.ts` (solo comentario)
- Test: `test/unit/resolver.test.ts`, `test/unit/inventory.test.ts`, `test/unit/orders.test.ts`

**Interfaces:**
- Produces: `TIE_MARGIN = 0.15` y `pickBest<T>(scored: Array<{ value: T; score: number }>): { kind: 'one'; value: T } | { kind: 'none' } | { kind: 'ambiguous'; values: T[] }` en `src/domain/resolver.ts`. `findItem` y `resolveOrder` lo usan; `findItem` ya no sugiere ítems con puntaje 0; `addLineToOrder` lanza `RangeError` con cantidad ≤ 0; `planReorder` nunca pide menos de 1.

Ya resueltos en B1/Etapa 1 (verificar con `grep` y no tocar): concordancia `was/were` (`say.lineAdded`), `notFound` en singular, ids reservados en `parseProfile`, `plate` en el resolver, filtro de `.ts` en `copy-assets.mjs`, `toy.ts` fuera del build.

- [ ] **Step 1: Pruebas**

`test/unit/resolver.test.ts`, agregar:

```ts
describe('pickBest', () => {
  it('elige el mejor, empata dentro del margen y descarta lo que no llega al umbral', () => {
    expect(pickBest([{ value: 'a', score: 1 }, { value: 'b', score: 0.5 }])).toEqual({ kind: 'one', value: 'a' });
    expect(pickBest([{ value: 'a', score: 0.9 }, { value: 'b', score: 0.8 }])).toEqual({ kind: 'ambiguous', values: ['a', 'b'] });
    expect(pickBest([{ value: 'a', score: 0.4 }])).toEqual({ kind: 'none' });
    expect(pickBest([])).toEqual({ kind: 'none' });
  });
});
```

`test/unit/inventory.test.ts`, agregar (usar el catálogo de prueba que ya exista en el archivo, o crear uno con dos ítems como el del ejemplo):

```ts
it('no sugiere como "closest matches" ítems que no se parecen en nada', () => {
  const items = [
    { id: 'a', name: 'Brake pads', synonyms: [], kind: 'part', unit: 'each', priceCents: 1, taxable: true, stocked: true, onHand: 1, reorderPoint: 0, reorderQty: 1, consumes: {}, version: 1 },
    { id: 'b', name: 'Brake rotor', synonyms: [], kind: 'part', unit: 'each', priceCents: 1, taxable: true, stocked: true, onHand: 1, reorderPoint: 0, reorderQty: 1, consumes: {}, version: 1 }
  ] as CatalogItem[];
  expect(findItem('windshield', items)).toEqual({ kind: 'none', suggestions: [] });
});

it('rechaza cantidades de cero o menos', () => {
  const item = { id: 'a', name: 'Pads', synonyms: [], kind: 'part', unit: 'each', priceCents: 1, taxable: true, stocked: true, onHand: 1, reorderPoint: 0, reorderQty: 1, consumes: {}, version: 1 } as CatalogItem;
  expect(() => addLineToOrder(item, 0, [item])).toThrow(RangeError);
});

it('un reorden nunca pide menos de uno aunque reorderQty sea 0', () => {
  const item = { id: 'a', name: 'Pads', synonyms: [], kind: 'part', unit: 'each', priceCents: 1, taxable: true, stocked: true, onHand: 0, reorderPoint: 2, reorderQty: 0, consumes: {}, version: 1 } as CatalogItem;
  expect(planReorder([item], [], []).purchaseOrders[0]?.lines[0]?.qty).toBe(1);
});
```

`test/unit/orders.test.ts`, agregar (la rama `closed` de `moveStage` es API pública del dominio aunque `move.ts` no llegue a ella: queda documentada con su prueba):

```ts
it('no mueve una orden cerrada', () => {
  const closed = { ...newOrder({ id: 'o', number: 1, customerId: 'c', fields: {}, stage: 'picked_up', now: new Date() }) };
  expect(moveStage(closed, 'in_bay', profile, new Date())).toEqual({ ok: false, code: 'INVALID_STAGE', reason: 'closed' });
});
```

(sumar a los imports lo que falte: `pickBest`, `findItem`, `addLineToOrder`, `planReorder`, `newOrder`, `moveStage`, `CatalogItem`).

- [ ] **Step 2: Correr y ver fallar**

Run: `npx vitest run test/unit/resolver.test.ts test/unit/inventory.test.ts test/unit/orders.test.ts`
Expected: FAIL en `pickBest` (no existe), sugerencias con puntaje 0, cantidad 0 aceptada y reorden de 0. La de `moveStage` pasa ya (documenta).

- [ ] **Step 3: Implementar**

`src/domain/resolver.ts`, debajo de `MATCH_THRESHOLD`:

```ts
/** Dos candidatos a menos de esto del mejor cuentan como empate. */
export const TIE_MARGIN = 0.15;

/** Un solo criterio para elegir entre candidatos puntuados: órdenes e ítems usan el mismo (carryover §5). */
export function pickBest<T>(scored: Array<{ value: T; score: number }>):
  | { kind: 'one'; value: T } | { kind: 'none' } | { kind: 'ambiguous'; values: T[] } {
  const sorted = [...scored].sort((a, b) => b.score - a.score);
  const best = sorted[0];
  if (!best || best.score < MATCH_THRESHOLD) return { kind: 'none' };
  const tied = sorted.filter(s => best.score - s.score <= TIE_MARGIN);
  if (tied.length > 1) return { kind: 'ambiguous', values: tied.slice(0, 5).map(s => s.value) };
  return { kind: 'one', value: best.value };
}
```

y en `resolveOrder`, reemplazar desde `const scored = candidates` hasta el final de la función por:

```ts
  const picked = pickBest(candidates.map(ref => ({ value: ref, score: scoreOrder(tokens, ref) })));
  if (picked.kind === 'none') return byNumber ? { kind: 'one', ref: byNumber } : { kind: 'none' };
  if (picked.kind === 'ambiguous') return { kind: 'ambiguous', refs: picked.values };
  return { kind: 'one', ref: picked.value };
```

`src/domain/inventory.ts`: cambiar el import a `import { pickBest, tokenScore } from './resolver.js';`, reemplazar el cuerpo de `findItem` por:

```ts
  const scored = items.map(item => ({ value: item, score: tokenScore(query, [item.name, ...item.synonyms].join(' ')) }));
  const picked = pickBest(scored);
  if (picked.kind === 'one') return { kind: 'one', item: picked.value };
  if (picked.kind === 'ambiguous') return { kind: 'ambiguous', candidates: picked.values };
  // Sugerencias solo si se parecen en algo: tres ítems con puntaje 0 no son "closest matches".
  const suggestions = scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score).slice(0, 3).map(s => s.value);
  return { kind: 'none', suggestions };
```

al principio de `addLineToOrder`:

```ts
  // El esquema de la tool ya exige positive(); esto protege a quien llame al dominio directo.
  if (!(quantity > 0)) throw new RangeError(`la cantidad debe ser mayor que cero, no ${quantity}`);
```

y en `planReorder`, `qty: item.reorderQty + (backorders.get(item.id) ?? 0)` pasa a `qty: Math.max(1, item.reorderQty) + (backorders.get(item.id) ?? 0)`.

- [ ] **Step 4: Correr y verificar**

Run: `npm test && npm run typecheck && npm run build` → verde.

- [ ] **Step 5: Commit**

```bash
git add src/domain test/unit
git commit -m "refactor: one pickBest for orders and items, and guard quantities"
```

---

### Task 15: Deuda menor de sesiones, cierre y empaque (spec §5.5, punto 7b) — recortable

**Files:**
- Modify: `src/http/app.ts`, `src/tools/close-out.ts`, `package.json`
- Create: `test/integration/open-dedup.test.ts`
- Test: `test/integration/http.test.ts`, `test/integration/write-tools.test.ts`

**Interfaces:**
- Consumes: `isInitializeRequest` de `@modelcontextprotocol/server`; `toolContext` (Task 2).
- Produces: `/mcp` sin session id responde 400 salvo que sea `initialize` (no se crea `McpServer` ni transporte); el `alreadyClosed` de `close_out` devuelve el método de pago registrado.

- [ ] **Step 1: Pruebas**

`test/integration/http.test.ts`, agregar (con el `base` y el token de negocio que ya usa el archivo):

```ts
it('sin session id solo acepta initialize y no deja servidores huérfanos', async () => {
  const before = (app.locals.sessions as Sessions).countFor('b1');
  const res = await fetch(`${base}/mcp`, {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })
  });
  expect(res.status).toBe(400);
  expect((app.locals.sessions as Sessions).countFor('b1')).toBe(before);
});
```

(si el archivo nombra distinto la app, la URL o el token, usar esos nombres; importar `Sessions` de `../../src/http/sessions.js`).

`test/integration/write-tools.test.ts`, agregar dentro del bloque del taller (usando el cliente o contexto de ese bloque):

```ts
it('repetir un cierre informa el método de pago que quedó registrado', async () => {
  // Nina Patel (CX-5) está lista para recoger en la semilla.
  await client.callTool({ name: 'close_out_work_order', arguments: { order: 'the CX-5', paymentMethod: 'card' } });
  const again = await client.callTool({ name: 'close_out_work_order', arguments: { order: 'the CX-5', paymentMethod: 'cash' } });
  expect(again.structuredContent).toMatchObject({ alreadyClosed: true, method: 'card' });
});
```

(si ese bloque llama a las tools con otro helper, usar ese helper con los mismos argumentos).

Crear `test/integration/open-dedup.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { McpServer } from '@modelcontextprotocol/server';
import { MemoryStore } from '../../src/store/memory.js';
import { registerTools } from '../../src/tools/context.js';
import { seedAll } from '../../seed/run.js';
import { toolContext } from '../helpers/context.js';

const START = new Date('2026-09-15T15:00:00Z');

async function connect(clock: { now: Date }): Promise<Client> {
  const store = new MemoryStore();
  await seedAll(store, START);
  const server = new McpServer({ name: 'counterpart', version: '0.1.0' });
  let n = 0;
  registerTools(server, await toolContext(store, 'shop', { now: () => clock.now, newId: p => `${p}-${++n}` }));
  const [clientEnd, serverEnd] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'dedup', version: '1.0.0' });
  await server.server.connect(serverEnd);
  await client.connect(clientEnd);
  return client;
}

const open = (client: Client) => client.callTool({
  name: 'open_work_order', arguments: { customerName: 'Sam Reyes', asset: { year: 2020, make: 'Ford', model: 'F-150' } }
});
const orderId = (r: { structuredContent?: unknown }) => (r.structuredContent as { orderId: string }).orderId;

describe('ventana de idempotencia de open (§7.8), en su borde', () => {
  it('a 1 min 59 s es la misma orden', async () => {
    const clock = { now: START };
    const client = await connect(clock);
    const first = orderId(await open(client));
    clock.now = new Date(START.getTime() + 119_000);
    expect(orderId(await open(client))).toBe(first);
  });

  it('a 2 min 1 s es una orden nueva', async () => {
    const clock = { now: START };
    const client = await connect(clock);
    const first = orderId(await open(client));
    clock.now = new Date(START.getTime() + 121_000);
    expect(orderId(await open(client))).not.toBe(first);
  });
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `npx vitest run test/integration/http.test.ts test/integration/write-tools.test.ts test/integration/open-dedup.test.ts`
Expected: FAIL en el 400 (hoy responde otra cosa y crea servidor) y en `method: 'card'`. Las dos del borde pasan ya (documentan).

- [ ] **Step 3: Implementar**

`src/http/app.ts`: sumar `isInitializeRequest` al import de `@modelcontextprotocol/server` y, justo antes del chequeo del tope de sesiones (`if (sessions.countFor(business.id) >= maxSessions)`), agregar:

```ts
      // Sin session id solo vale initialize: cualquier otra cosa construiría un servidor y un
      // transporte que nadie cierra (carryover §5).
      if (req.method !== 'POST' || !isInitializeRequest(req.body)) {
        res.status(400).json({ error: 'missing session id' });
        return;
      }
```

`src/tools/close-out.ts`, en la rama `if (order.stage === ctx.profile.closedStage)`, antes del `return`:

```ts
        // El método que quedó registrado, no el que se pidió ahora.
        const paidOn = businessToday(ctx.business.timezone, new Date(order.closedAt ?? ctx.now()));
        const recorded = (await ctx.store.listPayments(ctx.business.id, paidOn, paidOn)).find(p => p.orderId === order.id);
```

y en ese `ok(…)`, `method: paymentMethod` pasa a `method: recorded?.method ?? paymentMethod`.

`package.json`: borrar `"main"` y `"directories"`; `"description": "Voice-first order tracking for small businesses: an MCP server for Alexa+"`; `"author": "Raul99Alejandro"`; `"private": true` (booleano); `"@types/node": "^24"` en `devDependencies`. Luego `npm install`.

- [ ] **Step 4: Correr y verificar**

Run: `npm test && npm run typecheck && npm run build` → verde.

- [ ] **Step 5: Commit**

```bash
git add src/http/app.ts src/tools/close-out.ts package.json package-lock.json test/integration
git commit -m "fix: reject session-less requests, report the recorded payment method, tidy package.json"
```

---

### Task 16: basic-host, interoperabilidad y documentación (spec §5.5 punto 8, §5.6, §5.7)

**Files:**
- Modify: `README.md`, `docs/friction-log.md`, `docs/product-feedback.md`, `docs/demo-script.md`
- Repo central: `video/cors-proxy.mjs` (alcanzar el servidor desplegado por HTTPS)

- [ ] **Step 1: Instrucciones de basic-host en el README**

Agregar al `README.md`, después de `## Connect the Alexa bridge`:

````markdown
## See the screens in basic-host

Counterpart's three MCP Apps (today's snapshot, the sales report and the setup draft) render in any MCP Apps host. To try them locally with the reference host from [ext-apps](https://github.com/modelcontextprotocol/ext-apps):

```bash
npx tsx src/index.ts                                  # Counterpart on :3000, in-memory store, demo tokens
git clone https://github.com/modelcontextprotocol/ext-apps.git
cd ext-apps/examples/basic-host && npm install
SERVERS='["http://localhost:3000/mcp"]' npx tsx serve.ts   # open http://localhost:8080
```

basic-host sends no `Authorization` header, so either start Counterpart with `HOST=127.0.0.1 COUNTERPART_DEV_BUSINESS=shop` (local no-token mode) or put a small proxy in front that adds `Authorization: Bearer demo-shop-token`. Call `get_shop_snapshot` or `sales_report` and the screen appears next to the result; with a blank business, `review_business_setup` shows the draft.
````

- [ ] **Step 2: Probar snapshot y sales report contra el servidor local**

Run (desde el repo central): `video\start-ui.cmd` (Counterpart local en 3110, el proxy con token de demo en 3111 y basic-host en 8080). En basic-host: llamar `get_shop_snapshot` y `sales_report` con `period: this_week` → las dos pantallas se ven; la gráfica con etiquetas de día y la serie gris del periodo anterior. El store en memoria no siembra negocios en blanco, así que la pantalla del borrador se prueba contra el servidor desplegado (Step 3).

- [ ] **Step 3: Probar las tres pantallas contra el servidor desplegado**

`video/cors-proxy.mjs` hoy solo habla HTTP. En el repo central, cambiarlo para que elija el cliente por el protocolo del destino:

```js
import http from 'node:http';
import https from 'node:https';
```

```js
  const client = TARGET.protocol === 'https:' ? https : http;
  const upstream = client.request({ hostname: TARGET.hostname, port: TARGET.port || undefined, path: req.url, method: req.method, headers }, up => {
```

(reemplaza la línea `const upstream = http.request({ … }, up => {`; el resto queda igual) y el mensaje de arranque de `(token de demo)` a `(token de ${process.env.PROXY_TOKEN ? 'PROXY_TOKEN' : 'demo'})`.

**[dueño]** en su propia terminal (el token no pasa por el chat):

```bash
export PROXY_TARGET="https://<host público>" PROXY_TOKEN="$(aws secretsmanager get-secret-value --profile counterpart --secret-id counterpart/florist/token --query SecretString --output text)"
node video/cors-proxy.mjs
```

y basic-host apuntando al proxy (`SERVERS='["http://localhost:3111/mcp"]' npx tsx serve.ts` en `ext-apps/examples/basic-host`). En basic-host: `set_up_my_business` con la descripción de la florería, esperar ~15 s, `review_business_setup` → pantalla del borrador con etapas, campos y catálogo. Luego `activate_business_setup` con `confirm: false`, para dejar el florist en blanco para el video. Repetir con `PROXY_TOKEN` del taller (`counterpart/shop/token`) para ver snapshot y sales report contra AWS. Commit del proxy en el repo central: `git -C /d/Repos/amazon-hackathon-2026 commit -am "chore: let the CORS proxy reach the deployed server"`.

- [ ] **Step 4: Documentar lo encontrado**

- `docs/friction-log.md`: lo que haya fallado o sorprendido de conformidad con MCP Apps en basic-host (spec §5.6), y cómo reacciona basic-host a `notifications/tools/list_changed` tras activar.
- `docs/product-feedback.md`: el hallazgo de la Decisión 1 como feedback para el bridge y Alexa+: *un agente que hornea la lista de tools al iniciar la sesión no ve `tools/list_changed`; para add-ons que cambian de forma (setup → operación), Alexa+ debería refrescar las tools al recibir la notificación.*
- `docs/demo-script.md`: reemplazar el paso 4 por la escena nueva (spec §5.7): "Petal and Stem" en blanco → "I run a flower shop…" → "what did you come up with?" (pantalla del borrador en basic-host como inserto) → "yes, turn it on" → reabrir → "take an order for Maria Lopez, a dozen roses for Friday" → "what flower orders are due Friday?". Mantener la duración total ≤ 3 min; la pastelería queda mencionada como segundo perfil en el diagrama.

- [ ] **Step 5: Verificación final y commit**

Run: `npm test && npm run typecheck && npm run build` → verde.

```bash
git add README.md docs
git commit -m "docs: basic-host instructions, interop findings and the new demo scene"
```

- [ ] **Step 6: Cierre de la rama**

Revisión de toda la rama con un revisor nuevo (el que indique el método de ejecución elegido), luego `superpowers:finishing-a-development-branch`. `git push` e integración a `main` solo cuando lo pida el dueño.
