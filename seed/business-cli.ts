import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { openStore, storeConfig } from '../src/store/from-env.js';
import type { Store } from '../src/store/store.js';
import { clearBusinesses, ensureTable } from '../src/store/table.js';
import { issueToken, secretsManagerWriter } from '../infra/token.js';
import { addBusiness, newBlankBusiness } from './business.js';
import { checkPackage, loadPackage } from './package.js';

// Usage:
//   npm run business:check -- <folder>
//   npm run business:add -- <folder> [--secret] [--reset]
//   npm run business:new -- <bizId> "<name>" [--secret] [--reset]
const [command, ...args] = process.argv.slice(2);
const positional = args.filter(a => !a.startsWith('--'));

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

// An expected error (duplicate business, invalid package) prints as one line, without a stack.
try {
  switch (command) {
    case 'check': {
      const dir = positional[0] ?? fail('Usage: npm run business:check -- <folder>');
      const result = checkPackage(dir);
      if (!result.ok) fail(`The package has ${result.problems.length} problem(s):\n- ${result.problems.join('\n- ')}`);
      console.log(`Package "${result.pkg.id}" is valid: ${result.pkg.items.length} items, profile ${result.pkg.profileSource}, ${result.pkg.demo.customers.length} demo customers.`);
      break;
    }
    case 'add': {
      const dir = positional[0] ?? fail('Usage: npm run business:add -- <folder> [--secret] [--reset]');
      const pkg = loadPackage(dir);
      const { store, client, local, table, region } = openDynamo();
      if (local) await ensureTable(client, table);
      if (args.includes('--reset')) {
        requireRemoteReset(local, pkg.id);
        await clearBusinesses(client, table, [pkg.id]);
      }
      await addBusiness(store, pkg, new Date());
      console.error(`Business "${pkg.id}" seeded from ${dir}.`);
      // With --reset, tokens already issued stay valid: the table does not delete them.
      if (!args.includes('--reset')) await emitToken(store, pkg.id, args.includes('--secret'), region);
      break;
    }
    case 'new': {
      const [bizId, name] = positional;
      if (!bizId || !name) fail('Usage: npm run business:new -- <bizId> "<name>" [--secret] [--reset]');
      const { store, client, local, table, region } = openDynamo();
      if (local) await ensureTable(client, table);
      const reset = args.includes('--reset');
      if (reset) {
        requireRemoteReset(local, bizId);
        await clearBusinesses(client, table, [bizId]);
      }
      await newBlankBusiness(store, { id: bizId, name });
      console.error(`Blank business "${bizId}" (${name}) created. It only exposes the setup tools.`);
      if (!reset) await emitToken(store, bizId, args.includes('--secret'), region);
      break;
    }
    default:
      fail('Subcommands: check, add, new');
  }
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
}

function openDynamo() {
  const cfg = storeConfig(process.env);
  if (cfg.kind !== 'dynamo') fail('This CLI writes to the table: use COUNTERPART_STORE=dynamo (with DYNAMODB_ENDPOINT for DynamoDB Local).');
  const { store, client } = openStore(cfg);
  return { store, client: client!, local: cfg.endpoint !== undefined, table: cfg.table, region: cfg.region };
}

function requireRemoteReset(local: boolean, bizId: string): void {
  if (!local && process.env.COUNTERPART_ALLOW_REMOTE_RESET !== '1') {
    fail(`Without DYNAMODB_ENDPOINT this points to AWS. To delete and recreate "${bizId}" in the remote table, set COUNTERPART_ALLOW_REMOTE_RESET=1.`);
  }
}

async function emitToken(store: Store, bizId: string, toSecret: boolean, region: string): Promise<void> {
  const putSecret = toSecret ? secretsManagerWriter(new SecretsManagerClient({ region })) : undefined;
  const { token, secretName } = await issueToken({ store, putSecret }, bizId);
  if (secretName) {
    console.error(`Token issued and saved in the secret "${secretName}". The table only keeps its hash.`);
  } else {
    console.log(token);
    console.error('Token issued. Save it now: the table only keeps its hash.');
  }
}
