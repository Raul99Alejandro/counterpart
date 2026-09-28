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
let app: Express;
let server: Server;
let base: string;
const clients: Client[] = [];

beforeAll(async () => {
  const store = new MemoryStore();
  await seedAll(store, NOW);
  for (const [id, name] of [['florist', 'Petal and Stem'], ['twins', 'Twin Florals'], ['other', 'Other Place'], ['iso', 'Iso Florals'], ['json', 'Json Florals']]) {
    await newBlankBusiness(store, { id: id!, name: name! });
    await store.putToken(hashToken(`token-${id}`), id!);
  }
  app = createApp({ store, host: '127.0.0.1', generate: scriptedGenerator(floristDraft()), now: () => NOW });
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

describe('asistente de configuración por MCP', () => {
  it('un negocio en blanco solo ve las tres tools de alta', async () => {
    expect(await names(await connect('token-florist'))).toEqual([...SETUP_TOOL_NAMES].sort());
  });

  it('un negocio activo no ve las tools de alta', async () => {
    const tools = await names(await connect(DEMO_TOKENS.shop));
    for (const name of SETUP_TOOL_NAMES) expect(tools).not.toContain(name);
  });

  it('flujo completo: describir, revisar, activar y operar en la misma sesión', async () => {
    const client = await connect('token-florist');
    const started = await client.callTool({ name: 'set_up_my_business', arguments: { description: 'I run a flower shop' } });
    expect(text(started)).toMatch(/^I'm drafting your setup\./);
    await settled();

    const review = await client.callTool({ name: 'review_business_setup', arguments: {} });
    expect(text(review)).toBe('I set you up to track flower orders through 5 steps: ordered, arranging, ready, out for delivery and delivered, with 7 flowers in your catalog. Should I turn it on?');
    expect(review.structuredContent).toMatchObject({ state: 'ready', businessName: 'Petal and Stem' });

    const activated = await client.callTool({ name: 'activate_business_setup', arguments: { confirm: true } });
    expect(text(activated)).toBe('Petal and Stem is ready. To use it, say stop and open me again. Then try: what flower orders are due today?');

    const profileTools = Object.values(floristDraft().profile.toolNames as Record<string, string>).sort();
    expect(await names(client)).toEqual(profileTools);
    const opened = await client.callTool({
      name: 'take_flower_order', arguments: { customerName: 'Maria Lopez', arrangement: 'dozen roses', due: 'friday' }
    });
    expect(opened.isError).toBeFalsy();

    expect(await names(await connect('token-florist'))).toEqual(profileTools);
  });

  it('la otra sesión del mismo negocio no puede activar dos veces', async () => {
    const first = await connect('token-twins');
    const second = await connect('token-twins');
    await first.callTool({ name: 'set_up_my_business', arguments: { description: 'I run a flower shop' } });
    await settled();
    await first.callTool({ name: 'activate_business_setup', arguments: { confirm: true } });
    const again = await second.callTool({ name: 'activate_business_setup', arguments: { confirm: true } });
    expect(text(again)).toBe("There's no finished setup to turn on yet. Tell me about your business first.");
  });

  it('el token de un negocio no ve ni toca el borrador de otro', async () => {
    const iso = await connect('token-iso');
    const other = await connect('token-other');
    await iso.callTool({ name: 'set_up_my_business', arguments: { description: 'I run a flower shop' } });
    await settled();
    expect((await other.callTool({ name: 'review_business_setup', arguments: {} })).structuredContent).toMatchObject({ state: 'none' });
    await other.callTool({ name: 'activate_business_setup', arguments: { confirm: true } });
    expect((await iso.callTool({ name: 'review_business_setup', arguments: {} })).structuredContent).toMatchObject({ state: 'ready' });
  });

  it('la revisión lleva la UI del borrador', async () => {
    const client = await connect('token-iso');
    const tool = (await client.listTools()).tools.find(t => t.name === 'review_business_setup');
    expect((tool?._meta as { ui?: { resourceUri?: string } } | undefined)?.ui?.resourceUri).toBe('ui://counterpart/setup.html');
    const resource = await client.readResource({ uri: 'ui://counterpart/setup.html' });
    expect((resource.contents[0] as { text: string }).text).toContain('Counterpart · Setup');
  });

  it('el JSON de cada tool de alta lleva la frase: el bridge le pasa a Nova el JSON, no el texto', async () => {
    const client = await connect('token-json');
    const started = await client.callTool({ name: 'set_up_my_business', arguments: { description: 'I run a flower shop' } });
    expect((started.structuredContent as { message: string }).message).toBe(text(started));
    expect(text(started)).toMatch(/Don't check on it yet/);
    const activated = await client.callTool({ name: 'activate_business_setup', arguments: { confirm: true } });
    expect((activated.structuredContent as { message: string }).message).toBe(text(activated));
    await settled();
  });

  it('descartar deja el negocio en blanco', async () => {
    const client = await connect('token-other');
    await client.callTool({ name: 'set_up_my_business', arguments: { description: 'I run a flower shop' } });
    await settled();
    const discarded = await client.callTool({ name: 'activate_business_setup', arguments: { confirm: false } });
    expect(text(discarded)).toBe('Okay, I threw that draft away. Tell me about your business again whenever you are ready.');
    expect(await names(client)).toEqual([...SETUP_TOOL_NAMES].sort());
  });
});
