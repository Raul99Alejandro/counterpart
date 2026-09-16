import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../../src/store/memory.js';
import { resolveDue } from '../../src/domain/dates.js';
import { hashToken } from '../../src/http/auth.js';
import { DEMO_TOKENS, seedAll } from '../../seed/run.js';

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
