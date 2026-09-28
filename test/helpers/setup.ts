import fs from 'node:fs';

const FLORIST = new URL('../fixtures/setup/florist.json', import.meta.url);

/** Borrador válido de una florería, tal como lo devolvería Nova. Copia fresca en cada llamada. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function floristDraft(): any {
  return JSON.parse(fs.readFileSync(FLORIST, 'utf8'));
}
