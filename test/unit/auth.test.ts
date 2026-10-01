import { describe, expect, it } from 'vitest';
import { bearerFrom, hashToken } from '../../src/http/auth.js';
import { Sessions } from '../../src/http/sessions.js';
import { createApp } from '../../src/http/app.js';
import { MemoryStore } from '../../src/store/memory.js';

describe('authentication', () => {
  it('extracts the bearer token and rejects everything else', () => {
    expect(bearerFrom('Bearer abc123')).toBe('abc123');
    expect(bearerFrom('bearer abc123')).toBe('abc123');
    expect(bearerFrom('Basic abc123')).toBeNull();
    expect(bearerFrom(undefined)).toBeNull();
  });

  it('hashes deterministically', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(hashToken('abc')).toHaveLength(64);
    expect(hashToken('abc')).not.toBe(hashToken('abd'));
  });
});

describe('sessions', () => {
  const entry = { transport: {} as never, server: {} as never, businessId: 'b1', state: { status: 'active' as const }, lastSeen: 0 };

  it('hands the session only to the business that owns it', () => {
    const s = new Sessions();
    s.set('sid', { ...entry });
    expect(s.get('sid', 'b1')).not.toBeNull();
    expect(s.get('sid', 'b2')).toBeNull();
    expect(s.get('other', 'b1')).toBeNull();
  });

  it('drops idle sessions', () => {
    const s = new Sessions();
    s.set('sid', { ...entry, lastSeen: 1000 });
    s.sweep(1000 + 31 * 60 * 1000, 30 * 60 * 1000);
    expect(s.get('sid', 'b1')).toBeNull();
  });
});

describe('local mode without a token', () => {
  it('rejects COUNTERPART_DEV_BUSINESS outside 127.0.0.1 and accepts it on 127.0.0.1', () => {
    const store = new MemoryStore();
    expect(() => createApp({ store, devBusinessId: 'shop', host: '0.0.0.0' })).toThrow();
    expect(() => createApp({ store, devBusinessId: 'shop', host: '127.0.0.1' })).not.toThrow();
  });
});
