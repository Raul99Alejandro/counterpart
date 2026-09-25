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
  results: Array<{ say: string; expected: string; got: string | null; gotArgs: unknown; pass: boolean }>;
}

const SYSTEM: SystemContentBlock[] = [{
  text: 'You are Alexa helping the owner of a small business run their day by voice. '
    + 'Use the available tools to act on every request. Answer in one or two short spoken sentences.'
}];
const MAX_STEPS = 4; // llamadas al modelo por frase: tool, resultado, a lo sumo otra tool, respuesta

/** Las tools del servidor en el formato de Converse. $schema no lo acepta Bedrock. */
async function toolConfig(client: Client): Promise<ToolConfiguration> {
  const { tools } = await client.listTools();
  const specs: Tool[] = tools.map(t => {
    const { $schema: _ignored, ...schema } = t.inputSchema as Record<string, unknown>;
    return { toolSpec: { name: t.name, description: t.description ?? '', inputSchema: { json: schema as never } } };
  });
  return { tools: specs };
}

/**
 * Corre las frases en orden sobre una sola conversación y una sola sesión MCP, como las diría el
 * usuario (spec base §11.4). Cuenta la PRIMERA tool que elige el modelo en cada frase.
 */
export async function runGolden(opts: { client: Client; model: ConverseFn; phrases: GoldenPhrase[] }): Promise<GoldenReport> {
  const config = await toolConfig(opts.client);
  const messages: Message[] = [];
  const results: GoldenReport['results'] = [];

  for (const phrase of opts.phrases) {
    messages.push({ role: 'user', content: [{ text: phrase.say }] });
    let first: { name: string; input: unknown } | null = null;

    for (let step = 0; step < MAX_STEPS; step += 1) {
      const reply = await opts.model({ system: SYSTEM, messages, toolConfig: config });
      messages.push(reply);
      const uses = (reply.content ?? []).flatMap(block => ('toolUse' in block && block.toolUse ? [block.toolUse] : []));
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

    // Si la conversación terminó en tool results sin texto, se cierra el turno para que la siguiente
    // frase empiece con un mensaje de usuario válido.
    if (messages[messages.length - 1]?.role === 'user') messages.push({ role: 'assistant', content: [{ text: 'OK.' }] });

    const pass = first !== null && first.name === phrase.tool && argsMatch(phrase.args, first.input);
    results.push({ say: phrase.say, expected: phrase.tool, got: first?.name ?? null, gotArgs: first?.input, pass });
  }

  return { passed: results.filter(r => r.pass).length, total: results.length, results };
}
