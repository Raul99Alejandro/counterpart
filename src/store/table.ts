import {
  BatchWriteItemCommand, CreateTableCommand, DeleteTableCommand, DynamoDBClient, QueryCommand,
  ResourceInUseException, ResourceNotFoundException, waitUntilTableExists, waitUntilTableNotExists,
  type AttributeValue, type WriteRequest
} from '@aws-sdk/client-dynamodb';
import { bizKey } from './dynamo.js';

/** BatchWriteItem accepts up to 25 operations per call. */
const BATCH_SIZE = 25;
const MAX_ATTEMPTS = 8;
const FIRST_RETRY_MS = 50;

/** Creates the single table if it does not exist and waits until it is active. */
export async function ensureTable(client: DynamoDBClient, table: string): Promise<void> {
  try {
    await client.send(new CreateTableCommand({
      TableName: table,
      BillingMode: 'PAY_PER_REQUEST',
      AttributeDefinitions: [
        { AttributeName: 'pk', AttributeType: 'S' },
        { AttributeName: 'sk', AttributeType: 'S' }
      ],
      KeySchema: [
        { AttributeName: 'pk', KeyType: 'HASH' },
        { AttributeName: 'sk', KeyType: 'RANGE' }
      ]
    }));
  } catch (err) {
    if (!(err instanceof ResourceInUseException)) throw err;
  }
  await waitUntilTableExists({ client, maxWaitTime: 60 }, { TableName: table });
}

/** Deletes the table and waits until it is gone: on AWS deletion is asynchronous and recreating it earlier fails. */
export async function dropTable(client: DynamoDBClient, table: string): Promise<void> {
  try {
    await client.send(new DeleteTableCommand({ TableName: table }));
  } catch (err) {
    if (!(err instanceof ResourceNotFoundException)) throw err;
  }
  await waitUntilTableNotExists({ client, maxWaitTime: 60 }, { TableName: table });
}

/**
 * Deletes every record of the given businesses (their `BIZ#<id>` partition, metadata included).
 * The table and the tokens (`TOKEN#…`) stay, so a reset on AWS does not invalidate issued tokens.
 */
export async function clearBusinesses(client: DynamoDBClient, table: string, businessIds: string[]): Promise<void> {
  for (const businessId of businessIds) {
    const keys = await partitionKeys(client, table, bizKey(businessId));
    for (let i = 0; i < keys.length; i += BATCH_SIZE) {
      await deleteBatch(client, table, keys.slice(i, i + BATCH_SIZE));
    }
  }
}

/** Keys (`pk`, `sk`) of a whole partition, page by page. */
async function partitionKeys(
  client: DynamoDBClient, table: string, pk: string
): Promise<Array<Record<string, AttributeValue>>> {
  const keys: Array<Record<string, AttributeValue>> = [];
  let start: Record<string, AttributeValue> | undefined;
  do {
    const out = await client.send(new QueryCommand({
      TableName: table,
      KeyConditionExpression: '#pk = :pk',
      ProjectionExpression: '#pk, #sk',
      ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
      ExpressionAttributeValues: { ':pk': { S: pk } },
      ConsistentRead: true,
      ExclusiveStartKey: start
    }));
    for (const item of out.Items ?? []) keys.push({ pk: item.pk!, sk: item.sk! });
    start = out.LastEvaluatedKey;
  } while (start);
  return keys;
}

/** One batch of deletes. Whatever DynamoDB does not process is retried with growing backoff, up to a cap. */
async function deleteBatch(
  client: DynamoDBClient, table: string, keys: Array<Record<string, AttributeValue>>
): Promise<void> {
  let pending: WriteRequest[] = keys.map(Key => ({ DeleteRequest: { Key } }));
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) await sleep(FIRST_RETRY_MS * 2 ** (attempt - 2));
    const out = await client.send(new BatchWriteItemCommand({ RequestItems: { [table]: pending } }));
    pending = out.UnprocessedItems?.[table] ?? [];
    if (pending.length === 0) return;
  }
  throw new Error(
    `${pending.length} deletes were left unprocessed in table "${table}" after ${MAX_ATTEMPTS} attempts; `
    + 'the reset is incomplete, run it again'
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
