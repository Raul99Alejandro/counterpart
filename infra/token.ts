import { randomBytes } from 'node:crypto';
import {
  CreateSecretCommand, PutSecretValueCommand, ResourceExistsException, type SecretsManagerClient
} from '@aws-sdk/client-secrets-manager';
import { hashToken } from '../src/http/auth.js';
import type { Store } from '../src/store/store.js';

export interface IssueDeps {
  store: Store;
  random?: () => string;
  putSecret?: (name: string, value: string) => Promise<void>;
}

/** Where the bridge reads the token from (BRIDGE_MCP_SECRET_NAME). */
export function secretNameFor(bizId: string): string {
  return `counterpart/${bizId}/token`;
}

/** Issues a token: the table keeps only its hash; with putSecret, the value goes to the business's secret. */
export async function issueToken(deps: IssueDeps, bizId: string): Promise<{ token: string; secretName?: string }> {
  if (!(await deps.store.getBusiness(bizId))) throw new Error(`Business "${bizId}" does not exist.`);
  const token = (deps.random ?? (() => randomBytes(32).toString('base64url')))();
  await deps.store.putToken(hashToken(token), bizId);
  if (!deps.putSecret) return { token };
  const secretName = secretNameFor(bizId);
  await deps.putSecret(secretName, token);
  return { token, secretName };
}

/** Creates the secret or, if it already exists, sets a new value. */
export function secretsManagerWriter(client: SecretsManagerClient): (name: string, value: string) => Promise<void> {
  return async (name, value) => {
    try {
      await client.send(new CreateSecretCommand({ Name: name, SecretString: value }));
    } catch (err) {
      if (!(err instanceof ResourceExistsException)) throw err;
      await client.send(new PutSecretValueCommand({ SecretId: name, SecretString: value }));
    }
  };
}
