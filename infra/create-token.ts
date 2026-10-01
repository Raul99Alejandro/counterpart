import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { openStore, storeConfig } from '../src/store/from-env.js';
import { issueToken, secretsManagerWriter } from './token.js';

// Usage: npm run token -- <businessId> [--secret]   (with COUNTERPART_STORE=dynamo)
// Without --secret it prints the token to stdout. With --secret it saves it in Secrets Manager and does not print it.
const args = process.argv.slice(2);
const bizId = args.find(a => !a.startsWith('--'));
const toSecret = args.includes('--secret');
if (!bizId) {
  console.error('Usage: npm run token -- <businessId> [--secret]');
  process.exit(1);
}

const cfg = storeConfig(process.env);
if (cfg.kind !== 'dynamo') {
  console.error('A token is only useful if it is stored: use COUNTERPART_STORE=dynamo.');
  process.exit(1);
}

const { store } = openStore(cfg);
const putSecret = toSecret ? secretsManagerWriter(new SecretsManagerClient({ region: cfg.region })) : undefined;

try {
  const { token, secretName } = await issueToken({ store, putSecret }, bizId);
  if (secretName) {
    console.error(`Token issued for "${bizId}" and saved in the secret "${secretName}". The table only keeps its hash.`);
  } else {
    // Only the token goes to stdout, so it can be redirected; the notice goes to stderr.
    console.log(token);
    console.error(`Token issued for "${bizId}". Save it now: the table only keeps its hash.`);
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
