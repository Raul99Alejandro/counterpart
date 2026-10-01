import { randomBytes } from 'node:crypto';
import path from 'node:path';
import type { Store } from '../store/store.js';
import { hashToken } from '../http/auth.js';
import { newBlankBusiness } from '../../seed/business.js';
import { loadPackage } from '../../seed/package.js';
import { PACKAGES_DIR, seedPackage } from '../../seed/run.js';

export { SANDBOX_TTL_MS, sandboxExpired } from './expiry.js';
import { SANDBOX_TTL_MS } from './expiry.js';

export type SandboxKind = 'shop' | 'bakery' | 'blank';

export interface Sandbox {
  expiresAt: string;
  businesses: Array<{ kind: SandboxKind; name: string; token: string }>;
}

/**
 * One visitor's own copy of the demo: the auto shop and the bakery seeded from their packages, and a
 * blank business to set up by voice. Ids carry the creation time (`demo-<epoch36>-<rand>-<kind>`),
 * so expiry needs no extra record.
 */
export async function createSandbox(store: Store, now: Date = new Date()): Promise<Sandbox> {
  const base = `demo-${now.getTime().toString(36)}-${randomBytes(4).toString('hex')}`;
  const businesses: Sandbox['businesses'] = [];

  for (const kind of ['shop', 'bakery'] as const) {
    const pkg = { ...loadPackage(path.join(PACKAGES_DIR, kind)), id: `${base}-${kind}` };
    await seedPackage(store, pkg, now);
    businesses.push({ kind, name: pkg.name, token: await issue(store, pkg.id) });
  }
  const blank = await newBlankBusiness(store, { id: `${base}-florist`, name: 'Petal and Stem' });
  businesses.push({ kind: 'blank', name: blank.name, token: await issue(store, blank.id) });

  return { expiresAt: new Date(now.getTime() + SANDBOX_TTL_MS).toISOString(), businesses };
}

async function issue(store: Store, businessId: string): Promise<string> {
  const token = `demo_${randomBytes(18).toString('base64url')}`;
  await store.putToken(hashToken(token), businessId);
  return token;
}
