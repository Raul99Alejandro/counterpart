import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

export interface SmokeResult { name: string; ok: boolean; detail: string }

const INIT = {
  jsonrpc: '2.0', id: 1, method: 'initialize',
  params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'counterpart-smoke', version: '0.1.0' } }
};
const HEADERS = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };

function withToken(token: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set('authorization', `Bearer ${token}`);
    return fetch(input, { ...init, headers });
  };
}

/** Lee el resultado JSON-RPC de una respuesta en JSON o en SSE (primer evento data:). */
async function rpcResult(res: Response): Promise<Record<string, unknown> | undefined> {
  const text = await res.text();
  const json = res.headers.get('content-type')?.includes('text/event-stream')
    ? text.split('\n').find(line => line.startsWith('data:'))?.slice(5)
    : text;
  if (!json) return undefined;
  return (JSON.parse(json) as { result?: Record<string, unknown> }).result;
}

/** Chequeos de humo contra un /mcp desplegado (spec B2 §4.7). Nunca lanza: cada chequeo reporta. */
export async function runSmoke(opts: { url: string; token: string; otherToken?: string }): Promise<SmokeResult[]> {
  const results: SmokeResult[] = [];
  const check = async (name: string, fn: () => Promise<string>): Promise<void> => {
    try { results.push({ name, ok: true, detail: await fn() }); }
    catch (err) { results.push({ name, ok: false, detail: err instanceof Error ? err.message : String(err) }); }
  };
  const fail = (msg: string): never => { throw new Error(msg); };

  await check('ping', async () => {
    const res = await fetch(new URL('/ping', opts.url));
    return res.status === 200 ? '200' : fail(`status ${res.status}`);
  });

  await check('sin token → 401', async () => {
    const res = await fetch(opts.url, { method: 'POST', headers: HEADERS, body: JSON.stringify(INIT) });
    await res.body?.cancel();
    return res.status === 401 ? '401' : fail(`status ${res.status}`);
  });

  await check('versión 2025-11-25', async () => {
    const res = await withToken(opts.token)(opts.url, { method: 'POST', headers: HEADERS, body: JSON.stringify(INIT) });
    if (res.status !== 200) fail(`status ${res.status}`);
    const version = (await rpcResult(res))?.protocolVersion;
    // Cerrar la sesión que abrió este initialize: cuenta contra el tope de sesiones del negocio.
    const sessionId = res.headers.get('mcp-session-id');
    if (sessionId) {
      const closed = await withToken(opts.token)(opts.url, { method: 'DELETE', headers: { ...HEADERS, 'mcp-session-id': sessionId } });
      await closed.body?.cancel();
    }
    return version === '2025-11-25' ? String(version) : fail(`negoció ${String(version)}`);
  });

  const transport = new StreamableHTTPClientTransport(new URL(opts.url), { fetch: withToken(opts.token) });
  const client = new Client({ name: 'counterpart-smoke', version: '0.1.0' });
  let connected = false;
  await check('nueve tools', async () => {
    await client.connect(transport);
    connected = true;
    const { tools } = await client.listTools();
    return tools.length === 9 ? tools.map(t => t.name).join(', ') : fail(`${tools.length} tools`);
  });

  await check('resumen hablable', async () => {
    if (!connected) fail('sin sesión');
    const { tools } = await client.listTools();
    const snapshot = tools.find(t => t.name.endsWith('_snapshot')) ?? fail('no hay tool de resumen');
    const result = await client.callTool({ name: snapshot.name, arguments: {} });
    const text = (result.content as Array<{ text?: string }>)[0]?.text ?? '';
    return text.length > 0 && !result.isError ? text : fail('respuesta vacía o con error');
  });

  if (opts.otherToken) {
    await check('sesión ajena → 404', async () => {
      const sessionId = transport.sessionId ?? fail('sin session id');
      const res = await withToken(opts.otherToken!)(opts.url, {
        method: 'POST',
        headers: { ...HEADERS, 'mcp-session-id': sessionId },
        body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
      });
      await res.body?.cancel();
      return res.status === 404 ? '404' : fail(`status ${res.status}`);
    });
  }

  // close() solo corta en local; terminateSession() manda el DELETE que libera el cupo en el servidor.
  if (connected) {
    await transport.terminateSession().catch(() => undefined);
    await client.close();
  }
  return results;
}
