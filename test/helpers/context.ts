import { ProfileCache } from '../../src/profiles/cache.js';
import type { Store } from '../../src/store/store.js';
import type { ToolContext } from '../../src/tools/context.js';

/** ToolContext de un negocio sembrado, con el perfil leído del store como en el servidor. */
export async function toolContext(
  store: Store, bizId: string, opts: { now: () => Date; newId: (prefix: string) => string }
): Promise<ToolContext> {
  const business = await store.getBusiness(bizId);
  if (!business) throw new Error(`no existe el negocio ${bizId}`);
  return { business, profile: await new ProfileCache(store).forBusiness(business), store, ...opts };
}
