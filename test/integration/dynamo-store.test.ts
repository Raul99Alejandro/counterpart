import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GetItemCommand, ResourceNotFoundException } from '@aws-sdk/client-dynamodb';
import { runStoreContract } from '../contract/store-contract.js';
import { DynamoStore, dynamoClient } from '../../src/store/dynamo.js';
import { clearBusinesses, dropTable, ensureTable } from '../../src/store/table.js';
import { hashToken } from '../../src/http/auth.js';
import type { Business, Order } from '../../src/domain/types.js';
import { DEMO_BUSINESS_IDS, seedAll } from '../../seed/run.js';

const endpoint = process.env.DYNAMODB_ENDPOINT;

describe.skipIf(!endpoint)('DynamoStore against DynamoDB Local', () => {
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

describe.skipIf(!endpoint)('clearBusinesses against DynamoDB Local', () => {
  const NOW = new Date('2026-09-15T15:00:00Z');
  const client = dynamoClient({ region: 'us-east-1', endpoint });
  const table = `counterpart-clear-${randomUUID()}`;

  const other: Business = {
    id: 'other', name: 'Corner Garage', status: 'active', profileVersion: 1,
    timezone: 'America/Chicago', taxRateBps: 825, nextOrderNumber: 1, version: 1
  };
  const otherOrder: Order = {
    id: 'other-ord-1', number: 1, customerId: 'other-cust-1', stage: 'in_bay', fields: {}, lines: [],
    subtotalCents: 0, taxCents: 0, totalCents: 0, stageHistory: [],
    createdAt: '2026-09-15T15:00:00.000Z', version: 1
  };
  const shopToken = hashToken('real-shop-token');

  beforeAll(async () => { await ensureTable(client, table); });
  afterAll(async () => { await dropTable(client, table); });

  // Seeds the full demo twice (hundreds of writes): more than the default 5 s.
  it('deletes only the demo businesses; the table, other businesses and the tokens remain', { timeout: 60_000 }, async () => {
    const store = new DynamoStore(client, table);
    await seedAll(store, NOW, { demoTokens: false });
    await store.putToken(shopToken, 'shop');
    await store.putBusiness(other);
    await store.putOrder('other', otherOrder);
    expect(DEMO_BUSINESS_IDS).toEqual(['shop', 'bakery']);
    expect((await store.listOrders('shop')).length).toBeGreaterThan(25);

    await clearBusinesses(client, table, ['shop', 'bakery']);

    for (const id of ['shop', 'bakery']) {
      expect(await store.getBusiness(id)).toBeNull();
      expect(await store.listOrders(id)).toEqual([]);
      expect(await store.listItems(id)).toEqual([]);
      expect(await store.listCustomers(id)).toEqual([]);
      expect(await store.listPayments(id, '2000-01-01', '2100-12-31')).toEqual([]);
    }
    expect((await store.getBusiness('other'))?.id).toBe('other');
    expect((await store.listOrders('other')).map(o => o.id)).toEqual(['other-ord-1']);

    // The token row is still there, pointing to shop, even though shop does not exist yet.
    const row = await client.send(new GetItemCommand({
      TableName: table, Key: { pk: { S: `TOKEN#${shopToken}` }, sk: { S: 'TOKEN' } }, ConsistentRead: true
    }));
    expect(row.Item?.businessId?.S).toBe('shop');

    // Reseeding without demo tokens works (the metadata was deleted, so there is no version conflict)
    // and the token issued earlier resolves to shop again.
    await seedAll(store, NOW, { demoTokens: false });
    expect((await store.getBusiness('shop'))?.name).toBe('Oak Street Auto');
    expect((await store.getBusinessByTokenHash(shopToken))?.id).toBe('shop');
    expect((await store.getBusiness('other'))?.id).toBe('other');
  });

  it('does not create the table: if it does not exist, the DynamoDB error comes through as is', async () => {
    await expect(clearBusinesses(client, `counterpart-missing-${randomUUID()}`, ['shop']))
      .rejects.toThrow(ResourceNotFoundException);
  });
});

describe.skipIf(!endpoint)('tokens in DynamoDB Local', () => {
  const client = dynamoClient({ region: 'us-east-1', endpoint });
  const table = `counterpart-token-${randomUUID()}`;

  beforeAll(async () => { await ensureTable(client, table); });
  afterAll(async () => { await dropTable(client, table); });

  it('stores when each token was issued', async () => {
    const store = new DynamoStore(client, table);
    await store.putToken('hash-date', 'b1', '2026-09-30T12:00:00.000Z');
    const out = await client.send(new GetItemCommand({ TableName: table, Key: { pk: { S: 'TOKEN#hash-date' }, sk: { S: 'TOKEN' } } }));
    expect(out.Item?.createdAt?.S).toBe('2026-09-30T12:00:00.000Z');
  });
});
