import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { openStore, storeConfig } from '../src/store/from-env.js';
import type { Store } from '../src/store/store.js';
import { clearBusinesses, ensureTable } from '../src/store/table.js';
import { issueToken, secretsManagerWriter } from '../infra/token.js';
import { addBusiness, newBlankBusiness } from './business.js';
import { checkPackage, loadPackage } from './package.js';

// Uso:
//   npm run business:check -- <carpeta>
//   npm run business:add -- <carpeta> [--secret] [--reset]
//   npm run business:new -- <bizId> "<nombre>" [--secret] [--reset]
const [command, ...args] = process.argv.slice(2);
const positional = args.filter(a => !a.startsWith('--'));

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

// Un error esperado (negocio repetido, paquete inválido) sale como una línea, sin stack.
try {
  switch (command) {
    case 'check': {
      const dir = positional[0] ?? fail('Uso: npm run business:check -- <carpeta>');
      const result = checkPackage(dir);
      if (!result.ok) fail(`El paquete tiene ${result.problems.length} problema(s):\n- ${result.problems.join('\n- ')}`);
      console.log(`Paquete "${result.pkg.id}" válido: ${result.pkg.items.length} ítems, perfil ${result.pkg.profileSource}, ${result.pkg.demo.customers.length} clientes de demo.`);
      break;
    }
    case 'add': {
      const dir = positional[0] ?? fail('Uso: npm run business:add -- <carpeta> [--secret] [--reset]');
      const pkg = loadPackage(dir);
      const { store, client, local, table, region } = openDynamo();
      if (local) await ensureTable(client, table);
      if (args.includes('--reset')) {
        requireRemoteReset(local, pkg.id);
        await clearBusinesses(client, table, [pkg.id]);
      }
      await addBusiness(store, pkg, new Date());
      console.error(`Negocio "${pkg.id}" sembrado desde ${dir}.`);
      // Con --reset los tokens ya emitidos siguen valiendo: la tabla no los borra.
      if (!args.includes('--reset')) await emitToken(store, pkg.id, args.includes('--secret'), region);
      break;
    }
    case 'new': {
      const [bizId, name] = positional;
      if (!bizId || !name) fail('Uso: npm run business:new -- <bizId> "<nombre>" [--secret] [--reset]');
      const { store, client, local, table, region } = openDynamo();
      if (local) await ensureTable(client, table);
      const reset = args.includes('--reset');
      if (reset) {
        requireRemoteReset(local, bizId);
        await clearBusinesses(client, table, [bizId]);
      }
      await newBlankBusiness(store, { id: bizId, name });
      console.error(`Negocio en blanco "${bizId}" (${name}) creado. Solo expone las tools de alta.`);
      if (!reset) await emitToken(store, bizId, args.includes('--secret'), region);
      break;
    }
    default:
      fail('Subcomandos: check, add, new');
  }
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
}

function openDynamo() {
  const cfg = storeConfig(process.env);
  if (cfg.kind !== 'dynamo') fail('Esta CLI escribe en la tabla: usa COUNTERPART_STORE=dynamo (con DYNAMODB_ENDPOINT para DynamoDB Local).');
  const { store, client } = openStore(cfg);
  return { store, client: client!, local: cfg.endpoint !== undefined, table: cfg.table, region: cfg.region };
}

function requireRemoteReset(local: boolean, bizId: string): void {
  if (!local && process.env.COUNTERPART_ALLOW_REMOTE_RESET !== '1') {
    fail(`Sin DYNAMODB_ENDPOINT esto apunta a AWS. Para borrar y volver a crear "${bizId}" en la tabla remota define COUNTERPART_ALLOW_REMOTE_RESET=1.`);
  }
}

async function emitToken(store: Store, bizId: string, toSecret: boolean, region: string): Promise<void> {
  const putSecret = toSecret ? secretsManagerWriter(new SecretsManagerClient({ region })) : undefined;
  const { token, secretName } = await issueToken({ store, putSecret }, bizId);
  if (secretName) {
    console.error(`Token emitido y guardado en el secreto "${secretName}". En la tabla solo queda su hash.`);
  } else {
    console.log(token);
    console.error('Token emitido. Guárdalo ahora: en la tabla solo queda su hash.');
  }
}
