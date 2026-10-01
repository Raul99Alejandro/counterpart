import { describe, expect, it } from 'vitest';
import type { Message } from '@aws-sdk/client-bedrock-runtime';
import {
  generateSetup, NoSetupInReply, novaDraftGenerator, SETUP_INPUT_SCHEMA, SETUP_TOOL, UNAVAILABLE_TEXT, type ConverseFn
} from '../../src/setup/generate.js';
import { GENERIC_QUESTION, STAGES_QUESTION } from '../../src/setup/validate.js';
import { floristDraft, scriptedGenerator } from '../helpers/setup.js';

const broken = () => { const d = floristDraft(); d.profile.closedStage = 'done'; return d; };

describe('draft generation with one repair', () => {
  it('accepts the first valid attempt', async () => {
    const generate = scriptedGenerator(floristDraft());
    const outcome = await generateSetup('I run a flower shop', generate);
    expect(outcome.ok).toBe(true);
    expect(generate.attempts).toHaveLength(1);
  });

  it('repairs once with the exact list of errors', async () => {
    const generate = scriptedGenerator(broken(), floristDraft());
    const outcome = await generateSetup('I run a flower shop', generate);
    expect(outcome.ok).toBe(true);
    expect(generate.attempts[1]?.previous?.errors).toEqual(['profile: closedStage "done" is not one of the stages']);
    expect(generate.attempts[1]?.previous?.draft).toEqual(broken());
  });

  it('gives up after the repair and asks about what was missing', async () => {
    const generate = scriptedGenerator(broken());
    const outcome = await generateSetup('I run a flower shop', generate);
    expect(outcome).toMatchObject({ ok: false, spoken: STAGES_QUESTION });
    expect(generate.attempts).toHaveLength(2);
  });

  it('a failing service (permissions, throttling) does not spend the repair and says so separately', async () => {
    const generate = scriptedGenerator(new Error('AccessDeniedException'));
    const outcome = await generateSetup('I run a flower shop', generate);
    expect(outcome).toMatchObject({ ok: false, spoken: UNAVAILABLE_TEXT });
    expect(generate.attempts).toHaveLength(1);
    if (!outcome.ok) expect(outcome.errors[0]).toMatch(/AccessDeniedException/);
  });

  it('a reply without the tool does get repaired', async () => {
    const generate = scriptedGenerator(new NoSetupInReply(), floristDraft());
    const outcome = await generateSetup('I run a flower shop', generate);
    expect(outcome.ok).toBe(true);
    expect(generate.attempts).toHaveLength(2);
  });
});

describe('Nova generator', () => {
  function fakeConverse(reply: Message): ConverseFn & { calls: Parameters<ConverseFn>[0][] } {
    const calls: Parameters<ConverseFn>[0][] = [];
    return Object.assign(async (input: Parameters<ConverseFn>[0]) => { calls.push(input); return reply; }, { calls });
  }

  it('forces the tool with the zod-derived schema and returns its input', async () => {
    const converse = fakeConverse({ role: 'assistant', content: [{ toolUse: { toolUseId: 't1', name: SETUP_TOOL, input: floristDraft() } }] });
    const draft = await novaDraftGenerator(converse)({ description: 'I run a flower shop' });
    expect(draft).toEqual(floristDraft());
    const call = converse.calls[0]!;
    expect(call.toolConfig.toolChoice).toEqual({ tool: { name: SETUP_TOOL } });
    expect(Object.keys((SETUP_INPUT_SCHEMA as { properties: object }).properties)).toEqual(['profile', 'catalog']);
    expect(SETUP_INPUT_SCHEMA).not.toHaveProperty('$schema');
    expect(call.messages[0]?.content?.[0]).toEqual({ text: 'I run a flower shop' });
  });

  it('on repair it sends the errors and its previous attempt', async () => {
    const converse = fakeConverse({ role: 'assistant', content: [{ toolUse: { toolUseId: 't1', name: SETUP_TOOL, input: {} } }] });
    await novaDraftGenerator(converse)({ description: 'I run a flower shop', previous: { draft: { a: 1 }, errors: ['profile: bad'] } });
    const text = (converse.calls[0]!.messages[0]!.content![0] as { text: string }).text;
    expect(text).toContain('- profile: bad');
    expect(text).toContain('{"a":1}');
  });

  it('a reply without the tool is an error', async () => {
    const converse = fakeConverse({ role: 'assistant', content: [{ text: 'Sure! Here is your setup.' }] });
    await expect(novaDraftGenerator(converse)({ description: 'x' })).rejects.toBeInstanceOf(NoSetupInReply);
  });
});
