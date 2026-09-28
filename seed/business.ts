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
