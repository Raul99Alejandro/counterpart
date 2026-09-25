import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { runSmoke } from './smoke-checks.js';

// Uso:
//   npm run smoke -- <url del /mcp> --secret counterpart/shop/token [--other-secret counterpart/bakery/token]
//   SMOKE_TOKEN=... [SMOKE_OTHER_TOKEN=...] npm run smoke -- <url del /mcp>     (local)
// Los tokens nunca van como argumento: se verían en la lista de procesos y en el historial.
const args = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const flagValues = new Set([flag('--secret'), flag('--other-secret')]);
const url = args.find(a => !a.startsWith('--') && !flagValues.has(a));
if (!url) {
  console.error('Uso: npm run smoke -- <url del /mcp> [--secret <nombre>] [--other-secret <nombre>]');
  process.exit(1);
}

const secrets = new SecretsManagerClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
const read = async (name: string | undefined, fallback: string | undefined): Promise<string | undefined> => {
  if (!name) return fallback;
  const out = await secrets.send(new GetSecretValueCommand({ SecretId: name }));
  return out.SecretString;
};

const token = await read(flag('--secret'), process.env.SMOKE_TOKEN);
const otherToken = await read(flag('--other-secret'), process.env.SMOKE_OTHER_TOKEN);
if (!token) {
  console.error('Falta el token: --secret <nombre> o SMOKE_TOKEN.');
  process.exit(1);
}

const results = await runSmoke({ url, token, otherToken });
for (const r of results) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name}: ${r.detail}`);
process.exit(results.every(r => r.ok) ? 0 : 1);
