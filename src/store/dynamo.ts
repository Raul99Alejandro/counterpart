import {
  ConditionalCheckFailedException, DynamoDBClient, TransactionCanceledException
} from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, TransactWriteCommand, UpdateCommand,
  type QueryCommandInput
} from '@aws-sdk/lib-dynamodb';
import type { Asset, Business, CatalogItem, Customer, Order, Payment, PurchaseOrder } from '../domain/types.js';
import { ConflictError, type Activation, type Draft, type ProfileRecord, type Store } from './store.js';

type Row = Record<string, unknown>;

/** Partición de un negocio. `table.ts` la usa para borrar negocios completos. */
export const bizKey = (bizId: string): string => `BIZ#${bizId}`;
const TRANSACTION_LIMIT = 100;

/** Cliente de DynamoDB. Con `endpoint` apunta a DynamoDB Local y usa credenciales de mentira. */
export function dynamoClient(opts: { region: string; endpoint?: string }): DynamoDBClient {
  return new DynamoDBClient({
    region: opts.region,
    ...(opts.endpoint
      ? { endpoint: opts.endpoint, credentials: { accessKeyId: 'local', secretAccessKey: 'local' } }
      : {})
  });
}

/** Quita las llaves de la tabla para devolver la entidad tal como la usa el dominio. */
function strip<T>(row: Row): T {
  const { pk: _pk, sk: _sk, ...entity } = row;
  return entity as T;
}

function isConditionFailure(err: unknown): boolean {
  if (err instanceof ConditionalCheckFailedException) return true;
  if (err instanceof TransactionCanceledException) {
    return (err.CancellationReasons ?? []).some(r => r.Code === 'ConditionalCheckFailed');
  }
  return false;
}

export class DynamoStore implements Store {
  private readonly doc: DynamoDBDocumentClient;

  constructor(client: DynamoDBClient, private readonly table: string) {
    this.doc = DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } });
  }

  /** Put con la regla de versiones del contrato: crear siempre, actualizar solo si la versión coincide. */
  private versionedPut(pk: string, sk: string, entity: { version: number }) {
    return {
      TableName: this.table,
      Item: { ...entity, pk, sk, version: entity.version + 1 },
      ConditionExpression: 'attribute_not_exists(pk) OR #version = :expected',
      ExpressionAttributeNames: { '#version': 'version' },
      ExpressionAttributeValues: { ':expected': entity.version }
    };
  }

  private async guarded(what: string, run: () => Promise<unknown>): Promise<void> {
    try {
      await run();
    } catch (err) {
      if (isConditionFailure(err)) throw new ConflictError(what);
      throw err;
    }
  }

  private async get<T>(pk: string, sk: string): Promise<T | null> {
    const out = await this.doc.send(new GetCommand({ TableName: this.table, Key: { pk, sk }, ConsistentRead: true }));
    return out.Item ? strip<T>(out.Item) : null;
  }

  private async queryAll<T>(input: Omit<QueryCommandInput, 'TableName' | 'ExclusiveStartKey'>): Promise<T[]> {
    const rows: T[] = [];
    let start: Record<string, unknown> | undefined;
    do {
      const out = await this.doc.send(new QueryCommand({
        ...input, TableName: this.table, ConsistentRead: true, ExclusiveStartKey: start
      }));
      for (const item of out.Items ?? []) rows.push(strip<T>(item));
      start = out.LastEvaluatedKey;
    } while (start);
    return rows;
  }

  private byPrefix<T>(bizId: string, prefix: string): Promise<T[]> {
    return this.queryAll<T>({
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
      ExpressionAttributeValues: { ':pk': bizKey(bizId), ':prefix': prefix }
    });
  }

  private async put(pk: string, sk: string, entity: object): Promise<void> {
    await this.doc.send(new PutCommand({ TableName: this.table, Item: { ...entity, pk, sk } }));
  }

  async putBusiness(b: Business): Promise<void> {
    await this.guarded('business', () => this.doc.send(new PutCommand(this.versionedPut(bizKey(b.id), 'META', b))));
  }

  getBusiness(bizId: string): Promise<Business | null> {
    return this.get<Business>(bizKey(bizId), 'META');
  }

  async putToken(tokenHash: string, bizId: string): Promise<void> {
    await this.put(`TOKEN#${tokenHash}`, 'TOKEN', { businessId: bizId });
  }

  async getBusinessByTokenHash(tokenHash: string): Promise<Business | null> {
    const token = await this.get<{ businessId: string }>(`TOKEN#${tokenHash}`, 'TOKEN');
    return token ? this.getBusiness(token.businessId) : null;
  }

  async takeOrderNumber(bizId: string): Promise<number> {
    try {
      const out = await this.doc.send(new UpdateCommand({
        TableName: this.table,
        Key: { pk: bizKey(bizId), sk: 'META' },
        UpdateExpression: 'SET nextOrderNumber = nextOrderNumber + :one, #version = #version + :one',
        ConditionExpression: 'attribute_exists(pk)',
        ExpressionAttributeNames: { '#version': 'version' },
        ExpressionAttributeValues: { ':one': 1 },
        ReturnValues: 'UPDATED_OLD'
      }));
      return out.Attributes!.nextOrderNumber as number;
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) throw new Error(`negocio desconocido: ${bizId}`);
      throw err;
    }
  }

  listCustomers(bizId: string): Promise<Customer[]> { return this.byPrefix<Customer>(bizId, 'CUST#'); }
  putCustomer(bizId: string, c: Customer): Promise<void> { return this.put(bizKey(bizId), `CUST#${c.id}`, c); }
  listAssets(bizId: string): Promise<Asset[]> { return this.byPrefix<Asset>(bizId, 'ASSET#'); }
  putAsset(bizId: string, a: Asset): Promise<void> { return this.put(bizKey(bizId), `ASSET#${a.id}`, a); }
  listOrders(bizId: string): Promise<Order[]> { return this.byPrefix<Order>(bizId, 'ORD#'); }
  getOrder(bizId: string, orderId: string): Promise<Order | null> { return this.get<Order>(bizKey(bizId), `ORD#${orderId}`); }
  listItems(bizId: string): Promise<CatalogItem[]> { return this.byPrefix<CatalogItem>(bizId, 'ITEM#'); }

  async putOrder(bizId: string, o: Order): Promise<void> {
    await this.guarded(`order ${o.id}`, () =>
      this.doc.send(new PutCommand(this.versionedPut(bizKey(bizId), `ORD#${o.id}`, o))));
  }

  async putItems(bizId: string, items: CatalogItem[]): Promise<void> {
    if (items.length === 0) return;
    if (items.length > TRANSACTION_LIMIT) throw new Error(`putItems admite hasta ${TRANSACTION_LIMIT} ítems por llamada`);
    await this.guarded('items', () => this.doc.send(new TransactWriteCommand({
      TransactItems: items.map(i => ({ Put: this.versionedPut(bizKey(bizId), `ITEM#${i.id}`, i) }))
    })));
  }

  async commitOrderWithItems(bizId: string, order: Order, items: CatalogItem[]): Promise<void> {
    if (items.length + 1 > TRANSACTION_LIMIT) throw new Error('demasiados ítems para una sola transacción');
    // Una transacción: DynamoDB valida todas las condiciones antes de escribir cualquier registro.
    await this.guarded(`order ${order.id}`, () => this.doc.send(new TransactWriteCommand({
      TransactItems: [
        ...items.map(i => ({ Put: this.versionedPut(bizKey(bizId), `ITEM#${i.id}`, i) })),
        { Put: this.versionedPut(bizKey(bizId), `ORD#${order.id}`, order) }
      ]
    })));
  }

  async commitClose(bizId: string, order: Order, payment: Payment): Promise<void> {
    await this.guarded(`order ${order.id}`, () => this.doc.send(new TransactWriteCommand({
      TransactItems: [
        { Put: this.versionedPut(bizKey(bizId), `ORD#${order.id}`, order) },
        {
          Put: {
            TableName: this.table,
            Item: { ...payment, pk: bizKey(bizId), sk: `PAY#${payment.paidOn}#${payment.id}` }
          }
        }
      ]
    })));
  }

  listPayments(bizId: string, from: string, to: string): Promise<Payment[]> {
    // '~' ordena después de '#' y de los dígitos: cubre todos los cobros del último día.
    return this.queryAll<Payment>({
      KeyConditionExpression: 'pk = :pk AND sk BETWEEN :from AND :to',
      ExpressionAttributeValues: { ':pk': bizKey(bizId), ':from': `PAY#${from}`, ':to': `PAY#${to}~` }
    });
  }

  async listOpenPurchaseOrders(bizId: string): Promise<PurchaseOrder[]> {
    return (await this.byPrefix<PurchaseOrder>(bizId, 'PO#')).filter(po => po.status === 'open');
  }

  async putPurchaseOrders(bizId: string, pos: PurchaseOrder[]): Promise<void> {
    for (const po of pos) await this.put(bizKey(bizId), `PO#${po.id}`, po);
  }

  getProfile(bizId: string): Promise<ProfileRecord | null> {
    return this.get<ProfileRecord>(bizKey(bizId), 'PROFILE');
  }

  putProfile(bizId: string, record: ProfileRecord): Promise<void> {
    return this.put(bizKey(bizId), 'PROFILE', record);
  }

  getDraft(bizId: string): Promise<Draft | null> {
    return this.get<Draft>(bizKey(bizId), 'DRAFT');
  }

  putDraft(bizId: string, draft: Draft): Promise<void> {
    return this.put(bizKey(bizId), 'DRAFT', draft);
  }

  async deleteDraft(bizId: string): Promise<void> {
    await this.doc.send(new DeleteCommand({ TableName: this.table, Key: { pk: bizKey(bizId), sk: 'DRAFT' } }));
  }

  async activateBusiness(bizId: string, a: Activation): Promise<void> {
    // META, PROFILE y DRAFT más los ítems: una transacción admite hasta 100 operaciones.
    if (a.items.length + 3 > TRANSACTION_LIMIT) {
      throw new Error(`activateBusiness admite hasta ${TRANSACTION_LIMIT - 3} ítems`);
    }
    const pk = bizKey(bizId);
    await this.guarded('business', () => this.doc.send(new TransactWriteCommand({
      TransactItems: [
        { Put: this.versionedPut(pk, 'META', a.business) },
        { Put: { TableName: this.table, Item: { ...a.profile, pk, sk: 'PROFILE' } } },
        ...a.items.map(i => ({ Put: this.versionedPut(pk, `ITEM#${i.id}`, i) })),
        { Delete: { TableName: this.table, Key: { pk, sk: 'DRAFT' } } }
      ]
    })));
  }
}
