import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

// Spike S1: abre una sesión y el stream SSE de GET /mcp, y mide cuánto vive sin tráfico.
// Uso: npx tsx infra/sse-probe.ts <url del /mcp> <nombre del secreto> [segundos, 90 por defecto]
const [url, secretName, maxArg] = process.argv.slice(2);
if (!url || !secretName) { console.error('Uso: npx tsx infra/sse-probe.ts <url> <secreto> [segundos]'); process.exit(1); }
const maxSeconds = Number(maxArg ?? 90);

const secrets = new SecretsManagerClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
const token = (await secrets.send(new GetSecretValueCommand({ SecretId: secretName }))).SecretString!;
const base = { authorization: `Bearer ${token}`, accept: 'application/json, text/event-stream', 'content-type': 'application/json' };

const init = await fetch(url, {
  method: 'POST', headers: base,
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'sse-probe', version: '0' } } })
});
const sessionId = init.headers.get('mcp-session-id');
await init.text();
if (!sessionId) { console.error(`initialize sin session id (status ${init.status})`); process.exit(1); }
await fetch(url, {
  method: 'POST', headers: { ...base, 'mcp-session-id': sessionId },
  body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })
});

const started = Date.now();
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), maxSeconds * 1000);
try {
  const stream = await fetch(url, { headers: { ...base, 'mcp-session-id': sessionId }, signal: controller.signal });
  console.log(`GET /mcp → ${stream.status} ${stream.headers.get('content-type') ?? ''}`);
  const reader = stream.body!.getReader();
  while (!(await reader.read()).done) { /* los keep-alive, si los hay, llegan aquí */ }
  console.log(`el stream se cerró a los ${Math.round((Date.now() - started) / 1000)} s`);
} catch {
  console.log(`el stream siguió vivo ${maxSeconds} s (se cortó a propósito)`);
} finally {
  clearTimeout(timer);
}
