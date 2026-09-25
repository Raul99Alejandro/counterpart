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

describe('humo sin fugas de sesiones', () => {
  it('cierra sus sesiones: corre varias veces seguidas bajo un tope de 2 sesiones', async () => {
    const store = new MemoryStore();
    await seedAll(store);
    const capped = createApp({ store, host: '127.0.0.1', maxSessionsPerBusiness: 2 }).listen(0, '127.0.0.1');
    await new Promise<void>(resolve => capped.once('listening', () => resolve()));
    const cappedUrl = `http://127.0.0.1:${(capped.address() as AddressInfo).port}/mcp`;
    try {
      for (let run = 0; run < 3; run += 1) {
        const results = await runSmoke({ url: cappedUrl, token: DEMO_TOKENS.shop, otherToken: DEMO_TOKENS.bakery });
        expect(results.filter(r => !r.ok)).toEqual([]);
      }
    } finally {
      capped.close();
    }
  });
});
