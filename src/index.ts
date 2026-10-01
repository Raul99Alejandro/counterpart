import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { createApp } from './http/app.js';
import { hostPolicy } from './http/hosts.js';
import type { Sessions } from './http/sessions.js';
import { log } from './log.js';
import { openStore, storeConfig } from './store/from-env.js';
import { ensureTable } from './store/table.js';
import { bedrockConverse, novaDraftGenerator } from './setup/generate.js';
import { seedAll, seedLocalBlank } from '../seed/run.js';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';
const devBusinessId = process.env.COUNTERPART_DEV_BUSINESS;

const cfg = storeConfig(process.env);
const { store, client } = openStore(cfg);

if (cfg.kind === 'memory') {
  // Nothing persists in memory: the demo is seeded on every start.
  await seedAll(store);
  await seedLocalBlank(store);
} else if (cfg.endpoint && client) {
  // Against DynamoDB Local the table may not exist yet. On AWS the infrastructure creates it.
  await ensureTable(client, cfg.table);
}

const hosts = hostPolicy(process.env);
// The setup assistant is the only part of the server that calls a model (spec B2 §3).
const setupModel = process.env.COUNTERPART_SETUP_MODEL_ID ?? 'us.amazon.nova-2-lite-v1:0';
const generate = novaDraftGenerator(bedrockConverse(new BedrockRuntimeClient({ region: cfg.region }), setupModel));
const app = createApp({ store, host, devBusinessId, hosts, generate });
const httpServer = app.listen(port, host, () => {
  log({ level: 'info', msg: 'listening', port, host, store: cfg.kind, hosts: hosts.kind });
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    (app.locals.sessions as Sessions).closeAll();
    httpServer.close(() => process.exit(0));
  });
}
