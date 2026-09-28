import type { Business } from '../src/domain/types.js';
import type { Store } from '../src/store/store.js';
import type { BusinessPackage } from './package.js';
import { seedPackage } from './run.js';

/** Siembra un paquete como negocio nuevo. No pisa uno existente: para eso está --reset en la CLI. */
export async function addBusiness(store: Store, pkg: BusinessPackage, now: Date): Promise<void> {
  if (await store.getBusiness(pkg.id)) {
    throw new Error(`Ya existe el negocio "${pkg.id}". Para volver a sembrarlo usa --reset.`);
  }
  await seedPackage(store, pkg, now);
}

export interface BlankInput { id: string; name: string; timezone?: string; taxRateBps?: number }

/** Un negocio en blanco: solo expone las tools de alta hasta que el asistente lo configura (spec B2 §5.2). */
export async function newBlankBusiness(store: Store, input: BlankInput): Promise<Business> {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(input.id)) {
    throw new Error(`El id "${input.id}" no sirve: usa minúsculas, dígitos y guiones.`);
  }
  if (await store.getBusiness(input.id)) {
    throw new Error(`Ya existe el negocio "${input.id}". Para dejarlo en blanco otra vez usa --reset.`);
  }
  const business: Business = {
    id: input.id, name: input.name, status: 'blank', profileVersion: 0,
    timezone: input.timezone ?? 'America/Chicago', taxRateBps: input.taxRateBps ?? 825,
    nextOrderNumber: 1, version: 1
  };
  await store.putBusiness(business);
  return business;
}
