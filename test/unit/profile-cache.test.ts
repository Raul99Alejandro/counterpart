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
