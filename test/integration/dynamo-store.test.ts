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

describe.skipIf(!endpoint)('clearBusinesses contra DynamoDB Local', () => {
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
  const shopToken = hashToken('token-real-de-shop');

  beforeAll(async () => { await ensureTable(client, table); });
  afterAll(async () => { await dropTable(client, table); });

  // Siembra dos veces el demo completo (cientos de escrituras): más que los 5 s por defecto.
  it('borra solo los negocios del demo; la tabla, los demás negocios y los tokens quedan', { timeout: 60_000 }, async () => {
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

    // La fila del token sigue ahí, apuntando a shop, aunque shop ya no exista todavía.
    const row = await client.send(new GetItemCommand({
      TableName: table, Key: { pk: { S: `TOKEN#${shopToken}` }, sk: { S: 'TOKEN' } }, ConsistentRead: true
    }));
    expect(row.Item?.businessId?.S).toBe('shop');

    // Resembrar sin tokens de demo funciona (los metadatos se borraron, no hay conflicto de versión)
    // y el token emitido antes vuelve a resolver a shop.
    await seedAll(store, NOW, { demoTokens: false });
    expect((await store.getBusiness('shop'))?.name).toBe('Oak Street Auto');
    expect((await store.getBusinessByTokenHash(shopToken))?.id).toBe('shop');
    expect((await store.getBusiness('other'))?.id).toBe('other');
  });

  it('no crea la tabla: si no existe, el error de DynamoDB sale tal cual', async () => {
    await expect(clearBusinesses(client, `counterpart-missing-${randomUUID()}`, ['shop']))
      .rejects.toThrow(ResourceNotFoundException);
  });
});
