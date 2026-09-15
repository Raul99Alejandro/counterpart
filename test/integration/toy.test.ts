import { describe, expect, it } from 'vitest';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { createToyServer } from '../../src/toy.js';

describe('servidor de juguete', () => {
  it('expone ping_shop y responde', async () => {
    const [clientEnd, serverEnd] = InMemoryTransport.createLinkedPair();
    const server = createToyServer();
    const client = new Client({ name: 'test', version: '1.0.0' });

    await server.server.connect(serverEnd);
    await client.connect(clientEnd);

    const { tools } = await client.listTools();
    expect(tools.map(t => t.name)).toEqual(['ping_shop']);

    const result = await client.callTool({ name: 'ping_shop', arguments: {} });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({ ok: true });

    await client.close();
  });
});
