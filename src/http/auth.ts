import { createHash } from 'node:crypto';
import type { Business } from '../domain/types.js';
import type { Store } from '../store/store.js';

/** SHA-256 hash in hex. Only this is stored or logged; never the plain token. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Extracts the token from an "Authorization: Bearer <token>" header (case-insensitive). */
export function bearerFrom(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1]!.trim() : null;
}

/** Resolves the business that owns a token, if any. */
export async function businessFor(store: Store, token: string): Promise<Business | null> {
  return store.getBusinessByTokenHash(hashToken(token));
}
