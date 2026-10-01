import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

// Spike S1: opens a session and the SSE stream of GET /mcp, and measures how long it lives without traffic.
// Usage: npx tsx infra/sse-probe.ts <url of /mcp> <secret name> [seconds, default 90]
const [url, secretName, maxArg] = process.argv.slice(2);
if (!url || !secretName) { console.error('Usage: npx tsx infra/sse-probe.ts <url> <secret> [seconds]'); process.exit(1); }
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
if (!sessionId) { console.error(`initialize returned no session id (status ${init.status})`); process.exit(1); }
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
  while (!(await reader.read()).done) { /* keep-alives, if any, arrive here */ }
  console.log(`the stream closed after ${Math.round((Date.now() - started) / 1000)} s`);
} catch {
  console.log(`the stream stayed alive ${maxSeconds} s (cut on purpose)`);
} finally {
  clearTimeout(timer);
}
