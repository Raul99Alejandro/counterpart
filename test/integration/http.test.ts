import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import { McpServer } from '@modelcontextprotocol/server';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createApp } from '../../src/http/app.js';
import { hashToken } from '../../src/http/auth.js';
import { MemoryStore } from '../../src/store/memory.js';
import { templateRecord } from '../../src/profiles/load.js';
import type { Business } from '../../src/domain/types.js';

const TOKEN = 'test-token';
const business: Business = {
  id: 'b1', name: 'Oak Street Auto', status: 'active', profileVersion: 1,
  timezone: 'America/Chicago', taxRateBps: 825, nextOrderNumber: 41, version: 1
};

let server: Server;
let base: string;
let store: MemoryStore;

beforeAll(async () => {
  store = new MemoryStore();
  await store.putBusiness(business);
  await store.putProfile(business.id, templateRecord('auto-repair'));
  await store.putToken(hashToken(TOKEN), 'b1');

  server = createApp({ store, host: '127.0.0.1' }).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', () => resolve()));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
});

afterAll(() => { server.close(); });

describe('HTTP', () => {
  it('answers the health check', async () => {
    const r = await fetch(`${base}/ping`);
    expect(r.status).toBe(200);
    expect(await r.text()).toBe('ok');
  });

  it('rejects without a token', async () => {
    const r = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '0' } } })
    });
    expect(r.status).toBe(401);
  });

  it('opens a session with a valid token and exposes the nine tools', async () => {
    const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
      // new Headers(init?.headers) keeps the SDK headers (e.g. accept) whatever their
      // shape (Headers, plain object or tuples); a simple spread of a Headers loses
      // its entries because Headers has no enumerable own properties.
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

  it('another business token does not open the session, but the own token keeps working', async () => {
    const businessB: Business = {
      id: 'b2', name: 'Maple Street Bakery', status: 'active', profileVersion: 1,
      timezone: 'America/Chicago', taxRateBps: 825, nextOrderNumber: 1, version: 1
    };
    const TOKEN_B = 'other-business-token';
    await store.putBusiness(businessB);
    await store.putProfile(businessB.id, templateRecord('bakery'));
    await store.putToken(hashToken(TOKEN_B), 'b2');

    // Open a session as business A (b1) and capture the session id the server assigns.
    const transportA = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
      fetch: (input: string | URL | Request, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        headers.set('authorization', `Bearer ${TOKEN}`);
        return fetch(input, { ...init, headers });
      }
    });
    const clientA = new Client({ name: 'test', version: '1.0.0' });
    await clientA.connect(transportA);
    const sessionId = transportA.sessionId;
    expect(sessionId).toBeTruthy();

    // A later request with that same session id but business B's token: rejected with 404,
    // just like an unknown id, so as not to reveal that the session exists in another business.
    const withOtherToken = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-session-id': sessionId!,
        authorization: `Bearer ${TOKEN_B}`
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 200, method: 'tools/list', params: {} })
    });
    expect(withOtherToken.status).toBe(404);

    // The same session id with business A's own token: the session is still alive; it was not the
    // session id that was rejected above, but the token's business.
    const withOwnToken = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-session-id': sessionId!,
        authorization: `Bearer ${TOKEN}`
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 201, method: 'tools/list', params: {} })
    });
    expect(withOwnToken.status).toBe(200);
    await withOwnToken.body?.cancel();

    await clientA.close();
  });

  it('a made-up session id gets 404 so the client opens a new session', async () => {
    const r = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-session-id': 'session-that-does-not-exist',
        authorization: `Bearer ${TOKEN}`
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 300, method: 'tools/list', params: {} })
    });
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: 'session not found' });
  });
  it('without a session id it only accepts initialize and leaves no orphaned servers', async () => {
    const connect = vi.spyOn(McpServer.prototype, 'connect');
    try {
      const res = await fetch(`${base}/mcp`, {
        method: 'POST',
        headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })
      });
      expect(res.status).toBe(400);
      expect(connect).not.toHaveBeenCalled();
    } finally {
      connect.mockRestore();
    }
  });

});
