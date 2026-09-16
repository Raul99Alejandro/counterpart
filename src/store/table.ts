import {
  CreateTableCommand, DeleteTableCommand, DynamoDBClient,
  ResourceInUseException, ResourceNotFoundException, waitUntilTableExists
} from '@aws-sdk/client-dynamodb';

/** Crea la tabla única si no existe y espera a que esté activa. */
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

export async function dropTable(client: DynamoDBClient, table: string): Promise<void> {
  try {
    await client.send(new DeleteTableCommand({ TableName: table }));
  } catch (err) {
    if (!(err instanceof ResourceNotFoundException)) throw err;
  }
}
