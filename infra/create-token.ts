import { randomBytes } from 'node:crypto';
import { hashToken } from '../src/http/auth.js';
import { openStore, storeConfig } from '../src/store/from-env.js';

// Uso: npm run token -- <businessId>   (con COUNTERPART_STORE=dynamo)
const bizId = process.argv[2];
if (!bizId) {
  console.error('Uso: npm run token -- <businessId>');
  process.exit(1);
}

const cfg = storeConfig(process.env);
if (cfg.kind !== 'dynamo') {
  console.error('Un token solo sirve si queda guardado: usa COUNTERPART_STORE=dynamo.');
  process.exit(1);
}

const { store } = openStore(cfg);
if (!(await store.getBusiness(bizId))) {
  console.error(`No existe el negocio "${bizId}" en la tabla "${cfg.table}".`);
  process.exit(1);
}

const token = randomBytes(32).toString('base64url');
await store.putToken(hashToken(token), bizId);
// El token va solo a stdout, para poder redirigirlo; el aviso va a stderr.
console.log(token);
console.error(`Token emitido para "${bizId}". Guárdalo ahora: en la tabla solo queda su hash.`);
