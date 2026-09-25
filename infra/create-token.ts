import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { openStore, storeConfig } from '../src/store/from-env.js';
import { issueToken, secretsManagerWriter } from './token.js';

// Uso: npm run token -- <businessId> [--secret]   (con COUNTERPART_STORE=dynamo)
// Sin --secret imprime el token en stdout. Con --secret lo guarda en Secrets Manager y no lo imprime.
const args = process.argv.slice(2);
const bizId = args.find(a => !a.startsWith('--'));
const toSecret = args.includes('--secret');
if (!bizId) {
  console.error('Uso: npm run token -- <businessId> [--secret]');
  process.exit(1);
}

const cfg = storeConfig(process.env);
if (cfg.kind !== 'dynamo') {
  console.error('Un token solo sirve si queda guardado: usa COUNTERPART_STORE=dynamo.');
  process.exit(1);
}

const { store } = openStore(cfg);
const putSecret = toSecret ? secretsManagerWriter(new SecretsManagerClient({ region: cfg.region })) : undefined;

try {
  const { token, secretName } = await issueToken({ store, putSecret }, bizId);
  if (secretName) {
    console.error(`Token emitido para "${bizId}" y guardado en el secreto "${secretName}". En la tabla solo queda su hash.`);
  } else {
    // El token va solo a stdout, para poder redirigirlo; el aviso va a stderr.
    console.log(token);
    console.error(`Token emitido para "${bizId}". Guárdalo ahora: en la tabla solo queda su hash.`);
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
