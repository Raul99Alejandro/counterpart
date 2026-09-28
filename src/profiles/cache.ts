import type { Business } from '../domain/types.js';
import type { Store } from '../store/store.js';
import { parseProfile } from './load.js';
import type { Profile } from './schema.js';

/**
 * Perfil de cada negocio, leído del store y cacheado por `profileVersion` (spec B2 §5.1).
 * Cierra la deuda de B1 de leer y parsear el YAML en cada petición.
 */
export class ProfileCache {
  private readonly entries = new Map<string, { version: number; profile: Profile }>();

  constructor(private readonly store: Store) {}

  async forBusiness(business: Business): Promise<Profile> {
    if (business.status !== 'active') throw new Error(`business ${business.id} is blank; it has no profile yet`);
    const cached = this.entries.get(business.id);
    if (cached && cached.version === business.profileVersion) return cached.profile;

    const record = await this.store.getProfile(business.id);
    if (!record) throw new Error(`business ${business.id} has no saved profile`);
    const profile = parseProfile(record.profile);
    this.entries.set(business.id, { version: business.profileVersion, profile });
    return profile;
  }
}
