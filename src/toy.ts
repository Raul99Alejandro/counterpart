import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

export function createToyServer(): McpServer {
  const server = new McpServer({ name: 'counterpart-toy', version: '0.1.0' });

  server.registerTool(
    'ping_shop',
    {
      title: 'Ping shop',
      description: 'Check that the shop assistant is reachable. Use this when the user asks whether the system is online.',
      inputSchema: z.object({}),
      outputSchema: z.object({ ok: z.boolean() }),
      annotations: { readOnlyHint: true, idempotentHint: true }
    },
    async () => ({
      content: [{ type: 'text', text: 'The shop assistant is online.' }],
      structuredContent: { ok: true }
    })
  );

  return server;
}
