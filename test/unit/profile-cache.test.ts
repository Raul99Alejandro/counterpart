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

describe('profile cache', () => {
  it('reads the profile only once per version', async () => {
    const store = await storeWithProfile();
    const read = vi.spyOn(store, 'getProfile');
    const cache = new ProfileCache(store);
    expect((await cache.forBusiness(business)).toolNames.open).toBe('open_work_order');
    await cache.forBusiness(business);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('reads again when the version changes', async () => {
    const store = await storeWithProfile();
    const read = vi.spyOn(store, 'getProfile');
    const cache = new ProfileCache(store);
    await cache.forBusiness(business);
    await store.putProfile('b1', { ...templateRecord('bakery'), version: 2 });
    const profile = await cache.forBusiness({ ...business, profileVersion: 2 });
    expect(profile.toolNames.open).toBe('take_cake_order');
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('rejects a blank business', async () => {
    const cache = new ProfileCache(await storeWithProfile());
    await expect(cache.forBusiness({ ...business, status: 'blank', profileVersion: 0 })).rejects.toThrow(/blank/);
  });

  it('fails clearly when the saved profile is missing', async () => {
    const store = new MemoryStore();
    await store.putBusiness(business);
    await expect(new ProfileCache(store).forBusiness(business)).rejects.toThrow(/no saved profile/);
  });
});
