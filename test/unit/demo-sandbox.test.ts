import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../../src/store/memory.js';
import { businessFor } from '../../src/http/auth.js';
import { createSandbox, sandboxExpired, SANDBOX_TTL_MS } from '../../src/demo/sandbox.js';

const NOW = new Date('2026-11-10T15:00:00Z');

describe('demo sandbox', () => {
  it('creates its own auto shop, bakery and blank business, each with its own token', async () => {
    const store = new MemoryStore();
    const sandbox = await createSandbox(store, NOW);
    expect(sandbox.businesses.map(b => b.kind)).toEqual(['shop', 'bakery', 'blank']);
    expect(new Set(sandbox.businesses.map(b => b.token)).size).toBe(3);
    expect(sandbox.expiresAt).toBe(new Date(NOW.getTime() + SANDBOX_TTL_MS).toISOString());

    const [shop, bakery, blank] = await Promise.all(sandbox.businesses.map(b => businessFor(store, b.token, NOW)));
    expect(shop?.name).toBe('Oak Street Auto');
    expect(shop?.status).toBe('active');
    expect(bakery?.status).toBe('active');
    expect(blank?.status).toBe('blank');
    expect(shop!.id).toMatch(/^demo-[a-z0-9]+-[a-z0-9]+-shop$/);
    expect((await store.listOrders(shop!.id)).length).toBeGreaterThan(5);
  });

  it('keeps two sandboxes apart', async () => {
    const store = new MemoryStore();
    const a = await createSandbox(store, NOW);
    const b = await createSandbox(store, NOW);
    const shopA = await businessFor(store, a.businesses[0]!.token, NOW);
    const shopB = await businessFor(store, b.businesses[0]!.token, NOW);
    expect(shopA!.id).not.toBe(shopB!.id);
  });

  it('stops answering to its tokens after 24 hours', async () => {
    const store = new MemoryStore();
    const sandbox = await createSandbox(store, NOW);
    const later = new Date(NOW.getTime() + SANDBOX_TTL_MS + 1000);
    expect(await businessFor(store, sandbox.businesses[0]!.token, later)).toBeNull();
    expect(await businessFor(store, sandbox.businesses[0]!.token, new Date(NOW.getTime() + 3600_000))).not.toBeNull();
  });

  it('only expires demo businesses', () => {
    expect(sandboxExpired('shop', new Date('2030-01-01T00:00:00Z'))).toBe(false);
    expect(sandboxExpired('demo-zzzz', NOW)).toBe(false);
  });
});
