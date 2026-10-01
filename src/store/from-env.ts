import type { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoStore, dynamoClient } from './dynamo.js';
import { MemoryStore } from './memory.js';
import type { Store } from './store.js';

export interface StoreConfig { kind: 'memory' | 'dynamo'; table: string; region: string; endpoint?: string }

export function storeConfig(env: NodeJS.ProcessEnv): StoreConfig {
  const kind = env.COUNTERPART_STORE || 'memory';
  if (kind !== 'memory' && kind !== 'dynamo') {
    throw new Error(`COUNTERPART_STORE must be "memory" or "dynamo", not "${kind}"`);
  }
  // Fail closed: the in-memory store seeds the demo tokens, which are public in the repo.
  if (kind === 'memory' && env.NODE_ENV === 'production') {
    throw new Error('In production (NODE_ENV=production) the in-memory store is not allowed: use COUNTERPART_STORE=dynamo');
  }
  return {
    kind,
    table: env.DYNAMODB_TABLE || 'counterpart',
    region: env.AWS_REGION || 'us-east-1',
    endpoint: env.DYNAMODB_ENDPOINT || undefined
  };
}

/** Opens the configured store. With DynamoDB it also returns the client, to operate on the table. */
export function openStore(cfg: StoreConfig): { store: Store; client?: DynamoDBClient } {
  if (cfg.kind === 'memory') return { store: new MemoryStore() };
  const client = dynamoClient({ region: cfg.region, endpoint: cfg.endpoint });
  return { store: new DynamoStore(client, cfg.table), client };
}
