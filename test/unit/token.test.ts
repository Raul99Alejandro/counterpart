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
