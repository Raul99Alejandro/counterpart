import { openStore, storeConfig } from '../src/store/from-env.js';
import { clearBusinesses, dropTable, ensureTable } from '../src/store/table.js';
import { DEMO_BUSINESS_IDS, DEMO_TOKENS, seedAll } from './run.js';

// Usage: npm run seed -- --reset   (with COUNTERPART_STORE=dynamo)
// With DYNAMODB_ENDPOINT (local) it drops and recreates the table. Against AWS the table belongs to the
// infrastructure: only the demo businesses are deleted and reseeded, and the tokens stay.
const cfg = storeConfig(process.env);
const local = cfg.endpoint !== undefined;
const demo = DEMO_BUSINESS_IDS.join(' and ');

if (cfg.kind !== 'dynamo') {
  console.error('With the in-memory store, seeding happens when the server starts. This CLI is for COUNTERPART_STORE=dynamo.');
  process.exit(1);
}
if (!process.argv.includes('--reset')) {
  console.error(local
    ? `This CLI drops and recreates the table "${cfg.table}". Run it again with --reset to confirm.`
    : `This CLI deletes and reseeds the businesses ${demo} in the table "${cfg.table}"; the table and the tokens stay. Run it again with --reset to confirm.`);
  process.exit(1);
}
if (!local && process.env.COUNTERPART_ALLOW_REMOTE_RESET !== '1') {
  console.error(`Without DYNAMODB_ENDPOINT this points to AWS. To delete and reseed the businesses ${demo} in the remote table "${cfg.table}", set COUNTERPART_ALLOW_REMOTE_RESET=1.`);
  process.exit(1);
}

const { store, client } = openStore(cfg);

if (local) {
  await dropTable(client!, cfg.table);
  await ensureTable(client!, cfg.table);
  // The demo tokens are public in the repo: they are only installed in DynamoDB Local.
  await seedAll(store, new Date(), { demoTokens: true });
  console.log(`Table "${cfg.table}" recreated and seeded with the businesses ${demo}.`);
  console.log(`Demo tokens: shop=${DEMO_TOKENS.shop} bakery=${DEMO_TOKENS.bakery}`);
} else {
  // No ensureTable or dropTable: if the table does not exist, the AWS error surfaces as is and the process fails.
  await clearBusinesses(client!, cfg.table, [...DEMO_BUSINESS_IDS]);
  await seedAll(store, new Date(), { demoTokens: false });
  console.log(`Businesses ${demo} deleted and reseeded in the table "${cfg.table}". The table and the tokens already issued stay.`);
  console.log('If a business has no token yet, issue one with: npm run token -- <businessId>');
}
