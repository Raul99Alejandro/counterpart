import { describe, expect, it } from 'vitest';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { McpServer } from '@modelcontextprotocol/server';
import { MemoryStore } from '../../src/store/memory.js';
import { SetupService } from '../../src/setup/service.js';
import { registerSetupTools } from '../../src/setup/tools.js';
import { newBlankBusiness } from '../../seed/business.js';
import { floristDraft, scriptedGenerator } from '../helpers/setup.js';

const text = (r: { content: unknown[] }): string => (r.content[0] as { text: string }).text;

describe('setup tools', () => {
  let clock = new Date('2026-09-29T15:00:00Z');

  it('if the tool switch fails after activating, it does not say nothing changed', async () => {
    const store = new MemoryStore();
    const business = await newBlankBusiness(store, { id: 'florist', name: 'Petal and Stem' });
    const setup = new SetupService({ store, generate: scriptedGenerator(floristDraft()), now: () => clock });
    const server = new McpServer({ name: 'counterpart', version: '0.1.0' });
    registerSetupTools(server, {
      business, setup,
      onActivated: () => { throw new Error('odd profile'); }
    });
    const [clientEnd, serverEnd] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test', version: '1.0.0' });
    await server.server.connect(serverEnd);
    await client.connect(clientEnd);

    await client.callTool({ name: 'set_up_my_business', arguments: { description: 'I run a flower shop' } });
    await setup.settled();
    await client.callTool({ name: 'review_business_setup', arguments: {} });
    clock = new Date(clock.getTime() + 5000);
    const activated = await client.callTool({ name: 'activate_business_setup', arguments: { confirm: true } });
    expect(activated.isError).toBeFalsy();
    expect(text(activated)).toContain('Petal and Stem is ready. Try:');
    expect((await store.getBusiness('florist'))?.status).toBe('active');
  });
});
