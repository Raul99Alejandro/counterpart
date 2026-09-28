import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../../src/http/app.js';
import { hashToken } from '../../src/http/auth.js';
import { MemoryStore } from '../../src/store/memory.js';
import { templateRecord } from '../../src/profiles/load.js';
import type { Business } from '../../src/domain/types.js';

const TOKEN = 'token-tope';
const business: Business = {
  id: 'b1', name: 'Oak Street Auto', status: 'active', profileVersion: 1,
  timezone: 'America/Chicago', taxRateBps: 825, nextOrderNumber: 41, version: 1
};

let server: Server;
let base: string;

beforeAll(async () => {
  const store = new MemoryStore();
  await store.putBusiness(business);
  await store.putProfile(business.id, templateRecord('auto-repair'));
  await store.putToken(hashToken(TOKEN), 'b1');
  server = createApp({ store, host: '127.0.0.1', maxSessionsPerBusiness: 2 }).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => { server.close(); });

const headers = {
  authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream'
};

async function initialize(): Promise<Response> {
  return fetch(`${base}/mcp`, {
    method: 'POST', headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '0' } } })
  });
}

describe('tope de sesiones por negocio', () => {
  it('rechaza con 429 la sesión que pasa del tope y acepta otra cuando una se cierra', async () => {
    const first = await initialize();
    const second = await initialize();
    expect([first.status, second.status]).toEqual([200, 200]);
    await first.body?.cancel();
    await second.body?.cancel();

    const third = await initialize();
    expect(third.status).toBe(429);

    // Cerrar una sesión con DELETE libera su cupo.
    const closing = await fetch(`${base}/mcp`, {
      method: 'DELETE', headers: { ...headers, 'mcp-session-id': first.headers.get('mcp-session-id')! }
    });
    expect(closing.status).toBe(200);

    const fourth = await initialize();
    expect(fourth.status).toBe(200);
    await fourth.body?.cancel();
  });
});
