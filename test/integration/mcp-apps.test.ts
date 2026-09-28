import { describe, expect, it } from 'vitest';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { McpServer } from '@modelcontextprotocol/server';
import { RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { MemoryStore } from '../../src/store/memory.js';
import { registerTools } from '../../src/tools/context.js';
import { toolContext } from '../helpers/context.js';
import { UI } from '../../src/tools/ui-assets.js';
import { seedAll } from '../../seed/run.js';

const NOW = new Date('2026-09-15T15:00:00Z');

async function connect(bizId: 'shop' | 'bakery'): Promise<Client> {
  const store = new MemoryStore();
  await seedAll(store, NOW);
  let n = 0;
  const ctx = await toolContext(store, bizId, { now: () => NOW, newId: p => `${p}-${++n}` });
  const server = new McpServer({ name: 'counterpart', version: '0.1.0' });
  registerTools(server, ctx);
  const [clientEnd, serverEnd] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1.0.0' });
  await server.server.connect(serverEnd);
  await client.connect(clientEnd);
  return client;
}

const uiOf = (tool: { _meta?: unknown }): string | undefined =>
  (tool._meta as { ui?: { resourceUri?: string } } | undefined)?.ui?.resourceUri;

describe('MCP Apps', () => {
  it('solo el resumen y el reporte de ventas llevan UI', async () => {
    const client = await connect('shop');
    const { tools } = await client.listTools();
    const withUi = Object.fromEntries(tools.filter(t => uiOf(t)).map(t => [t.name, uiOf(t)]));
    expect(withUi).toEqual({ get_shop_snapshot: UI.snapshot, sales_report: UI.salesReport });
    await client.close();
  });

  it('publica los dos recursos ui://', async () => {
    const client = await connect('bakery');
    const { resources } = await client.listResources();
    expect(resources.map(r => r.uri).sort()).toEqual([UI.salesReport, UI.snapshot].sort());
    await client.close();
  });

  it('sirve cada UI como un solo HTML, sin recursos externos', async () => {
    const client = await connect('shop');
    for (const uri of [UI.snapshot, UI.salesReport]) {
      const { contents } = await client.readResource({ uri });
      const page = contents[0] as { text: string; mimeType: string };
      expect(page.mimeType).toBe(RESOURCE_MIME_TYPE);
      expect(page.text).toContain('<main id="root">');
      expect(page.text).not.toMatch(/<script[^>]+src=/);
      expect(page.text).not.toMatch(/<link[^>]+href=/);
    }
    await client.close();
  });

  it('las tools con UI siguen contestando con texto hablable', async () => {
    const client = await connect('shop');
    const r = await client.callTool({ name: 'get_shop_snapshot', arguments: {} });
    expect((r.content[0] as { text: string }).text).toMatch(/^Today you've taken in \$/);
    expect(r.structuredContent).toBeDefined();
    await client.close();
  });
});
