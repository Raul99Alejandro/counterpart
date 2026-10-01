import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Express } from 'express';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createApp } from '../../src/http/app.js';
import { hashToken } from '../../src/http/auth.js';
import { MemoryStore } from '../../src/store/memory.js';
import type { SetupService } from '../../src/setup/service.js';
import { SETUP_TOOL_NAMES } from '../../src/setup/validate.js';
import { newBlankBusiness } from '../../seed/business.js';
import { DEMO_TOKENS, seedAll } from '../../seed/run.js';
import { floristDraft, scriptedGenerator } from '../helpers/setup.js';

const NOW = new Date('2026-09-29T15:00:00Z');
let now = NOW;
/** A person answers the summary a few seconds later (activation requires it). */
const answerLater = (): void => { now = new Date(now.getTime() + 5000); };
let app: Express;
let server: Server;
let base: string;
const clients: Client[] = [];

beforeAll(async () => {
  const store = new MemoryStore();
  await seedAll(store, NOW);
  for (const [id, name] of [['florist', 'Petal and Stem'], ['twins', 'Twin Florals'], ['other', 'Other Place'], ['iso', 'Iso Florals'], ['json', 'Json Florals'], ['retake', 'Retake Florals']]) {
    await newBlankBusiness(store, { id: id!, name: name! });
    await store.putToken(hashToken(`token-${id}`), id!);
  }
  app = createApp({ store, host: '127.0.0.1', generate: scriptedGenerator(floristDraft()), now: () => now });
  app.locals.store = store;
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
});

afterAll(async () => {
  await Promise.all(clients.map(c => c.close()));
  server.close();
});

async function connect(token: string): Promise<Client> {
  const client = new Client({ name: 'setup-test', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(base), {
    fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      headers.set('authorization', `Bearer ${token}`);
      return fetch(input, { ...init, headers });
    }
  }));
  clients.push(client);
  return client;
}

const text = (r: { content: unknown[] }): string => (r.content[0] as { text: string }).text;
const names = async (c: Client): Promise<string[]> => (await c.listTools()).tools.map(t => t.name).sort();
const settled = () => (app.locals.setup as SetupService).settled();

describe('setup assistant over MCP', () => {
  it('a blank business only sees the three setup tools', async () => {
    expect(await names(await connect('token-florist'))).toEqual([...SETUP_TOOL_NAMES].sort());
  });

  it('an active business does not see the setup tools', async () => {
    const tools = await names(await connect(DEMO_TOKENS.shop));
    for (const name of SETUP_TOOL_NAMES) expect(tools).not.toContain(name);
  });

  it('full flow: describe, review, activate and operate in the same session', async () => {
    const client = await connect('token-florist');
    const started = await client.callTool({ name: 'set_up_my_business', arguments: { description: 'I run a flower shop' } });
    expect(text(started)).toMatch(/^I'm drafting your setup\./);
    await settled();

    const review = await client.callTool({ name: 'review_business_setup', arguments: {} });
    expect(text(review)).toBe('I set you up to track flower orders through 5 steps: ordered, arranging, ready, out for delivery and delivered, with 7 flowers in your catalog. Should I turn it on?');
    expect(review.structuredContent).toMatchObject({ state: 'ready', businessName: 'Petal and Stem' });

    answerLater();
    const activated = await client.callTool({ name: 'activate_business_setup', arguments: { confirm: true } });
    expect(text(activated)).toBe('Petal and Stem is ready. Try: what flower orders are due today?');

    const profileTools = Object.values(floristDraft().profile.toolNames as Record<string, string>).sort();
    expect(await names(client)).toEqual(profileTools);
    const opened = await client.callTool({
      name: 'take_flower_order', arguments: { customerName: 'Maria Lopez', arrangement: 'dozen roses', due: 'friday' }
    });
    expect(opened.isError).toBeFalsy();

    expect(await names(await connect('token-florist'))).toEqual(profileTools);
  });

  it('the other session of the same business cannot activate twice', async () => {
    const first = await connect('token-twins');
    const second = await connect('token-twins');
    await first.callTool({ name: 'set_up_my_business', arguments: { description: 'I run a flower shop' } });
    await settled();
    await first.callTool({ name: 'review_business_setup', arguments: {} });
    answerLater();
    await first.callTool({ name: 'activate_business_setup', arguments: { confirm: true } });
    // The old session was left with the setup tools of a business that is already active: 404, and the
    // client opens a new session that already has the profile tools. There is no second activation.
    await expect(second.callTool({ name: 'activate_business_setup', arguments: { confirm: true } }))
      .rejects.toThrow(/session not found/);
    expect(await names(await connect('token-twins'))).toContain('take_flower_order');
  });

  it("one business's token neither sees nor touches another's draft", async () => {
    const iso = await connect('token-iso');
    const other = await connect('token-other');
    await iso.callTool({ name: 'set_up_my_business', arguments: { description: 'I run a flower shop' } });
    await settled();
    expect((await other.callTool({ name: 'review_business_setup', arguments: {} })).structuredContent).toMatchObject({ state: 'none' });
    await other.callTool({ name: 'activate_business_setup', arguments: { confirm: true } });
    expect((await iso.callTool({ name: 'review_business_setup', arguments: {} })).structuredContent).toMatchObject({ state: 'ready' });
  });

  it('the review carries the draft UI', async () => {
    const client = await connect('token-iso');
    const tool = (await client.listTools()).tools.find(t => t.name === 'review_business_setup');
    expect((tool?._meta as { ui?: { resourceUri?: string } } | undefined)?.ui?.resourceUri).toBe('ui://counterpart/setup.html');
    const resource = await client.readResource({ uri: 'ui://counterpart/setup.html' });
    expect((resource.contents[0] as { text: string }).text).toContain('Counterpart · Setup');
  });

  it('the JSON of each setup tool carries the phrase: the bridge passes Nova the JSON, not the text', async () => {
    const client = await connect('token-json');
    const started = await client.callTool({ name: 'set_up_my_business', arguments: { description: 'I run a flower shop' } });
    expect((started.structuredContent as { message: string }).message).toBe(text(started));
    // The spoken text is for the person; the instruction not to poll goes to the model in `next`.
    expect(text(started)).toBe("I'm drafting your setup. Ask me what I came up with in about twenty seconds.");
    expect((started.structuredContent as { next: string }).next).toMatch(/Do not call review_business_setup/);
    const activated = await client.callTool({ name: 'activate_business_setup', arguments: { confirm: true } });
    expect((activated.structuredContent as { message: string }).message).toBe(text(activated));
    await settled();
  });

  it('a session opened before a business reset gets 404 and the new one sees the setup tools', async () => {
    const client = await connect('token-retake');
    await client.callTool({ name: 'set_up_my_business', arguments: { description: 'I run a flower shop' } });
    await settled();
    await client.callTool({ name: 'review_business_setup', arguments: {} });
    answerLater();
    await client.callTool({ name: 'activate_business_setup', arguments: { confirm: true } });
    expect(await names(client)).toContain('take_flower_order');

    // reset-demo.sh: the business goes back to blank while the process is still running.
    const store = app.locals.store as MemoryStore;
    const active = (await store.getBusiness('retake'))!;
    await store.putBusiness({ ...active, status: 'blank', profileVersion: 0 });

    await expect(client.listTools()).rejects.toThrow(/session not found/);
    expect(await names(await connect('token-retake'))).toEqual([...SETUP_TOOL_NAMES].sort());
  });

  it('discarding leaves the business blank', async () => {
    const client = await connect('token-other');
    await client.callTool({ name: 'set_up_my_business', arguments: { description: 'I run a flower shop' } });
    await settled();
    const discarded = await client.callTool({ name: 'activate_business_setup', arguments: { confirm: false } });
    expect(text(discarded)).toBe('Okay, I threw that draft away. Tell me about your business again whenever you are ready.');
    expect(await names(client)).toEqual([...SETUP_TOOL_NAMES].sort());
  });
});
