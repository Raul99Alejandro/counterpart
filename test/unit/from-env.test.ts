import { describe, expect, it } from 'vitest';
import { storeConfig } from '../../src/store/from-env.js';

describe('store configuration', () => {
  it('uses memory by default', () => {
    expect(storeConfig({})).toEqual({ kind: 'memory', table: 'counterpart', region: 'us-east-1', endpoint: undefined });
  });

  it('reads the DynamoDB configuration', () => {
    expect(storeConfig({
      COUNTERPART_STORE: 'dynamo', DYNAMODB_TABLE: 'demo', AWS_REGION: 'us-west-2', DYNAMODB_ENDPOINT: 'http://localhost:8000'
    })).toEqual({ kind: 'dynamo', table: 'demo', region: 'us-west-2', endpoint: 'http://localhost:8000' });
  });

  it('treats empty strings as unset', () => {
    expect(storeConfig({ COUNTERPART_STORE: 'dynamo', DYNAMODB_TABLE: '', DYNAMODB_ENDPOINT: '' }))
      .toEqual({ kind: 'dynamo', table: 'counterpart', region: 'us-east-1', endpoint: undefined });
  });

  it('rejects an unknown store kind', () => {
    expect(() => storeConfig({ COUNTERPART_STORE: 'postgres' })).toThrow(/COUNTERPART_STORE/);
  });

  describe('in production', () => {
    it('does not start in memory when COUNTERPART_STORE is missing', () => {
      expect(() => storeConfig({ NODE_ENV: 'production' })).toThrow(/COUNTERPART_STORE=dynamo/);
    });

    it('does not start in memory even when explicitly asked', () => {
      expect(() => storeConfig({ NODE_ENV: 'production', COUNTERPART_STORE: 'memory' })).toThrow(/COUNTERPART_STORE=dynamo/);
    });

    it('accepts DynamoDB', () => {
      expect(storeConfig({ NODE_ENV: 'production', COUNTERPART_STORE: 'dynamo' }))
        .toEqual({ kind: 'dynamo', table: 'counterpart', region: 'us-east-1', endpoint: undefined });
    });
  });

  it('outside production it still uses memory by default', () => {
    expect(storeConfig({ NODE_ENV: 'development' }).kind).toBe('memory');
    expect(storeConfig({ NODE_ENV: 'test' }).kind).toBe('memory');
  });
});
