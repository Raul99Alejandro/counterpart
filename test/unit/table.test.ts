import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BatchWriteItemCommand, QueryCommand, type DynamoDBClient, type WriteRequest
} from '@aws-sdk/client-dynamodb';
import { clearBusinesses } from '../../src/store/table.js';

const key = (sk: string) => ({ pk: { S: 'BIZ#shop' }, sk: { S: sk } });

/** Client double: one page of keys per Query and BatchWriteItem replies in order. */
function fakeClient(keys: Array<ReturnType<typeof key>>, batchReplies: Array<WriteRequest[]>) {
  const batches: WriteRequest[][] = [];
  const send = vi.fn(async (command: unknown) => {
    if (command instanceof QueryCommand) return { Items: keys };
    if (command instanceof BatchWriteItemCommand) {
      const requests = command.input.RequestItems!.t!;
      batches.push(requests);
      const unprocessed = batchReplies.shift() ?? [];
      return { UnprocessedItems: unprocessed.length > 0 ? { t: unprocessed } : {} };
    }
    throw new Error('unexpected command');
  });
  return { client: { send } as unknown as DynamoDBClient, batches };
}

afterEach(() => { vi.useRealTimers(); });

describe('clearBusinesses', () => {
  it('deletes in batches of 25 and retries what DynamoDB did not process', async () => {
    vi.useFakeTimers();
    const keys = Array.from({ length: 30 }, (_, i) => key(`ORD#${i}`));
    const leftover: WriteRequest[] = [{ DeleteRequest: { Key: keys[0]! } }];
    const { client, batches } = fakeClient(keys, [leftover]);

    const done = clearBusinesses(client, 't', ['shop']);
    await vi.runAllTimersAsync();
    await done;

    expect(batches.map(b => b.length)).toEqual([25, 1, 5]);
    expect(batches[1]).toEqual(leftover);
  });

  it('gives up with a clear error if DynamoDB never processes the batch', async () => {
    vi.useFakeTimers();
    const keys = [key('META')];
    const stuck: WriteRequest[] = [{ DeleteRequest: { Key: keys[0]! } }];
    const { client, batches } = fakeClient(keys, Array.from({ length: 50 }, () => stuck));

    const done = expect(clearBusinesses(client, 't', ['shop'])).rejects.toThrow(/1 deletes were left unprocessed .* after \d+ attempts/);
    await vi.runAllTimersAsync();
    await done;
    expect(batches.length).toBeGreaterThan(1);
    expect(batches.length).toBeLessThan(50);
  });
});
