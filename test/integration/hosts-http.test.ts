import { afterEach, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../../src/http/app.js';
import type { HostPolicy } from '../../src/http/hosts.js';
import { MemoryStore } from '../../src/store/memory.js';

let server: Server | undefined;
afterEach(() => { server?.close(); server = undefined; });

async function start(hosts: HostPolicy): Promise<number> {
  // host 0.0.0.0 as in the container: this way the SDK does not add its localhost validation.
  server = createApp({ store: new MemoryStore(), host: '0.0.0.0', hosts }).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server!.once('listening', () => resolve()));
  return (server!.address() as AddressInfo).port;
}

function request(port: number, path: string, hostHeader: string, method = 'GET'): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = http.request({ port, path, method, host: '127.0.0.1', headers: { host: hostHeader, 'content-type': 'application/json' } }, res => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on('error', reject);
    req.end(method === 'POST' ? '{}' : undefined);
  });
}

describe('Host validation', () => {
  const list: HostPolicy = { kind: 'list', hosts: ['counterpart.example'] };

  it('/ping answers with any Host, as the load balancer health check calls it', async () => {
    const port = await start(list);
    expect(await request(port, '/ping', '10.0.3.17:3000')).toBe(200);
  });

  it('/mcp rejects a Host that is not on the list', async () => {
    const port = await start(list);
    expect(await request(port, '/mcp', 'evil.example', 'POST')).toBe(403);
  });

  it('/mcp accepts the listed hostname even with a port or uppercase letters', async () => {
    const port = await start(list);
    // No token: passing Host validation shows up as the authentication 401.
    expect(await request(port, '/mcp', 'Counterpart.Example:443', 'POST')).toBe(401);
  });

  it('with the closed policy, /mcp answers 503 and /ping stays healthy', async () => {
    const port = await start({ kind: 'closed' });
    expect(await request(port, '/mcp', 'counterpart.example', 'POST')).toBe(503);
    expect(await request(port, '/ping', 'counterpart.example')).toBe(200);
  });

  it('with no policy, /mcp does not validate the Host', async () => {
    const port = await start({ kind: 'any' });
    expect(await request(port, '/mcp', 'anything.example', 'POST')).toBe(401);
  });
});
