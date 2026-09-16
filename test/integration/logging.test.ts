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

  it('un error fuera de las tools responde 500 y queda en una línea INTERNAL, sin el token', async () => {
    // DynamoDB caído: la búsqueda del token lanza antes de llegar a cualquier tool.
    class DownStore extends MemoryStore {
      override async getBusinessByTokenHash(): Promise<never> { throw new Error('store caído'); }
    }
    const broken = createApp({ store: new DownStore(), host: '127.0.0.1' }).listen(0, '127.0.0.1');
    await new Promise<void>(resolve => broken.once('listening', () => resolve()));
    const address = broken.address();
    const url = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/mcp`;

    const cap = captureLogs();
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          authorization: `Bearer ${DEMO_TOKENS.shop}`
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })
      });
      expect(r.status).toBe(500);
      expect(await r.json()).toEqual({ error: 'internal' });
      await settle();

      const lines = cap.lines();
      const internal = lines.find(l => l.msg === 'internal');
      expect(internal).toMatchObject({ level: 'error', code: 'INTERNAL', error: 'Error: store caído' });
      expect(typeof internal!.stack).toBe('string');
      // Correlacionada con la línea http de la misma petición.
      expect(lines.find(l => l.msg === 'http')).toMatchObject({ status: 500, requestId: internal!.requestId });
      expect(JSON.stringify(lines)).not.toContain(DEMO_TOKENS.shop);
    } finally {
      cap.restore();
      broken.close();
    }
  });

  it('un JSON mal formado es error del cliente: 400 con su línea http, no INTERNAL', async () => {
    const cap = captureLogs();
    try {
      const r = await fetch(`${base}/mcp`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          authorization: `Bearer ${DEMO_TOKENS.shop}`
        },
        body: '{"jsonrpc": "2.0", "id": 1,'
      });
      expect(r.status).toBe(400);
      expect(await r.json()).toEqual({ error: 'bad request' });
      await settle();

      const lines = cap.lines();
      expect(lines.find(l => l.msg === 'internal')).toBeUndefined();
      expect(lines.filter(l => l.msg === 'http')).toEqual([
        expect.objectContaining({ level: 'info', method: 'POST', path: '/mcp', status: 400 })
      ]);
      expect(JSON.stringify(lines)).not.toContain(DEMO_TOKENS.shop);
    } finally {
      cap.restore();
    }
  });

  it('una petición que el cliente abandona también deja su línea http', async () => {
    // Sesión a mano, sin el cliente del SDK: así el único stream SSE (GET) es el de esta prueba.
    const headers = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${DEMO_TOKENS.shop}`
    };
    const init = await fetch(`${base}/mcp`, {
      method: 'POST', headers,
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'initialize',
        params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '0' } }
      })
    });
    await init.text();
    const sessionId = init.headers.get('mcp-session-id')!;
    expect(sessionId).toBeTruthy();

    const controller = new AbortController();
    const cap = captureLogs();
    try {
      // El servidor nunca termina el stream SSE: solo lo corta el cliente.
      const stream = await fetch(`${base}/mcp`, {
        method: 'GET',
        headers: { ...headers, accept: 'text/event-stream', 'mcp-session-id': sessionId },
        signal: controller.signal
      });
      expect(stream.status).toBe(200);
      controller.abort();
      await settle();

      const get = cap.lines().find(l => l.msg === 'http' && l.method === 'GET');
      expect(get).toMatchObject({ businessId: 'shop', sessionId, status: 200 });
    } finally {
      cap.restore();
      const closed = await fetch(`${base}/mcp`, { method: 'DELETE', headers: { ...headers, 'mcp-session-id': sessionId } });
      await closed.body?.cancel();
    }
  });
});
