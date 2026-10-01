import { describe, expect, it } from 'vitest';
import { hostPolicy } from '../../src/http/hosts.js';

describe('host policy', () => {
  it('outside production and without the variable, accepts any host', () => {
    expect(hostPolicy({})).toEqual({ kind: 'any' });
  });

  it('reads a comma-separated list, trimmed, lowercased and without empty entries', () => {
    expect(hostPolicy({ COUNTERPART_ALLOWED_HOSTS: ' Counterpart.Example , ,other.example ' }))
      .toEqual({ kind: 'list', hosts: ['counterpart.example', 'other.example'] });
  });

  it('bootstrap closes /mcp while the hostname is not known yet', () => {
    expect(hostPolicy({ NODE_ENV: 'production', COUNTERPART_ALLOWED_HOSTS: 'bootstrap' })).toEqual({ kind: 'closed' });
  });

  it('in production it refuses to start without the variable', () => {
    expect(() => hostPolicy({ NODE_ENV: 'production' })).toThrow(/COUNTERPART_ALLOWED_HOSTS/);
  });

  it('in production it refuses to start with an empty variable', () => {
    expect(() => hostPolicy({ NODE_ENV: 'production', COUNTERPART_ALLOWED_HOSTS: ' , ' })).toThrow(/COUNTERPART_ALLOWED_HOSTS/);
  });
});
