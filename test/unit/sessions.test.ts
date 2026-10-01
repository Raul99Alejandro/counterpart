import { describe, expect, it } from 'vitest';
import { Sessions, type SessionEntry } from '../../src/http/sessions.js';

// Minimal doubles: countFor only looks at businessId.
const entry = (businessId: string): SessionEntry => ({
  businessId, state: { status: 'active' }, lastSeen: 0,
  transport: { close: async () => {} } as unknown as SessionEntry['transport'],
  server: { close: async () => {} } as unknown as SessionEntry['server']
});

describe('Sessions.countFor', () => {
  it('counts only the business sessions', () => {
    const s = new Sessions();
    s.set('a', entry('b1'));
    s.set('b', entry('b1'));
    s.set('c', entry('b2'));
    expect(s.countFor('b1')).toBe(2);
    expect(s.countFor('b2')).toBe(1);
    expect(s.countFor('b3')).toBe(0);
  });

  it('a closed or swept session stops counting', () => {
    const s = new Sessions();
    s.set('a', entry('b1'));
    s.set('b', entry('b1'));
    s.drop('a');
    expect(s.countFor('b1')).toBe(1);
    s.sweep(10_000, 1_000);
    expect(s.countFor('b1')).toBe(0);
  });
});
