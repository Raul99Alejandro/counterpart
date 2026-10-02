import {
  ConverseCommand, type BedrockRuntimeClient, type ContentBlock, type Message, type Tool, type ToolConfiguration
} from '@aws-sdk/client-bedrock-runtime';
import type { Client } from '@modelcontextprotocol/client';
import type { ConverseFn } from '../setup/generate.js';
import { skillInstructions } from '../skill.js';

/** Model calls per turn: pick a tool, read its result, maybe one more tool, then the reply. */
const MAX_MODEL_CALLS = 5;
const FALLBACK_REPLY = "Sorry, I couldn't finish that. Try asking in a different way.";

export interface ToolCall { tool: string; arguments: Record<string, unknown>; isError: boolean; result: string }

/** An earlier turn. An assistant turn carries the tool calls behind it, so the model sees what the tools did. */
export interface HistoryEntry { role: 'user' | 'assistant'; text: string; calls?: ToolCall[] }

export interface TurnResult {
  reply: string;
  calls: ToolCall[];
  /** The last tool call this turn whose tool has an MCP App, for the page to render. */
  ui?: { resourceUri: string; toolName: string; toolInput: Record<string, unknown>; toolResult: Record<string, unknown> };
}

const DEMO_NOTE = '\n\n## In this demo\n\nYou are Alexa on an Echo Show, talking with the owner of the business the tools belong to. '
  + 'Your words are spoken aloud: one or two short sentences, no lists, no markdown. '
  + 'Act only through the tools: never say an order was opened, changed, closed or reordered unless a tool did it in this turn. '
  + 'Speak to the owner directly; never describe the user or your own reasoning.';

let cachedPrompt: string | undefined;

/** The Agent Skill (frontmatter removed) plus a note about the demo device. */
export function agentSystemPrompt(): string {
  cachedPrompt ??= skillInstructions() + DEMO_NOTE;
  return cachedPrompt;
}

/** Converse against Bedrock with short, deterministic replies. */
export function agentConverse(client: BedrockRuntimeClient, modelId: string): ConverseFn {
  return async input => {
    const out = await client.send(new ConverseCommand({ modelId, ...input, inferenceConfig: { maxTokens: 400, temperature: 0 } }));
    const message = out.output?.message;
    if (!message) throw new Error('empty reply from the model');
    return message;
  };
}

/**
 * One spoken turn, the way the Alexa+ orchestrator would run it: the model picks among the business's
 * MCP tools, the tools run over MCP, and the model phrases the answer. Tools are listed every turn,
 * so a business activated by voice offers its new tools on the next one.
 */
export async function runTurn(opts: {
  client: Client; converse: ConverseFn; text: string; history: HistoryEntry[];
}): Promise<TurnResult> {
  const { tools } = await opts.client.listTools();
  const uiByTool = new Map(tools.flatMap(t => {
    const uri = (t._meta as { ui?: { resourceUri?: string } } | undefined)?.ui?.resourceUri;
    return uri ? [[t.name, uri] as const] : [];
  }));
  const toolConfig: ToolConfiguration = {
    tools: tools.map((t): Tool => {
      // Bedrock does not accept $schema.
      const { $schema: _ignored, ...schema } = t.inputSchema as Record<string, unknown>;
      return { toolSpec: { name: t.name, description: t.description ?? '', inputSchema: { json: schema as never } } };
    })
  };

  const known = new Set(tools.map(t => t.name));
  const messages: Message[] = [...replay(opts.history, known), { role: 'user', content: [{ text: opts.text }] }];
  const result: TurnResult = { reply: '', calls: [] };

  for (let call = 0; call < MAX_MODEL_CALLS; call += 1) {
    const answer = await opts.converse({ system: [{ text: agentSystemPrompt() }], messages, toolConfig });
    messages.push(answer);
    const text = (answer.content ?? []).flatMap(b => (b.text ? [b.text] : [])).join(' ').trim();
    if (text) result.reply = text;
    const uses = (answer.content ?? []).flatMap(b => (b.toolUse ? [b.toolUse] : []));
    if (uses.length === 0) break;

    const toolResults: ContentBlock[] = [];
    for (const use of uses) {
      const args = (use.input ?? {}) as Record<string, unknown>;
      const called = await opts.client.callTool({ name: use.name!, arguments: args });
      const isError = called.isError === true;
      const spoken = (called.content as Array<{ text?: string }>).map(c => c.text ?? '').join(' ');
      result.calls.push({ tool: use.name!, arguments: args, isError, result: spoken });
      const uri = uiByTool.get(use.name!);
      if (uri && !isError) {
        result.ui = { resourceUri: uri, toolName: use.name!, toolInput: args, toolResult: called as Record<string, unknown> };
      }
      // Text and JSON both reach the model: the text is already phrased to be spoken.
      const content = called.structuredContent === undefined
        ? [{ text: spoken || '(no text)' }]
        : [{ text: spoken || '(no text)' }, { json: called.structuredContent as never }];
      toolResults.push({ toolResult: { toolUseId: use.toolUseId!, content, status: isError ? 'error' : 'success' } });
    }
    messages.push({ role: 'user', content: toolResults });
  }

  // The tools' sentences are already written to be spoken, and the skill says to say them as they are:
  // the model rephrasing them is where numbers lose their commas and answers drift. Without a tool, the
  // model's own words. A turn that failed and retried speaks only what succeeded.
  const succeeded = result.calls.filter(c => !c.isError && c.result);
  const toolSpeech = (succeeded.length > 0 ? succeeded : result.calls).map(c => c.result).filter(Boolean).join(' ');
  result.reply = toolSpeech ? spokenReply(toolSpeech, FALLBACK_REPLY) : spokenReply(result.reply, FALLBACK_REPLY);
  return result;
}

/**
 * What Alexa says out loud. Nova sometimes keeps writing after its answer, inventing the next turns
 * ("…was Diagnostic.What's waiting on parts?{"query":…}"): cut at the first JSON or at a sentence glued
 * to the next one, keep at most three sentences, and fall back to the tool's sentence if nothing is left.
 */
export function spokenReply(text: string, fallback: string): string {
  // Nova sometimes narrates instead of answering ("Okay, the user said…"): a plain acknowledgement is better.
  if (/\bthe user\b/i.test(text)) return 'Okay.';
  let reply = text.split(/[{[]/)[0]!;
  const glued = /[.!?](?=[A-Z])/.exec(reply);
  if (glued) reply = reply.slice(0, glued.index + 1);
  const sentences = reply.match(/(?:[^.!?]|[.!?](?=\d))+(?:[.!?]+|$)/g) ?? [];
  reply = sentences.slice(0, 3).join('').trim();
  return reply.length > 0 ? reply : fallback;
}

/**
 * Earlier turns as the model saw them: an assistant turn with tool calls becomes the tool use, its
 * results and the reply. Calls to tools the business no longer has (the setup tools after activation)
 * stay as plain text: Bedrock refuses a tool use it has no definition for.
 */
function replay(history: HistoryEntry[], known: Set<string>): Message[] {
  const messages: Message[] = [];
  history.forEach((entry, i) => {
    const calls = entry.role === 'assistant' ? (entry.calls ?? []).filter(c => known.has(c.tool)) : [];
    if (calls.length > 0 && messages.at(-1)?.role === 'user') {
      messages.push({
        role: 'assistant',
        content: calls.map((c, j) => ({ toolUse: { toolUseId: `h${i}-${j}`, name: c.tool, input: c.arguments as never } }))
      });
      messages.push({
        role: 'user',
        content: calls.map((c, j) => ({
          toolResult: { toolUseId: `h${i}-${j}`, content: [{ text: c.result || '(no text)' }], status: c.isError ? 'error' : 'success' }
        }))
      });
    }
    messages.push({ role: entry.role, content: [{ text: entry.text }] });
  });
  return messages;
}
