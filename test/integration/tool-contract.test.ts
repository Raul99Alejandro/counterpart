import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createApp } from '../../src/http/app.js';
import { MemoryStore } from '../../src/store/memory.js';
import { DEMO_BLANK_TOKEN, DEMO_TOKENS, seedAll, seedLocalBlank } from '../../seed/run.js';

let server: Server;
let url: string;

beforeAll(async () => {
  const store = new MemoryStore();
  await seedAll(store);
  await seedLocalBlank(store);
  server = createApp({ store, host: '127.0.0.1' }).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', () => resolve()));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
});

afterAll(() => { server.close(); });

async function listTools(token: string) {
  const fetchWithToken = (input: URL | RequestInfo, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    headers.set('authorization', `Bearer ${token}`);
    return fetch(input, { ...init, headers });
  };
  const client = new Client({ name: 'contract', version: '0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(url), { fetch: fetchWithToken }));
  const { tools } = await client.listTools();
  await client.close();
  return tools;
}

async function negotiate(version: string): Promise<string> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${DEMO_TOKENS.shop}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream'
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: version, capabilities: {}, clientInfo: { name: 'test', version: '0' } } })
  });
  const body = await res.text();
  const json = body.startsWith('{') ? body : body.split('\n').find(l => l.startsWith('data:'))!.slice(5);
  return (JSON.parse(json) as { result: { protocolVersion: string } }).result.protocolVersion;
}

describe('tool contract', () => {
  for (const [label, token] of [['auto shop', DEMO_TOKENS.shop], ['bakery', DEMO_TOKENS.bakery], ['blank business', DEMO_BLANK_TOKEN]] as const) {
    it(`every ${label} tool declares an output schema and all four annotations`, async () => {
      const tools = await listTools(token);
      expect(tools.length).toBeGreaterThanOrEqual(3);
      for (const tool of tools) {
        expect(tool.outputSchema, tool.name).toBeDefined();
        const a = tool.annotations ?? {};
        for (const hint of ['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint'] as const) {
          expect(typeof a[hint], `${tool.name}.${hint}`).toBe('boolean');
        }
        // Nothing deletes business data or reaches outside the business's own records; only
        // activate_business_setup can throw a draft away.
        expect(a.destructiveHint, tool.name).toBe(tool.name === 'activate_business_setup');
        expect(a.openWorldHint, tool.name).toBe(false);
      }
    });
  }
});

describe('spoken sentence in the data', () => {
  // The bridge gives the model the tool's JSON, not its text: without the sentence there, Nova turned
  // amountCents 11000 into "eleven dollars".
  it('every business tool puts what it says in its JSON as message, and declares it', async () => {
    const fetchWithToken = (input: URL | RequestInfo, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      headers.set('authorization', `Bearer ${DEMO_TOKENS.shop}`);
      return fetch(input, { ...init, headers });
    };
    const client = new Client({ name: 'contract', version: '0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(url), { fetch: fetchWithToken }));
    const { tools } = await client.listTools();
    for (const tool of tools) {
      const props = (tool.outputSchema as { properties?: Record<string, unknown> }).properties ?? {};
      expect(props.message, tool.name).toBeDefined();
    }
    const close = await client.callTool({ name: 'close_out_work_order', arguments: { order: 'the silver crossover', paymentMethod: 'card' } });
    const text = (close.content as Array<{ text: string }>)[0]!.text;
    expect((close.structuredContent as { message: string }).message).toBe(text);
    expect(text).toContain('$110.00');
    await client.close();
  });
});

describe('server instructions', () => {
  // Hosts put them in the agent's prompt (the Alexa bridge does): the Agent Skill's guidance reaches any agent.
  it('announces the Agent Skill as its instructions when a client connects', async () => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${DEMO_TOKENS.shop}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 't', version: '0' } } })
    });
    const body = await res.text();
    const json = body.startsWith('{') ? body : body.split('\n').find(l => l.startsWith('data:'))!.slice(5);
    const instructions = (JSON.parse(json) as { result: { instructions?: string } }).result.instructions ?? '';
    expect(instructions).toContain('Never ask for an order number');
    expect(instructions).toContain('confirm: true');
    expect(instructions).not.toContain('name: counterpart');
  });
});

describe('protocol version', () => {
  it('answers 2025-11-25 when asked for it', async () => {
    expect(await negotiate('2025-11-25')).toBe('2025-11-25');
  });

  it('accepts the earlier versions a client may open with, such as 2025-03-26', async () => {
    expect(await negotiate('2025-03-26')).toBe('2025-03-26');
    expect(await negotiate('2025-06-18')).toBe('2025-06-18');
  });

  it('offers 2025-11-25 to a version it does not know', async () => {
    expect(await negotiate('2099-01-01')).toBe('2025-11-25');
  });
});
