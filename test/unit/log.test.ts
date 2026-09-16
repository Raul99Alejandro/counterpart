import { describe, expect, it } from 'vitest';
import { captureLogs, log } from '../../src/log.js';

describe('logs', () => {
  it('escribe un objeto JSON por evento, con marca de tiempo', () => {
    const cap = captureLogs();
    try {
      log({ level: 'info', msg: 'hola', n: 1 });
      const [line] = cap.lines();
      expect(line).toMatchObject({ level: 'info', msg: 'hola', n: 1 });
      expect(typeof line!.ts).toBe('string');
    } finally {
      cap.restore();
    }
  });
});
