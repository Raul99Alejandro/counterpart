import { openStore, storeConfig } from '../src/store/from-env.js';
import { dropTable, ensureTable } from '../src/store/table.js';
import { DEMO_TOKENS, seedAll } from './run.js';

// Uso: npm run seed -- --reset   (con COUNTERPART_STORE=dynamo)
const cfg = storeConfig(process.env);
const local = cfg.endpoint !== undefined;

if (cfg.kind !== 'dynamo') {
  console.error('Con el store en memoria la siembra ocurre al arrancar el servidor. Esta CLI es para COUNTERPART_STORE=dynamo.');
  process.exit(1);
}
if (!process.argv.includes('--reset')) {
  console.error(`Esta CLI borra y recrea la tabla "${cfg.table}". Repite con --reset para confirmarlo.`);
  process.exit(1);
}
if (!local && process.env.COUNTERPART_ALLOW_REMOTE_RESET !== '1') {
  console.error('Sin DYNAMODB_ENDPOINT esto apunta a AWS. Para borrar una tabla remota define COUNTERPART_ALLOW_REMOTE_RESET=1.');
  process.exit(1);
}

const { store, client } = openStore(cfg);
await dropTable(client!, cfg.table);
await ensureTable(client!, cfg.table);
// Los tokens de demo son públicos en el repo: solo se instalan en DynamoDB Local.
await seedAll(store, new Date(), { demoTokens: local });

console.log(`Tabla "${cfg.table}" sembrada con los negocios "shop" y "bakery".`);
if (local) console.log(`Tokens de demo: shop=${DEMO_TOKENS.shop} bakery=${DEMO_TOKENS.bakery}`);
else console.log('Sin tokens de demo. Emite uno por negocio con: npm run token -- <businessId>');
