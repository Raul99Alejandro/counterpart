import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Message } from '@aws-sdk/client-bedrock-runtime';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { runGolden, type ConverseFn } from '../../infra/golden/runner.js';
import { createApp } from '../../src/http/app.js';
import { MemoryStore } from '../../src/store/memory.js';
import { DEMO_TOKENS, seedAll } from '../../seed/run.js';

let server: Server;
let client: Client;

beforeAll(async () => {
  const store = new MemoryStore();
  await seedAll(store);
  server = createApp({ store, host: '127.0.0.1' }).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', () => resolve()));
  const url = new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`);
  client = new Client({ name: 'golden-test', version: '0' });
  await client.connect(new StreamableHTTPClientTransport(url, {
    fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      headers.set('authorization', `Bearer ${DEMO_TOKENS.shop}`);
      return fetch(input, { ...init, headers });
    }
  }));
});

afterAll(async () => { await client.close(); server.close(); });

/** Un modelo de guion: por cada frase, primero una llamada a tool y luego una respuesta de texto. */
function scripted(calls: Array<{ name: string; input: Record<string, unknown> } | null>): { model: ConverseFn; seen: string[][] } {
  const seen: string[][] = [];
  let phrase = -1;
  const model: ConverseFn = async ({ messages, toolConfig }) => {
    seen.push((toolConfig.tools ?? []).map(t => t.toolSpec?.name ?? ''));
    const last = messages[messages.length - 1]!;
    const isToolResult = last.content?.some(block => 'toolResult' in block && block.toolResult);
    if (isToolResult) return { role: 'assistant', content: [{ text: 'Done.' }] } as Message;
    phrase += 1;
    const call = calls[phrase];
    if (!call) return { role: 'assistant', content: [{ text: 'I am not sure.' }] } as Message;
    return { role: 'assistant', content: [{ toolUse: { toolUseId: `t${phrase}`, name: call.name, input: call.input as never } }] } as Message;
  };
  return { model, seen };
}

describe('runner de frases de oro', () => {
  it('ofrece las tools del servidor, ejecuta las llamadas y cuenta aciertos por la primera tool', async () => {
    const { model, seen } = scripted([
      { name: 'find_work_orders', input: { stage: 'waiting_on_parts' } },
      { name: 'get_shop_snapshot', input: {} },
      null
    ]);
    const report = await runGolden({
      client, model,
      phrases: [
        { say: "What's waiting on parts?", tool: 'find_work_orders', args: { stage: 'waiting_on_parts' } },
        { say: 'Move the Civic into the bay', tool: 'move_work_order_stage', args: { order: 'the Civic', stage: 'in_bay' } },
        { say: 'Reorder whatever is low', tool: 'reorder_parts', args: {} }
      ]
    });

    expect(seen[0]).toHaveLength(9);
    expect(report.total).toBe(3);
    expect(report.passed).toBe(1);
    expect(report.results.map(r => [r.got, r.pass])).toEqual([
      ['find_work_orders', true], ['get_shop_snapshot', false], [null, false]
    ]);
  });
});
