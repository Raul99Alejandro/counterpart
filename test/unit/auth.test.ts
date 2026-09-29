import { describe, expect, it } from 'vitest';
import { bearerFrom, hashToken } from '../../src/http/auth.js';
import { Sessions } from '../../src/http/sessions.js';
import { createApp } from '../../src/http/app.js';
import { MemoryStore } from '../../src/store/memory.js';

describe('autenticación', () => {
  it('extrae el bearer y rechaza lo demás', () => {
    expect(bearerFrom('Bearer abc123')).toBe('abc123');
    expect(bearerFrom('bearer abc123')).toBe('abc123');
    expect(bearerFrom('Basic abc123')).toBeNull();
    expect(bearerFrom(undefined)).toBeNull();
  });

  it('hashea de forma estable', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(hashToken('abc')).toHaveLength(64);
    expect(hashToken('abc')).not.toBe(hashToken('abd'));
  });
});

describe('sesiones', () => {
  const entry = { transport: {} as never, server: {} as never, businessId: 'b1', state: { status: 'active' as const }, lastSeen: 0 };

  it('solo entrega la sesión al negocio dueño', () => {
    const s = new Sessions();
    s.set('sid', { ...entry });
    expect(s.get('sid', 'b1')).not.toBeNull();
    expect(s.get('sid', 'b2')).toBeNull();
    expect(s.get('otra', 'b1')).toBeNull();
  });

  it('descarta sesiones inactivas', () => {
    const s = new Sessions();
    s.set('sid', { ...entry, lastSeen: 1000 });
    s.sweep(1000 + 31 * 60 * 1000, 30 * 60 * 1000);
    expect(s.get('sid', 'b1')).toBeNull();
  });
});

describe('modo local sin token', () => {
  it('rechaza COUNTERPART_DEV_BUSINESS fuera de 127.0.0.1 y lo acepta en 127.0.0.1', () => {
    const store = new MemoryStore();
    expect(() => createApp({ store, devBusinessId: 'shop', host: '0.0.0.0' })).toThrow();
    expect(() => createApp({ store, devBusinessId: 'shop', host: '127.0.0.1' })).not.toThrow();
  });
});
