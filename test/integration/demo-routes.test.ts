import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Message } from '@aws-sdk/client-bedrock-runtime';
import { createApp } from '../../src/http/app.js';
import { MemoryStore } from '../../src/store/memory.js';
import { DemoLimits } from '../../src/demo/limits.js';
import { DEMO_TOKENS, seedAll } from '../../seed/run.js';
import type { ConverseFn } from '../../src/setup/generate.js';

let server: Server;
let base: string;
let replies: Message[] = [];

const converse: ConverseFn = async () => {
  const next = replies.shift();
  if (!next) throw new Error('no scripted reply');
  return next;
};

beforeAll(async () => {
  const store = new MemoryStore();
  await seedAll(store);
  const limits = new DemoLimits({ sandboxesPerIpPerHour: 3, sandboxesPerDay: 10, turnsPerSandboxPerDay: 4, turnsPerDay: 50, speechPerSandboxPerDay: 20, speechPerDay: 100 });
  const speak = async (text: string) => new TextEncoder().encode(`mp3:${text}`);
  server = createApp({ store, host: '127.0.0.1', demo: { converse, limits, speak } }).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => { server.close(); });

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

async function newSandbox(ip = '10.0.0.1') {
  const res = await post('/demo/api/sandbox', {}, { 'x-forwarded-for': ip });
  expect(res.status).toBe(201);
  return (await res.json()) as { expiresAt: string; businesses: Array<{ kind: string; name: string; token: string }> };
}

describe('demo routes', () => {
  it('creates a sandbox and runs a spoken turn against its own auto shop', async () => {
    const sandbox = await newSandbox();
    const shop = sandbox.businesses.find(b => b.kind === 'shop')!;
    replies = [
      { role: 'assistant', content: [{ toolUse: { toolUseId: 't1', name: 'get_shop_snapshot', input: {} } }] },
      { role: 'assistant', content: [{ text: 'Busy day.' }] }
    ];
    const res = await post('/demo/api/turn', { token: shop.token, text: "How's the shop looking today?", history: [] });
    expect(res.status).toBe(200);
    const turn = await res.json() as { reply: string; business: { name: string; status: string }; calls: unknown[]; ui?: { resourceUri: string } };
    // The tool's own sentence, not the model's "Busy day.".
    expect(turn.reply).toMatch(/^Today you've taken in \$/);
    expect(turn.business).toEqual({ name: 'Oak Street Auto', status: 'active' });
    expect(turn.calls).toHaveLength(1);
    expect(turn.ui?.resourceUri).toBe('ui://counterpart/snapshot.html');

    const page = await fetch(`${base}/demo/api/ui?token=${encodeURIComponent(shop.token)}&uri=${encodeURIComponent(turn.ui!.resourceUri)}`);
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    expect(await page.text()).toContain('<html');
  });

  it('speaks a reply with Amazon Polly for a demo sandbox', async () => {
    const token = (await newSandbox('10.0.0.5')).businesses[0]!.token;
    const res = await post('/demo/api/speech', { token, text: 'Closed work order 47.' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('audio/mpeg');
    expect(await res.text()).toBe('mp3:Closed work order 47.');
    expect((await post('/demo/api/speech', { token, text: 'x'.repeat(701) })).status).toBe(400);
    expect((await post('/demo/api/speech', { token: DEMO_TOKENS.shop, text: 'Hi' })).status).toBe(401);
  });

  it('refuses tokens that are not from a demo sandbox', async () => {
    const res = await post('/demo/api/turn', { token: DEMO_TOKENS.shop, text: 'Hi', history: [] });
    expect(res.status).toBe(401);
    expect((await post('/demo/api/turn', { token: 'nope', text: 'Hi', history: [] })).status).toBe(401);
  });

  it('refuses resources outside Counterpart and bad input', async () => {
    const sandbox = await newSandbox('10.0.0.2');
    const token = sandbox.businesses[0]!.token;
    expect((await fetch(`${base}/demo/api/ui?token=${token}&uri=${encodeURIComponent('file:///etc/passwd')}`)).status).toBe(400);
    expect((await post('/demo/api/turn', { token, text: 'x'.repeat(301), history: [] })).status).toBe(400);
    expect((await post('/demo/api/turn', { token, text: '', history: [] })).status).toBe(400);
  });

  it('limits sandboxes per address and turns per sandbox', async () => {
    for (let i = 0; i < 3; i++) await newSandbox('10.0.0.9');
    const refused = await post('/demo/api/sandbox', {}, { 'x-forwarded-for': '10.0.0.9' });
    expect(refused.status).toBe(429);

    const token = (await newSandbox('10.0.0.3')).businesses[0]!.token;
    for (let i = 0; i < 4; i++) {
      replies = [{ role: 'assistant', content: [{ text: 'OK.' }] }];
      expect((await post('/demo/api/turn', { token, text: 'Hi', history: [] })).status).toBe(200);
    }
    expect((await post('/demo/api/turn', { token, text: 'Hi', history: [] })).status).toBe(429);
  });

  it('keeps the sandbox the same blank business through setup', async () => {
    const sandbox = await newSandbox('10.0.0.4');
    const blank = sandbox.businesses.find(b => b.kind === 'blank')!;
    replies = [{ role: 'assistant', content: [{ text: 'Tell me about your business.' }] }];
    const res = await post('/demo/api/turn', { token: blank.token, text: 'Hi', history: [] });
    expect((await res.json() as { business: { status: string } }).business.status).toBe('blank');
  });

  it('is not mounted when the demo is off', async () => {
    const store = new MemoryStore();
    const plain = createApp({ store, host: '127.0.0.1' }).listen(0, '127.0.0.1');
    await new Promise<void>(resolve => plain.once('listening', () => resolve()));
    const res = await fetch(`http://127.0.0.1:${(plain.address() as AddressInfo).port}/demo/api/sandbox`, { method: 'POST' });
    expect(res.status).toBe(404);
    plain.close();
  });
});
