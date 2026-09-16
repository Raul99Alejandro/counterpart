import { openStore, storeConfig } from '../src/store/from-env.js';
import { clearBusinesses, dropTable, ensureTable } from '../src/store/table.js';
import { DEMO_BUSINESS_IDS, DEMO_TOKENS, seedAll } from './run.js';

// Uso: npm run seed -- --reset   (con COUNTERPART_STORE=dynamo)
// Con DYNAMODB_ENDPOINT (local) borra y recrea la tabla. Contra AWS la tabla es de la
// infraestructura: solo se borran y vuelven a sembrar los negocios del demo, y los tokens quedan.
const cfg = storeConfig(process.env);
const local = cfg.endpoint !== undefined;
const demo = DEMO_BUSINESS_IDS.join(' y ');

if (cfg.kind !== 'dynamo') {
  console.error('Con el store en memoria la siembra ocurre al arrancar el servidor. Esta CLI es para COUNTERPART_STORE=dynamo.');
  process.exit(1);
}
if (!process.argv.includes('--reset')) {
  console.error(local
    ? `Esta CLI borra y recrea la tabla "${cfg.table}". Repite con --reset para confirmarlo.`
    : `Esta CLI borra y vuelve a sembrar los negocios ${demo} en la tabla "${cfg.table}"; la tabla y los tokens quedan. Repite con --reset para confirmarlo.`);
  process.exit(1);
}
if (!local && process.env.COUNTERPART_ALLOW_REMOTE_RESET !== '1') {
  console.error(`Sin DYNAMODB_ENDPOINT esto apunta a AWS. Para borrar y volver a sembrar los negocios ${demo} en la tabla remota "${cfg.table}" define COUNTERPART_ALLOW_REMOTE_RESET=1.`);
  process.exit(1);
}

const { store, client } = openStore(cfg);

if (local) {
  await dropTable(client!, cfg.table);
  await ensureTable(client!, cfg.table);
  // Los tokens de demo son públicos en el repo: solo se instalan en DynamoDB Local.
  await seedAll(store, new Date(), { demoTokens: true });
  console.log(`Tabla "${cfg.table}" recreada y sembrada con los negocios ${demo}.`);
  console.log(`Tokens de demo: shop=${DEMO_TOKENS.shop} bakery=${DEMO_TOKENS.bakery}`);
} else {
  // Sin ensureTable ni dropTable: si la tabla no existe, el error de AWS sale tal cual y el proceso falla.
  await clearBusinesses(client!, cfg.table, [...DEMO_BUSINESS_IDS]);
  await seedAll(store, new Date(), { demoTokens: false });
  console.log(`Negocios ${demo} borrados y vueltos a sembrar en la tabla "${cfg.table}". La tabla y los tokens ya emitidos quedan.`);
  console.log('Si un negocio todavía no tiene token, emítelo con: npm run token -- <businessId>');
}
