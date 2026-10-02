import { readFileSync } from 'node:fs';
import path from 'node:path';
import { packageRoot } from './tools/ui-assets.js';

let cached: string | undefined;

/**
 * The Agent Skill (skills/counterpart/SKILL.md) without its frontmatter: how an agent should use these
 * tools by voice. The server announces it as its MCP instructions, which hosts put in the agent's prompt.
 */
export function skillInstructions(): string {
  cached ??= readFileSync(path.join(packageRoot(), 'skills', 'counterpart', 'SKILL.md'), 'utf8')
    .replace(/^---[\s\S]*?\n---\s*/, '').trim();
  return cached;
}
