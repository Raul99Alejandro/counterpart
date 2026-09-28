import fs from 'node:fs';
import type { Attempt, DraftGenerator } from '../../src/setup/generate.js';

const FLORIST = new URL('../fixtures/setup/florist.json', import.meta.url);

/** Borrador válido de una florería, tal como lo devolvería Nova. Copia fresca en cada llamada. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function floristDraft(): any {
  return JSON.parse(fs.readFileSync(FLORIST, 'utf8'));
}

/** Generador de prueba: devuelve (o lanza) las respuestas en orden, repite la última, y guarda cada intento. */
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
