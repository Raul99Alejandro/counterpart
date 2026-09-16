import { randomUUID } from 'node:crypto';
import { afterAll, describe } from 'vitest';
import { runStoreContract } from '../contract/store-contract.js';
import { DynamoStore, dynamoClient } from '../../src/store/dynamo.js';
import { dropTable, ensureTable } from '../../src/store/table.js';

const endpoint = process.env.DYNAMODB_ENDPOINT;

describe.skipIf(!endpoint)('DynamoStore contra DynamoDB Local', () => {
  const client = dynamoClient({ region: 'us-east-1', endpoint });
  const tables: string[] = [];

  afterAll(async () => {
    for (const table of tables) await dropTable(client, table);
  });

  runStoreContract('DynamoStore', async () => {
    const table = `counterpart-test-${randomUUID()}`;
    tables.push(table);
    await ensureTable(client, table);
    return new DynamoStore(client, table);
  });
});
