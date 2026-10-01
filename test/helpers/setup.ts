import fs from 'node:fs';
import type { Attempt, DraftGenerator } from '../../src/setup/generate.js';

const FLORIST = new URL('../fixtures/setup/florist.json', import.meta.url);

/** A valid flower shop draft, just as Nova would return it. A fresh copy on every call. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function floristDraft(): any {
  return JSON.parse(fs.readFileSync(FLORIST, 'utf8'));
}

/** Test generator: returns (or throws) the replies in order, repeats the last one, and records every attempt. */
export function scriptedGenerator(...replies: Array<unknown | Error>): DraftGenerator & { attempts: Attempt[] } {
  const attempts: Attempt[] = [];
  const queue = [...replies];
  const generate = async (attempt: Attempt): Promise<unknown> => {
    attempts.push(attempt);
    const next = queue.length > 1 ? queue.shift() : queue[0];
    if (next instanceof Error) throw next;
    return structuredClone(next);
  };
  return Object.assign(generate, { attempts });
}
