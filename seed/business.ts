import type { Business } from '../src/domain/types.js';
import type { Store } from '../src/store/store.js';
import type { BusinessPackage } from './package.js';
import { seedPackage } from './run.js';

/** Seeds a package as a new business. Never overwrites an existing one: the CLI's --reset is for that. */
export async function addBusiness(store: Store, pkg: BusinessPackage, now: Date): Promise<void> {
  if (await store.getBusiness(pkg.id)) {
    throw new Error(`Business "${pkg.id}" already exists. To seed it again, use --reset.`);
  }
  await seedPackage(store, pkg, now);
}

export interface BlankInput { id: string; name: string; timezone?: string; taxRateBps?: number }

/** A blank business: it only exposes the setup tools until the assistant configures it (spec B2 §5.2). */
export async function newBlankBusiness(store: Store, input: BlankInput): Promise<Business> {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(input.id)) {
    throw new Error(`The id "${input.id}" is invalid: use lowercase letters, digits and hyphens.`);
  }
  if (await store.getBusiness(input.id)) {
    throw new Error(`Business "${input.id}" already exists. To make it blank again, use --reset.`);
  }
  const business: Business = {
    id: input.id, name: input.name, status: 'blank', profileVersion: 0,
    timezone: input.timezone ?? 'America/Chicago', taxRateBps: input.taxRateBps ?? 825,
    nextOrderNumber: 1, version: 1
  };
  await store.putBusiness(business);
  return business;
}
