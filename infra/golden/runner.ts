import type {
  ContentBlock, Message, SystemContentBlock, Tool, ToolConfiguration, ToolResultContentBlock
} from '@aws-sdk/client-bedrock-runtime';
import type { Client } from '@modelcontextprotocol/client';
import { argsMatch } from './match.js';

export type ConverseFn = (input: { system: SystemContentBlock[]; messages: Message[]; toolConfig: ToolConfiguration }) => Promise<Message>;
export interface GoldenPhrase { say: string; tool: string; args: Record<string, unknown> }
export interface GoldenReport {
  passed: number;
  total: number;
  results: Array<{ say: string; expected: string; got: string | null; gotArgs: unknown; pass: boolean; reply?: string }>;
}

const SYSTEM: SystemContentBlock[] = [{
  text: 'You are Alexa helping the owner of a small business run their day by voice. '
    + 'Use the available tools to act on every request. Answer in one or two short spoken sentences.'
}];
const MAX_STEPS = 4; // model calls per phrase: tool, result, at most one more tool, reply

/** The server's tools in Converse format. Bedrock does not accept $schema. */
async function toolConfig(client: Client): Promise<ToolConfiguration> {
  const { tools } = await client.listTools();
  const specs: Tool[] = tools.map(t => {
    const { $schema: _ignored, ...schema } = t.inputSchema as Record<string, unknown>;
    return { toolSpec: { name: t.name, description: t.description ?? '', inputSchema: { json: schema as never } } };
  });
  return { tools: specs };
}

/**
 * Runs the phrases in order over a single conversation and a single MCP session, as the user
 * would say them (base spec §11.4). Counts the FIRST tool the model picks for each phrase.
 */
/** Brings arguments to a comparable form; e.g. "the Civic" and "work order 41" to the same order. */
export type Canonicalize = (args: Record<string, unknown>) => Promise<Record<string, unknown>>;

export async function runGolden(opts: {
  client: Client; model: ConverseFn; phrases: GoldenPhrase[]; canonicalize?: Canonicalize;
}): Promise<GoldenReport> {
  const canon: Canonicalize = opts.canonicalize ?? (async args => args);
  const config = await toolConfig(opts.client);
  const messages: Message[] = [];
  const results: GoldenReport['results'] = [];

  for (const phrase of opts.phrases) {
    messages.push({ role: 'user', content: [{ text: phrase.say }] });
    let first: { name: string; input: unknown } | null = null;
    let reply: string | undefined;

    for (let step = 0; step < MAX_STEPS; step += 1) {
      const answer = await opts.model({ system: SYSTEM, messages, toolConfig: config });
      messages.push(answer);
      reply = (answer.content ?? []).flatMap(block => ('text' in block && block.text ? [block.text] : [])).join(' ') || reply;
      const uses = (answer.content ?? []).flatMap(block => ('toolUse' in block && block.toolUse ? [block.toolUse] : []));
      if (uses.length === 0) break;
      first ??= { name: uses[0]!.name!, input: uses[0]!.input };

      const toolResults: ContentBlock[] = [];
      for (const use of uses) {
        const result = await opts.client.callTool({ name: use.name!, arguments: (use.input ?? {}) as Record<string, unknown> });
        const text = (result.content as Array<{ text?: string }>).map(c => c.text ?? '').join(' ');
        const content: ToolResultContentBlock[] = [{ text: text || '(no text)' }];
        toolResults.push({ toolResult: { toolUseId: use.toolUseId!, content, status: result.isError ? 'error' : 'success' } });
      }
      messages.push({ role: 'user', content: toolResults });
    }

    // If the conversation ended in tool results without text, close the turn so the next
    // phrase starts with a valid user message.
    if (messages[messages.length - 1]?.role === 'user') messages.push({ role: 'assistant', content: [{ text: 'OK.' }] });

    // Canonicalize after the phrase ends: the orders the phrase closed or created already exist in the store.
    const pass = first !== null && first.name === phrase.tool
      && argsMatch(await canon(phrase.args), await canon((first.input ?? {}) as Record<string, unknown>));
    results.push({ say: phrase.say, expected: phrase.tool, got: first?.name ?? null, gotArgs: first?.input, pass, reply });
  }

  return { passed: results.filter(r => r.pass).length, total: results.length, results };
}
