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
  // host 0.0.0.0 como en el contenedor: así el SDK no agrega su validación de localhost.
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

describe('validación de Host', () => {
  const list: HostPolicy = { kind: 'list', hosts: ['counterpart.example'] };

  it('/ping responde con cualquier Host, como lo llama el health check del balanceador', async () => {
    const port = await start(list);
    expect(await request(port, '/ping', '10.0.3.17:3000')).toBe(200);
  });

  it('/mcp rechaza un Host que no está en la lista', async () => {
    const port = await start(list);
    expect(await request(port, '/mcp', 'evil.example', 'POST')).toBe(403);
  });

  it('/mcp acepta el hostname de la lista aunque traiga puerto o mayúsculas', async () => {
    const port = await start(list);
    // Sin token: pasar la validación de Host se ve como el 401 de la autenticación.
    expect(await request(port, '/mcp', 'Counterpart.Example:443', 'POST')).toBe(401);
  });

  it('con la política cerrada, /mcp responde 503 y /ping sigue sano', async () => {
    const port = await start({ kind: 'closed' });
    expect(await request(port, '/mcp', 'counterpart.example', 'POST')).toBe(503);
    expect(await request(port, '/ping', 'counterpart.example')).toBe(200);
  });

  it('sin política, /mcp no valida el Host', async () => {
    const port = await start({ kind: 'any' });
    expect(await request(port, '/mcp', 'anything.example', 'POST')).toBe(401);
  });
});
