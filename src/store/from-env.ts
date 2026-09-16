import type { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoStore, dynamoClient } from './dynamo.js';
import { MemoryStore } from './memory.js';
import type { Store } from './store.js';

export interface StoreConfig { kind: 'memory' | 'dynamo'; table: string; region: string; endpoint?: string }

export function storeConfig(env: NodeJS.ProcessEnv): StoreConfig {
  const kind = env.COUNTERPART_STORE || 'memory';
  if (kind !== 'memory' && kind !== 'dynamo') {
    throw new Error(`COUNTERPART_STORE debe ser "memory" o "dynamo", no "${kind}"`);
  }
  // Fallar cerrado: en memoria se siembran los tokens de demo, que son públicos en el repo.
  if (kind === 'memory' && env.NODE_ENV === 'production') {
    throw new Error('En producción (NODE_ENV=production) el store en memoria no se permite: usa COUNTERPART_STORE=dynamo');
  }
  return {
    kind,
    table: env.DYNAMODB_TABLE || 'counterpart',
    region: env.AWS_REGION || 'us-east-1',
    endpoint: env.DYNAMODB_ENDPOINT || undefined
  };
}

/** Abre el store configurado. Con DynamoDB devuelve también el cliente, para operar sobre la tabla. */
export function openStore(cfg: StoreConfig): { store: Store; client?: DynamoDBClient } {
  if (cfg.kind === 'memory') return { store: new MemoryStore() };
  const client = dynamoClient({ region: cfg.region, endpoint: cfg.endpoint });
  return { store: new DynamoStore(client, cfg.table), client };
}
