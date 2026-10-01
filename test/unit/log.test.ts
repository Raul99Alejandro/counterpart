import { describe, expect, it } from 'vitest';
import { captureLogs, log } from '../../src/log.js';

describe('logs', () => {
  it('writes one JSON object per event, with a timestamp', () => {
    const cap = captureLogs();
    try {
      log({ level: 'info', msg: 'hello', n: 1 });
      const [line] = cap.lines();
      expect(line).toMatchObject({ level: 'info', msg: 'hello', n: 1 });
      expect(typeof line!.ts).toBe('string');
    } finally {
      cap.restore();
    }
  });
});
