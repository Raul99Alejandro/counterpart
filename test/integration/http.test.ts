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
      // new Headers(init?.headers) preserva los headers del SDK (p. ej. accept) sea cual
      // sea su forma (Headers, objeto plano o tuplas); un simple spread de un Headers pierde
      // sus entradas porque Headers no expone propiedades propias enumerables.
      fetch: (input: string | URL | Request, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        headers.set('authorization', `Bearer ${TOKEN}`);
        return fetch(input, { ...init, headers });
      }
    });
    const client = new Client({ name: 'test', version: '1.0.0' });
    await client.connect(transport);

    const { tools } = await client.listTools();
    expect(tools).toHaveLength(9);
    expect(tools.map(t => t.name)).toContain('open_work_order');

    await client.close();
  });
});
