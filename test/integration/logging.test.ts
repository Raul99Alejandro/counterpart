import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { Client, InMemoryTransport, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { McpServer } from '@modelcontextprotocol/server';
import { createApp } from '../../src/http/app.js';
import { captureLogs } from '../../src/log.js';
import { loadTemplate } from '../../src/profiles/load.js';
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

describe('structured logs', () => {
  it('logs the request and the tool with the same requestId, and never the token', async () => {
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
      // The tool line shares its requestId with the HTTP request that triggered it.
      expect(http.map(l => l.requestId)).toContain(tool!.requestId);

      expect(JSON.stringify(lines)).not.toContain(DEMO_TOKENS.shop);
    } finally {
      cap.restore();
    }
  });

  it('a request without a token is logged as 401 with no business', async () => {
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

  it('an unexpected exception is logged as INTERNAL', async () => {
    class BrokenStore extends MemoryStore {
      override async listItems(): Promise<never> { throw new TypeError('boom'); }
    }
    const store = new BrokenStore();
    await seedAll(store, NOW);
    const business = (await store.getBusiness('shop'))!;
    const ctx: ToolContext = {
      business, profile: loadTemplate('auto-repair'), store, now: () => NOW, newId: p => `${p}-1`
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

  it('an error outside the tools answers 500 and lands in an INTERNAL line, without the token', async () => {
    // DynamoDB down: the token lookup throws before reaching any tool.
    class DownStore extends MemoryStore {
      override async getBusinessByTokenHash(): Promise<never> { throw new Error('store down'); }
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
      expect(internal).toMatchObject({ level: 'error', code: 'INTERNAL', error: 'Error: store down' });
      expect(typeof internal!.stack).toBe('string');
      // Correlated with the http line of the same request.
      expect(lines.find(l => l.msg === 'http')).toMatchObject({ status: 500, requestId: internal!.requestId });
      expect(JSON.stringify(lines)).not.toContain(DEMO_TOKENS.shop);
    } finally {
      cap.restore();
      broken.close();
    }
  });

  it('malformed JSON is a client error: 400 with its http line, not INTERNAL', async () => {
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

  it('a request the client abandons also leaves its http line', async () => {
    // Session by hand, without the SDK client: this way the only SSE stream (GET) is this test's.
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
      // The server never ends the SSE stream: only the client cuts it.
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
