import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { McpServer } from '@modelcontextprotocol/server';
import { MemoryStore } from '../../src/store/memory.js';
import { registerTools } from '../../src/tools/context.js';
import { loadPackage } from '../../seed/package.js';
import { newBlankBusiness } from '../../seed/business.js';
import { PACKAGES_DIR, seedPackage } from '../../seed/run.js';
import { toolContext } from '../helpers/context.js';

const NOW = new Date('2026-09-29T15:00:00Z');
const text = (r: { content: unknown[] }): string => (r.content[0] as { text: string }).text;

describe('a new business with no code', () => {
  it('the bike-shop package serves its nine tools under its own names', async () => {
    const store = new MemoryStore();
    const pkg = loadPackage(path.join(PACKAGES_DIR, 'bike-shop'));
    await seedPackage(store, pkg, NOW);

    const server = new McpServer({ name: 'counterpart', version: '0.1.0' });
    let n = 0;
    registerTools(server, await toolContext(store, 'bike-shop', { now: () => NOW, newId: p => `${p}-${++n}` }));
    const [clientEnd, serverEnd] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test', version: '1.0.0' });
    await server.server.connect(serverEnd);
    await client.connect(clientEnd);

    const names = (await client.listTools()).tools.map(t => t.name).sort();
    expect(names).toEqual(Object.values(pkg.profile.toolNames).sort());

    const opened = await client.callTool({
      name: 'check_in_bike', arguments: { customerName: 'Kai Moreno', asset: { brand: 'Trek', model: 'Domane' } }
    });
    expect(opened.isError).toBeFalsy();
    const found = await client.callTool({ name: 'find_repairs', arguments: { query: 'the Trek' } });
    expect(text(found)).toContain('Kai Moreno');
  });

  it('creates a blank business ready for the assistant', async () => {
    const store = new MemoryStore();
    const business = await newBlankBusiness(store, { id: 'florist', name: 'Petal and Stem' });
    expect(business).toMatchObject({ status: 'blank', profileVersion: 0, nextOrderNumber: 1, timezone: 'America/Chicago' });
    expect(await store.getProfile('florist')).toBeNull();
    await expect(newBlankBusiness(store, { id: 'florist', name: 'Again' })).rejects.toThrow(/already exists/);
    await expect(newBlankBusiness(store, { id: 'Petal Stem', name: 'x' })).rejects.toThrow(/is invalid/);
  });
});
