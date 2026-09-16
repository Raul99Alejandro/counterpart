import { describe, expect, it } from 'vitest';
import { storeConfig } from '../../src/store/from-env.js';

describe('configuración del store', () => {
  it('usa memoria por defecto', () => {
    expect(storeConfig({})).toEqual({ kind: 'memory', table: 'counterpart', region: 'us-east-1', endpoint: undefined });
  });

  it('lee la configuración de DynamoDB', () => {
    expect(storeConfig({
      COUNTERPART_STORE: 'dynamo', DYNAMODB_TABLE: 'demo', AWS_REGION: 'us-west-2', DYNAMODB_ENDPOINT: 'http://localhost:8000'
    })).toEqual({ kind: 'dynamo', table: 'demo', region: 'us-west-2', endpoint: 'http://localhost:8000' });
  });

  it('trata las cadenas vacías como no definidas', () => {
    expect(storeConfig({ COUNTERPART_STORE: 'dynamo', DYNAMODB_TABLE: '', DYNAMODB_ENDPOINT: '' }))
      .toEqual({ kind: 'dynamo', table: 'counterpart', region: 'us-east-1', endpoint: undefined });
  });

  it('rechaza un tipo de store desconocido', () => {
    expect(() => storeConfig({ COUNTERPART_STORE: 'postgres' })).toThrow(/COUNTERPART_STORE/);
  });

  describe('en producción', () => {
    it('no arranca en memoria si falta COUNTERPART_STORE', () => {
      expect(() => storeConfig({ NODE_ENV: 'production' })).toThrow(/COUNTERPART_STORE=dynamo/);
    });

    it('no arranca en memoria aunque se pida explícitamente', () => {
      expect(() => storeConfig({ NODE_ENV: 'production', COUNTERPART_STORE: 'memory' })).toThrow(/COUNTERPART_STORE=dynamo/);
    });

    it('acepta DynamoDB', () => {
      expect(storeConfig({ NODE_ENV: 'production', COUNTERPART_STORE: 'dynamo' }))
        .toEqual({ kind: 'dynamo', table: 'counterpart', region: 'us-east-1', endpoint: undefined });
    });
  });

  it('fuera de producción sigue usando memoria por defecto', () => {
    expect(storeConfig({ NODE_ENV: 'development' }).kind).toBe('memory');
    expect(storeConfig({ NODE_ENV: 'test' }).kind).toBe('memory');
  });
});
