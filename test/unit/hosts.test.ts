import { describe, expect, it } from 'vitest';
import { hostPolicy } from '../../src/http/hosts.js';

describe('política de hosts', () => {
  it('fuera de producción y sin variable, acepta cualquier host', () => {
    expect(hostPolicy({})).toEqual({ kind: 'any' });
  });

  it('lee una lista separada por comas, sin espacios, en minúsculas y sin vacíos', () => {
    expect(hostPolicy({ COUNTERPART_ALLOWED_HOSTS: ' Counterpart.Example , ,other.example ' }))
      .toEqual({ kind: 'list', hosts: ['counterpart.example', 'other.example'] });
  });

  it('bootstrap cierra /mcp mientras no se conoce el hostname', () => {
    expect(hostPolicy({ NODE_ENV: 'production', COUNTERPART_ALLOWED_HOSTS: 'bootstrap' })).toEqual({ kind: 'closed' });
  });

  it('en producción se niega a arrancar sin la variable', () => {
    expect(() => hostPolicy({ NODE_ENV: 'production' })).toThrow(/COUNTERPART_ALLOWED_HOSTS/);
  });

  it('en producción se niega a arrancar con la variable vacía', () => {
    expect(() => hostPolicy({ NODE_ENV: 'production', COUNTERPART_ALLOWED_HOSTS: ' , ' })).toThrow(/COUNTERPART_ALLOWED_HOSTS/);
  });
});
