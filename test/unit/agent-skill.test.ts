import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { loadTemplate } from '../../src/profiles/load.js';
import { SETUP_TOOL_NAMES } from '../../src/setup/validate.js';

const dir = path.join(import.meta.dirname, '../../skills/counterpart');
const skill = readFileSync(path.join(dir, 'SKILL.md'), 'utf8');
const reference = readFileSync(path.join(dir, 'references/tools.md'), 'utf8');

const tools = new Set<string>([
  ...SETUP_TOOL_NAMES,
  ...['auto-repair', 'bakery'].flatMap(id => Object.values(loadTemplate(id).toolNames))
]);

/** Backticked snake_case names that look like tools: `find_work_orders`, not `in_bay` or `cash`. */
function toolMentions(text: string): string[] {
  return [...text.matchAll(/`([a-z]+(?:_[a-z]+){1,})`/g)].map(m => m[1]!)
    .filter(name => /^(get|find|open|take|move|add|check|reorder|close|sales|set|review|activate)_/.test(name));
}

describe('Agent Skill', () => {
  it('has the frontmatter an Agent Skill needs', () => {
    const match = skill.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    expect(match).not.toBeNull();
    const meta = parse(match![1]!) as { name: string; description: string };
    expect(meta.name).toBe('counterpart');
    expect(meta.name).toMatch(/^[a-z0-9-]{1,64}$/);
    expect(meta.description.length).toBeGreaterThan(50);
    expect(meta.description.length).toBeLessThanOrEqual(1024);
  });

  it('only names tools the server really exposes', () => {
    const mentioned = [...toolMentions(skill), ...toolMentions(reference)];
    expect(mentioned.length).toBeGreaterThan(15);
    expect(mentioned.filter(name => !tools.has(name))).toEqual([]);
  });

  it('lists every tool of the built-in businesses in its reference', () => {
    expect([...tools].filter(name => !reference.includes(`\`${name}\``))).toEqual([]);
  });
});
