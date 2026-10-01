import { describe, expect, it } from 'vitest';
import type { Message } from '@aws-sdk/client-bedrock-runtime';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { runTurn, agentSystemPrompt, spokenReply } from '../../src/demo/agent.js';
import type { ConverseFn } from '../../src/setup/generate.js';

async function connect(): Promise<{ client: Client; calls: string[] }> {
  const calls: string[] = [];
  const server = new McpServer({ name: 'test', version: '0' });
  server.registerTool('get_shop_snapshot', {
    description: 'Today in one sentence.', inputSchema: z.object({}),
    _meta: { ui: { resourceUri: 'ui://counterpart/snapshot.html' } }
  }, async () => {
    calls.push('get_shop_snapshot');
    return { content: [{ type: 'text', text: 'Today you have taken in $920.43.' }], structuredContent: { takenTodayCents: 92043 } };
  });
  server.registerTool('find_work_orders', {
    description: 'Find orders.', inputSchema: z.object({ query: z.string().optional() })
  }, async ({ query }) => {
    calls.push(`find_work_orders:${query}`);
    return { content: [{ type: 'text', text: 'Nothing matches.' }], isError: true };
  });
  const [clientEnd, serverEnd] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '0' });
  await server.server.connect(serverEnd);
  await client.connect(clientEnd);
  return { client, calls };
}

/** A model that plays back the given replies and records what it was sent. */
function scripted(replies: Message[]): ConverseFn & { seen: Parameters<ConverseFn>[0][] } {
  const seen: Parameters<ConverseFn>[0][] = [];
  const fn = (async input => {
    seen.push(structuredClone(input));
    const next = replies.shift();
    if (!next) throw new Error('no more replies');
    return next;
  }) as ConverseFn & { seen: typeof seen };
  fn.seen = seen;
  return fn;
}

const use = (name: string, input: unknown, id = 't1'): Message =>
  ({ role: 'assistant', content: [{ toolUse: { toolUseId: id, name, input: input as never } }] });
const say = (text: string): Message => ({ role: 'assistant', content: [{ text }] });

describe('demo agent', () => {
  it('calls the tool the model picks, passes the result back and returns the spoken reply', async () => {
    const { client, calls } = await connect();
    const model = scripted([use('get_shop_snapshot', {}), say('Today you have taken in $920.43.')]);
    const out = await runTurn({ client, converse: model, text: "How's the shop?", history: [] });

    expect(calls).toEqual(['get_shop_snapshot']);
    expect(out.reply).toBe('Today you have taken in $920.43.');
    expect(out.calls).toEqual([{ tool: 'get_shop_snapshot', arguments: {}, isError: false, result: 'Today you have taken in $920.43.' }]);
    expect(out.ui).toMatchObject({ resourceUri: 'ui://counterpart/snapshot.html', toolName: 'get_shop_snapshot', toolInput: {} });
    expect(out.ui?.toolResult.structuredContent).toEqual({ takenTodayCents: 92043 });

    const second = model.seen[1]!;
    expect(second.toolConfig.tools?.map(t => t.toolSpec?.name)).toEqual(['get_shop_snapshot', 'find_work_orders']);
    const toolResult = second.messages.at(-1)!.content![0]!.toolResult!;
    expect(JSON.stringify(toolResult)).toContain('920.43');
  });

  it('says what the tools said, word for word, instead of the model rephrasing it', async () => {
    const { client } = await connect();
    const model = scripted([use('get_shop_snapshot', {}), say('It is due Friday.')]);
    const out = await runTurn({ client, converse: model, text: 'How are we doing?', history: [] });
    expect(out.reply).toBe('Today you have taken in $920.43.');
  });

  it('uses the model text when no tool ran', async () => {
    const { client } = await connect();
    const out = await runTurn({ client, converse: scripted([say('Hi, how can I help?')]), text: 'Hello', history: [] });
    expect(out.reply).toBe('Hi, how can I help?');
  });

  it('marks tool errors and has no screen when no tool returned one', async () => {
    const { client } = await connect();
    const model = scripted([use('find_work_orders', { query: 'the blue sedan' }), say('I could not find it.')]);
    const out = await runTurn({ client, converse: model, text: 'Find the blue sedan', history: [] });
    expect(out.calls).toEqual([{ tool: 'find_work_orders', arguments: { query: 'the blue sedan' }, isError: true, result: 'Nothing matches.' }]);
    expect(out.ui).toBeUndefined();
  });

  it('sends the earlier turns as plain conversation', async () => {
    const { client } = await connect();
    const model = scripted([say('Hello.')]);
    await runTurn({
      client, converse: model, text: 'And now?',
      history: [{ role: 'user', text: 'Hi' }, { role: 'assistant', text: 'Hi there.' }]
    });
    expect(model.seen[0]!.messages.map(m => [m.role, m.content![0]!.text])).toEqual([
      ['user', 'Hi'], ['assistant', 'Hi there.'], ['user', 'And now?']
    ]);
  });

  it('rebuilds earlier tool calls as real tool use, so the model sees what the tools did', async () => {
    const { client } = await connect();
    const model = scripted([say('Done.')]);
    await runTurn({
      client, converse: model, text: 'And the blue sedan?',
      history: [
        { role: 'user', text: "How's the shop?" },
        { role: 'assistant', text: 'Busy day.', calls: [{ tool: 'get_shop_snapshot', arguments: {}, result: 'Today you have taken in $920.43.', isError: false }] },
        { role: 'user', text: 'Old tool?' },
        { role: 'assistant', text: 'Gone.', calls: [{ tool: 'set_up_my_business', arguments: {}, result: 'Started.', isError: false }] }
      ]
    });
    const messages = model.seen[0]!.messages;
    expect(messages.map(m => m.role)).toEqual(['user', 'assistant', 'user', 'assistant', 'user', 'assistant', 'user']);
    expect(messages[1]!.content![0]!.toolUse?.name).toBe('get_shop_snapshot');
    expect(messages[2]!.content![0]!.toolResult?.content?.[0]?.text).toBe('Today you have taken in $920.43.');
    expect(messages[3]!.content![0]!.text).toBe('Busy day.');
    // A tool the business no longer has (setup tools after activation) stays as plain text.
    expect(messages[5]!.content![0]!.text).toBe('Gone.');
  });

  it('returns what each tool said, for the history of the next turn', async () => {
    const { client } = await connect();
    const model = scripted([use('get_shop_snapshot', {}), say('Busy day.')]);
    const out = await runTurn({ client, converse: model, text: "How's the shop?", history: [] });
    expect(out.calls[0]!.result).toBe('Today you have taken in $920.43.');
  });

  it('stops after a few model calls even if the model keeps calling tools', async () => {
    const { client, calls } = await connect();
    const model = scripted(Array.from({ length: 10 }, (_, i) => use('get_shop_snapshot', {}, `t${i}`)));
    const out = await runTurn({ client, converse: model, text: 'Loop', history: [] });
    expect(calls.length).toBeLessThanOrEqual(5);
    expect(out.reply.length).toBeGreaterThan(0);
  });

  it('uses the Agent Skill as its instructions', () => {
    const prompt = agentSystemPrompt();
    expect(prompt).toContain('Never ask for an order number');
    expect(prompt).toContain('unless a tool did it in this turn');
    expect(prompt).not.toContain('name: counterpart');
  });
});

describe('spoken reply', () => {
  it('cuts the conversation the model makes up after its answer', () => {
    const raw = "$3825.21 from 18 sales, averaging $212.51. That's down from $4842.14 the period before, and the best seller was Diagnostic."
      + `What's waiting on parts?{"query":"waiting on parts"}2 work orders: work order 45.`;
    expect(spokenReply(raw, 'fallback')).toBe("$3825.21 from 18 sales, averaging $212.51. That's down from $4842.14 the period before, and the best seller was Diagnostic.");
  });

  it('never reads out the model talking about the user instead of to them', () => {
    expect(spokenReply('Okay, the user said "Actually, no." They probably changed their mind.', 'x')).toBe('Okay.');
  });

  it('keeps at most three sentences', () => {
    expect(spokenReply('One. Two. Three. Four.', 'x')).toBe('One. Two. Three.');
  });

  it('falls back to what the tool said when nothing usable is left', () => {
    expect(spokenReply('{"query":"x"}', 'Work order 41 is in the bay.')).toBe('Work order 41 is in the bay.');
    expect(spokenReply('', 'Work order 41 is in the bay.')).toBe('Work order 41 is in the bay.');
  });

  it('leaves a normal reply alone, decimals included', () => {
    expect(spokenReply('Added front brake pads to work order 41. The total is now $253.71.', 'x'))
      .toBe('Added front brake pads to work order 41. The total is now $253.71.');
  });
});
