import { describe, expect, it } from 'vitest';
import { bearerFrom, hashToken } from '../../src/http/auth.js';
import { Sessions } from '../../src/http/sessions.js';

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
  const entry = { transport: {} as never, server: {} as never, businessId: 'b1', lastSeen: 0 };

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
